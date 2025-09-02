// src/services/ixcStatusService.js
// Reaproveita a mesma lógica do ClientesDoVendedorModal, mas agora como serviço compartilhado.

const IXC_CLIENTE_API  = "https://ixc-buscar-clientes.api.webserver.app.br/clientes";
const IXC_CONTRATO_API = "https://ixc-buscar-contratos.api.webserver.app.br/contratos";
const IXC_TITULO_API   = "https://ixc-buscar-titulo.api.webserver.app.br/titulos/abertos-recebidos";
const IXC_ORDENS_API   = "https://ixc-buscar-ordens.api.webserver.app.br/ordens";

// depende do seu projeto:
import { upsertCpfStatusByCpf, formatDoc } from "@/services/nocodbVendedores";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const moneyEq = (a, b) => Math.round(parseFloat(a || "0") * 100) === Math.round(parseFloat(b || "0") * 100);
const parseIsoDateSafe = (s) => {
  if (!s) return 0;
  const d = new Date(String(s).trim().replace(" ", "T"));
  return isNaN(+d) ? 0 : +d;
};

async function getClienteByNome(nome, cpfPossivel) {
  const base = IXC_CLIENTE_API;
  const cleanNome = String(nome || "").trim().replace(/\s+/g, " ");
  const cpfDigits = onlyDigits(cpfPossivel);
  const urls = [];

  if (cpfDigits.length === 11 || cpfDigits.length === 14) {
    urls.push(`${base}?nome=${encodeURIComponent(cpfDigits)}&field=cpf`);
  }
  if (cleanNome) {
    urls.push(`${base}?nome=${encodeURIComponent(cleanNome)}&field=razao&oper==`);
    urls.push(`${base}?nome=${encodeURIComponent(cleanNome)}&field=razao&oper=like`);
    urls.push(`${base}?nome=${encodeURIComponent(cleanNome)}&field=nome&oper=like`);
  }

  for (const url of urls) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) continue;
    const j = await r.json();
    const items = Array.isArray(j?.items) ? j.items : Array.isArray(j?.data) ? j.data : [];
    const hit = items.find((it) => it?.id);
    if (hit) return { id: String(hit.id), razao: String(hit.razao || hit.nome || "").trim(), _raw: hit };
  }
  const err = new Error("CLIENTE_NOT_FOUND");
  err.code = "CLIENTE_NOT_FOUND";
  throw err;
}

async function getContratosByClienteId(clienteId) {
  const url = `${IXC_CONTRATO_API}?clienteId=${encodeURIComponent(clienteId)}&raw=0`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar contratos: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

const pickContratoPreferido = (items) => items.find((c) => c?.status === "A") || items[0] || null;

async function getTitulosAbertosRecebidos(clienteId) {
  const url = `${IXC_TITULO_API}?clienteId=${encodeURIComponent(clienteId)}&labels=1&raw=0`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar títulos: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

/**
 * Fallback quando há renegociação:
 * - Procura R (recebido) mesmo valor, titulo_renegociado === "S" e id_saida !== "0"
 * - Se depois disso existir A (aberto) com id_saida === "0" e atualização mais nova, retorna "NAO"
 * - Caso contrário, "SIM"
 * - Se não houver base, retorna null
 */
function fallbackPagouTaxaComRenegociacao(titulos, taxaValor) {
  const recebidos100 = titulos.filter(
    (t) =>
      t?.status === "R" &&
      moneyEq(t?.valor, taxaValor) &&
      String(t?._raw?.titulo_renegociado || "").toUpperCase() === "S" &&
      String(t?._raw?.id_saida || "") !== "0"
  );
  if (!recebidos100.length) return null;

  const recebidoMaisRecente =
    recebidos100
      .map((t) => ({ t, ua: parseIsoDateSafe(t?._raw?.ultima_atualizacao) }))
      .sort((a, b) => b.ua - a.ua)[0]?.t || null;
  if (!recebidoMaisRecente) return null;

  const uaRecebido = parseIsoDateSafe(
    recebidoMaisRecente?._raw?.ultima_atualizacao || recebidoMaisRecente?._raw?.baixa_data
  );

  const abertoMaisNovo = titulos.some((t) => {
    if (t?.status !== "A") return false;
    if (String(t?._raw?.id_saida || "") !== "0") return false;
    const ua = parseIsoDateSafe(t?._raw?.ultima_atualizacao);
    return ua > uaRecebido;
  });

  return abertoMaisNovo ? "NAO" : "SIM";
}

async function getOrdensByClienteId(clienteId) {
  const url = `${IXC_ORDENS_API}/cliente/${encodeURIComponent(clienteId)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao buscar ordens: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

const isAltTitularidade = (os) => {
  const msg = `${os?.mensagem || ""} ${os?._raw?.mensagem || ""}`.toLowerCase();
  const assuntoId = String(os?.id_assunto || "").trim();
  if (assuntoId === "14") return true; // ajuste se necessário
  return msg.includes("alteração de titularidade") || msg.includes("alteracao de titularidade");
};

function parseTitularAnterior(os) {
  const raw = String(os?.mensagem || os?._raw?.mensagem || "");
  const out = { nome: null, doc: null, obs: null };
  const nomeMatch = raw.match(/Antigo cliente:\s*(.+)\r?\n/i);
  const cpfMatch  = raw.match(/CPF:\s*([\d.\-\/]+)/i);
  if (nomeMatch) out.nome = nomeMatch[1].trim();
  if (cpfMatch)  out.doc  = cpfMatch[1].trim();
  out.obs = raw.trim() || null;
  return out;
}

// --------- CÁLCULO DE STATUS (1 CPF/NOME) ----------
export async function calcularStatusViaIXC({ nome, cpf }) {
  const { id: clienteId } = await getClienteByNome(nome, cpf);

  const contratos = await getContratosByClienteId(clienteId);
  if (!contratos.length) throw new Error("SEM_CONTRATO");
  const contrato = pickContratoPreferido(contratos);
  if (!contrato) throw new Error("SEM_CONTRATO");

  const taxa = String(contrato?.taxa_instalacao ?? "0.00");
  const isAtivoContrato = contrato?.status === "A";
  const si = contrato?.status_internet; // "A" | "D" | "CM" | "CA" | "FA" | "AA"
  const isBloqueado = si !== "A";

  let PagouTaxa = "NAO";
  let Ativado   = isAtivoContrato ? "SIM" : "NAO";
  let Bloqueado = isBloqueado ? "SIM" : "NAO";
  let Desistiu  = "NAO";
  let Autorizado = null;
  let SemTaxa   = parseFloat(taxa) === 0 ? "SIM" : "NAO";

  if (parseFloat(taxa) > 0) {
    const titulos = await getTitulosAbertosRecebidos(clienteId);
    const tituloRecebido = titulos.find((t) => t?.status === "R" && moneyEq(t?.valor, taxa));
    const tituloAberto   = titulos.find((t) => t?.status === "A" && moneyEq(t?.valor, taxa));

    if (tituloRecebido) {
      const fb = fallbackPagouTaxaComRenegociacao(titulos, taxa);
      PagouTaxa = fb ?? "SIM";
    } else {
      const fb = fallbackPagouTaxaComRenegociacao(titulos, taxa);
      PagouTaxa = fb ?? (tituloAberto ? "NAO" : "NAO");
    }
  }

  if (Bloqueado === "SIM") {
    Autorizado = "NEGADO";
  } else if (SemTaxa === "SIM" && Ativado === "SIM") {
    Autorizado = "SEM TAXA";
  } else if (Ativado === "SIM" && PagouTaxa === "SIM") {
    Autorizado = "APROVADO";
  } else {
    Autorizado = null;
  }

  // Alteração de titularidade (opcional)
  let AlterarTit = "NAO";
  let TitAnteriorNome = null;
  let TitAnteriorDoc  = null;
  let TitAnteriorObs  = null;
  try {
    const ordens = await getOrdensByClienteId(clienteId);
    const osAlt = ordens
      .filter(isAltTitularidade)
      .sort((a, b) => (new Date(b?.data_abertura || 0)) - (new Date(a?.data_abertura || 0)))[0];
    if (osAlt) {
      AlterarTit = "SIM";
      const parsed = parseTitularAnterior(osAlt);
      TitAnteriorNome = parsed.nome;
      TitAnteriorDoc  = parsed.doc;
      TitAnteriorObs  = parsed.obs;
    }
  } catch (e) {
    // silencioso
  }

  return {
    "Alterar Titularidade": AlterarTit,
    "Titular Anterior Nome": TitAnteriorNome,
    "Titular Anterior Documento": TitAnteriorDoc,
    "Titular Anterior Obs": TitAnteriorObs,

    "Pagou Taxa": PagouTaxa,
    "Ativado": Ativado,
    "Bloqueado": Bloqueado,
    "Desistiu": Desistiu,
    "Autorizado": Autorizado,
    "Sem Taxa": SemTaxa,
  };
}

// --------- LOTE (para um período/coleção de vendas) ----------
/**
 * syncStatusLoteViaIXC:
 * - recebe vendas e deduplica por CPF (fica o mais recente)
 * - calcula status via IXC
 * - grava no NocoDB com o vendedor daquela venda
 * - retorna resumo + mapa por CPF (formatDoc) para você mesclar na UI
 */
export async function syncStatusLoteViaIXC({ vendas = [], vendedorPadrao = "Outros" }) {
  // normalizador blindado para chaves de vendedor / nomes
  const norm = (s) => String(s ?? "")
    .normalize("NFD")                 // separa acentos
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[^a-zA-Z0-9]+/g, " ")   // troca qualquer separador por espaço
    .trim()
    .replace(/\s+/g, " ")             // colapsa múltiplos espaços
    .toLowerCase();


  const getVendedor = (v) => v?.__vendedorNome || v?.vendedor || v?.vendedorNome || v?.Vendedor || vendedorPadrao;
  const getNome     = (v) => v?.nome || v?.cliente || v?.Cliente || v?.Nome || "—";
  const getCpfRaw   = (v) =>
    v?.cpf || v?.CPF || v?.documento || v?.doc || v?.cpfCliente || v?.cpf_cliente || "";

  // dedup por CPF (mantém o mais novo se você tiver data; aqui mantemos o primeiro)
  const map = new Map(); // cpfKey -> { nome, cpf, vendedor }
  for (const v of vendas) {
    const cpfRaw = String(getCpfRaw(v));
    const cpfKey = formatDoc?.(cpfRaw) || onlyDigits(cpfRaw);
    if (!cpfKey) continue;
    if (!map.has(cpfKey)) {
      map.set(cpfKey, { nome: getNome(v), cpf: cpfRaw, vendedor: getVendedor(v) });
    }
  }

  const targets = [...map.entries()].map(([cpfKey, obj]) => ({ cpfKey, ...obj }));
  const results = { ok: 0, notFound: 0, errors: 0, total: targets.length, changedDocs: [], byCpf: {} };
  const CONCURRENCY = 4;
  const pool = [];

  const runOne = async (t) => {
    try {
      const status = await calcularStatusViaIXC({ nome: t.nome, cpf: t.cpf });
      await upsertCpfStatusByCpf(t.cpfKey, status, t.vendedor || vendedorPadrao);
      results.ok += 1;
      results.changedDocs.push(t.cpfKey);
      results.byCpf[t.cpfKey] = status;
    } catch (e) {
      if (e?.code === "CLIENTE_NOT_FOUND") {
        results.notFound += 1;
      } else {
        console.error("[syncStatusLoteViaIXC] erro:", e);
        results.errors += 1;
      }
    }
  };

  for (const t of targets) {
    const p = runOne(t).finally(() => {
      const i = pool.indexOf(p);
      if (i >= 0) pool.splice(i, 1);
    });
    pool.push(p);
    if (pool.length >= CONCURRENCY) await Promise.race(pool);
  }
  await Promise.all(pool);

  return results;
}
