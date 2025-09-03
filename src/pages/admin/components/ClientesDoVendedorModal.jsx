// components/ClientesDoVendedorModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X as XIcon, Users, Eye, ArrowLeftRight } from "lucide-react";
import DetalheVendaModal from "./DetalheVendaModal";
import { useUI } from "../../../state/ThemeContext";
import dayjs from "../../../utils/dayjs";
import {
  getVendedorRowByName,
  parseDadosJson,
  readCpfStatus,
  formatDoc,
  upsertCpfStatusByCpf
} from "../../../services/nocodbVendedores";
import TransferirVendaModal from "./TransferirVendaModal"; // <-- novo
import { withinRangeLocal, parseAnyDate } from "@/utils/dateRange";

import AtendStatusBadge from "./ixc/Badge/AtendStatusBadge";
import { fetchStatusCatalog, fetchUltimoSuStatusByClienteId } from "../../../services/ixcAtendimentos";
import AtendimentosModal from "./ixc/modais/AtendimentosModal";


import { onDev, emitDev } from "../../../dev/commandBus";

// ENDPOINTS IXC (mesmos do EditarStatusClienteModal)
const IXC_CLIENTE_API  = "https://ixc-buscar-clientes.api.webserver.app.br/clientes";
const IXC_CONTRATO_API = "https://ixc-buscar-contratos.api.webserver.app.br/contratos";
const IXC_TITULO_API   = "https://ixc-buscar-titulo.api.webserver.app.br/titulos/abertos-recebidos";
const IXC_ORDENS_API  =  "https://ixc-buscar-ordens.api.webserver.app.br/ordens";



const IXC_DEBUG = false; // liga/desliga logs

async function debugFetch(url, opts) {
  if (IXC_DEBUG) console.log("[IXC] =>", url, opts || {});
  const r = await fetch(url, { cache: "no-store", ...(opts || {}) });
  const clone = r.clone();
  let body = null;
  try { body = await clone.json(); } catch {}
  if (IXC_DEBUG) console.log("[IXC] <=", r.status, url, body);
  return r;
}

async function patchCpfStatusIfChanged(cpfKey, nextStatus, vendedorAtual = "Outros") {
 try {
   const existing = await readCpfStatus(cpfKey).catch(() => null); // { status, vendedor, ... } | null
   const before = existing?.status ? JSON.stringify(existing.status) : null;
   const after  = nextStatus ? JSON.stringify(nextStatus) : null;
   const changed = before !== after;
   if (changed) {
     await upsertCpfStatusByCpf(cpfKey, nextStatus, vendedorAtual);
   }
   return { changed, before: existing?.status ?? null, after: nextStatus };
 } catch (e) {
   // propaga para o caller lidar no contador de erros
   throw e;
 }
}



const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const maskCpf = (s) => {
  const d = onlyDigits(s);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return s || "—";
};
// get seguro: pega o primeiro campo existente
const get = (o, ...ks) => {
  for (const k of ks) if (o && o[k] != null) return o[k];
  return undefined;
};

// ===== IXC HELPERS =====
function moneyEq(a, b) {
  const pa = Math.round(parseFloat(a || "0") * 100);
  const pb = Math.round(parseFloat(b || "0") * 100);
  return pa === pb;
}

async function getClienteByNome(nome, cpfPossivel) {
  const base = IXC_CLIENTE_API;
  const cleanNome = String(nome || "").trim().replace(/\s+/g, " ");
  const only = (s) => String(s || "").replace(/\D+/g, "");
  const cpfDigits = only(cpfPossivel);
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
    const r = await debugFetch(url);
    if (!r.ok) continue;
    const j = await r.json();
    const items = Array.isArray(j?.items) ? j.items : Array.isArray(j?.data) ? j.data : [];
    const hit = items.find((it) => it?.id);
    if (hit) {
      return { id: String(hit.id), razao: String(hit.razao || hit.nome || "").trim(), _raw: hit };
    }
  }
  const err = new Error("CLIENTE_NOT_FOUND");
  err.code = "CLIENTE_NOT_FOUND";
  throw err;
}

async function getContratosByClienteId(clienteId) {
  const url = `${IXC_CONTRATO_API}?clienteId=${encodeURIComponent(clienteId)}&raw=0`;
  const r = await debugFetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar contratos: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

function pickContratoPreferido(items) {
  return items.find((c) => c?.status === "A") || items[0] || null; // prioriza 'A'
}

function parseIsoDateSafe(s) {
  if (!s) return 0;
  const t = String(s).trim().replace(" ", "T");
  const d = new Date(t);
  return isNaN(+d) ? 0 : +d;
}

/**
 * Fallback da taxa paga quando NÃO achamos de cara um título R do valor da taxa:
 * - pega o último RECEBIDO (status "R") de mesmo valor, com _raw.titulo_renegociado === "S" e _raw.id_saida !== "0"
 * - se existir ABERTO (status "A") com _raw.id_saida === "0" e _raw.ultima_atualizacao mais nova, retorna "NAO"
 * - senão, retorna "SIM"
 * - se não houver base p/ decidir, retorna null
 */
function fallbackPagouTaxaComRenegociacao(titulos, taxaValor) {
  const equalsTaxa = (v) => moneyEq(v, taxaValor);

  const recebidos100 = titulos.filter(
    (t) =>
      t?.status === "R" &&
      equalsTaxa(t?.valor) &&
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



async function getTitulosAbertosRecebidos(clienteId) {
  const url = `${IXC_TITULO_API}?clienteId=${encodeURIComponent(clienteId)}&labels=1&raw=0`;
  const r = await debugFetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar títulos: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}



async function getOrdensByClienteId(clienteId) {
  const url = `${IXC_ORDENS_API}/cliente/${encodeURIComponent(clienteId)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao buscar ordens: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

// Heurística para identificar OS de Alteração de Titularidade
function isAltTitularidade(os) {
  const msg = `${os?.mensagem || ""} ${os?._raw?.mensagem || ""}`.toLowerCase();
  const assuntoId = String(os?.id_assunto || "").trim();
  // 1) se a sua base usar id_assunto fixo (ex.: 14), mantenha:
  if (assuntoId === "14") return true;
  // 2) fallback por texto
  return msg.includes("alteração de titularidade") || msg.includes("alteracao de titularidade");
}

// Extrai “Titular Anterior Nome” e “Titular Anterior Documento” da mensagem
function parseTitularAnterior(os) {
  const raw = String(os?.mensagem || os?._raw?.mensagem || "");
  const out = { nome: null, doc: null, obs: null };

  // Exemplos:
  // "Alteração de TItularidade:\r\n\r\nAntigo cliente: Alessandra Gerhardt Blasig\r\nCPF: 135.784.977-03\r\n\r\n"
  const nomeMatch = raw.match(/Antigo cliente:\s*(.+)\r?\n/i);
  const cpfMatch  = raw.match(/CPF:\s*([\d.\-\/]+)/i);

  if (nomeMatch) out.nome = nomeMatch[1].trim();
  if (cpfMatch)  out.doc  = cpfMatch[1].trim();
  // se quiser salvar o corpo todo como observação:
  out.obs = raw.trim() || null;

  return out;
}

async function calcularStatusViaIXC({ nome, cpf }) {
  // 1) cliente
  const cliente = await getClienteByNome(nome, cpf); 
  const clienteId = cliente?.id; 
  const ativoFlag = String(cliente?._raw?.ativo || "").toUpperCase(); // "S" | "N" 

  // 2) contratos
  const contratos = await getContratosByClienteId(clienteId);
  if (!contratos.length) throw new Error("SEM_CONTRATO");
  const contrato = pickContratoPreferido(contratos);
  if (!contrato) throw new Error("SEM_CONTRATO");

  // 3) regras de comissão/ativação/bloqueio/taxa
    const taxa = String(contrato?.taxa_instalacao ?? "0.00");
    const statusContrato = String(contrato?.status || "").toUpperCase(); // P|A|I|N|D
    const si = String(contrato?.status_internet || "").toUpperCase();     // "A" | "D" | "CM" | ...

    let PagouTaxa  = "NAO";
    let Ativado    = "NAO";
    let Bloqueado  = "NAO";
    let Desistiu   = "NAO";
    let Autorizado = null;
    const SemTaxa  = parseFloat(taxa) === 0 ? "SIM" : "NAO";

    // Base: decidir por status do CONTRATO (quando cliente.ativo n├úo ajuda)
    // P = Pr├®-contrato -> n├úo ativo, n├úo bloqueado
    // A = Ativo        -> ativo, bloqueio depende do status_internet != "A"
    // I = Inativo      -> n├úo ativo (exibe "N├úo ativo")
    // N = Negativado   -> tratamos como bloqueado
    // D = Desistiu     -> desistiu (sobrep├Áe os demais)
    if (statusContrato === "A") {
      Ativado   = "SIM";
      Bloqueado = si !== "A" ? "SIM" : "NAO";
    } else if (statusContrato === "I" || statusContrato === "P") {
      // N├úo ativo (pr├®-contrato tamb├®m cai aqui)
      Ativado   = "NAO";
      Bloqueado = "NAO";
    } else if (statusContrato === "N") {
      // Negativado = n├úo ativo e bloqueado
      Ativado   = "NAO";
      Bloqueado = "SIM";
    } else if (statusContrato === "D") {
      // Desistiu vence qualquer outra interpreta├º├úo
      Desistiu  = "SIM";
      Ativado   = "NAO";
      Bloqueado = "NAO";
    }

    // Se o cadastro do cliente veio explicitamente inativo, for├ºa ÔÇ£N├úo AtivoÔÇØ.
    // (quando vier undefined, ficamos s├│ com a decis├úo do contrato acima)
    const NaoAtivo = ativoFlag === "N" || (statusContrato === "I" || statusContrato === "P") ? "SIM" : "NAO";

    // Se n├úo est├í ativo, n├úo chamar de ÔÇ£BloqueadoÔÇØ (fica ÔÇ£N├úo ativoÔÇØ/ÔÇ£DesistiuÔÇØ)
    if (Ativado !== "SIM") {
      Bloqueado = "NAO";
      }


  // ⬇⬇⬇ 1) titulos no escopo da função
  let titulos = [];

  if (parseFloat(taxa) > 0) {
    // continua igual, só tirou o "const"
    titulos = await getTitulosAbertosRecebidos(clienteId);

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
  


  // prioridade das saídas de Autorizado
    // prioridade das saídas de Autorizado (inclui Desistiu) 
  if (Desistiu === "SIM") { 
    Autorizado = "NEGADO"; 
  } else if (Bloqueado === "SIM") 
    {
    Autorizado = "NEGADO";
  } else if (SemTaxa === "SIM" && Ativado === "SIM") {
    Autorizado = "SEM TAXA";
  } else if (Ativado === "SIM" && PagouTaxa === "SIM") {
    Autorizado = "APROVADO";
  } else {
    Autorizado = null;
  }

  // 4) >>> NOVO: checar ordens de Alteração de Titularidade
  let AlterarTit = "NAO";
  let TitAnteriorNome = null;
  let TitAnteriorDoc  = null;
  let TitAnteriorObs  = null;

  try {
    const ordens = await getOrdensByClienteId(clienteId);
    // pegue a ordem mais recente que seja de alteração de titularidade
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
    // se der erro na API de ordens, não bloqueia o resto do cálculo
    console.warn("[calcularStatusViaIXC] falha ao buscar ordens:", e);
  }

  // 5) objeto final p/ gravar no NocoDB
  const toSave = {
    "Alterar Titularidade": AlterarTit,
    "Titular Anterior Nome": TitAnteriorNome,
    "Titular Anterior Documento": TitAnteriorDoc,
    "Titular Anterior Obs": TitAnteriorObs,

    "Não Ativo": NaoAtivo,
    "Pagou Taxa": PagouTaxa,
    "Ativado": Ativado,
    "Bloqueado": Bloqueado,
    "Desistiu": Desistiu,
    "Autorizado": Autorizado,
    "Sem Taxa": SemTaxa,
  };

  if (IXC_DEBUG) {
  console.log("[IXC] cliente", clienteId, { ativo: cliente?._raw?.ativo, nome: cliente?.razao });
  console.log("[IXC] contrato", { status: contrato?.status, status_internet: contrato?.status_internet, taxa });
  console.log("[IXC] titulos.len", titulos?.length, "PagouTaxa=", PagouTaxa);
  console.log("[IXC] titularidade", { AlterarTit, TitAnteriorNome, TitAnteriorDoc });
  console.log("[IXC] FINAL toSave", toSave);
}


  return toSave;
}


const norm = (v) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();


    // é transferência se campo marcado ou se qualquer dado do titular anterior estiver presente
function isTransferenciaStatus(s = {}) {
  const a = norm(s['Alterar Titularidade']);
  return (
    a === 'sim' ||
    !!s['Titular Anterior Nome'] ||
    !!s['Titular Anterior Documento'] ||
    !!s['Titular Anterior Obs']
  );
}

// todos os campos de status estão nulos/vazios
function isAllNullStatus(s = {}) {
  const keys = ['Pagou Taxa', 'Ativado', 'Bloqueado', 'Desistiu', 'Autorizado'];
  return keys.every((k) => s[k] == null || s[k] === '');
}

function resumirStatus(statusObj = {}) {
  // prioridade: transferência
  if (isTransferenciaStatus(statusObj)) {
    return { label: "Alteração de Titularidade", tone: "indigo", icon: "transfer" };
  }

    // prioridade: cadastro IXC inativo 
  const naoAtivo = norm(statusObj["Não Ativo"] ?? statusObj["Nao Ativo"]) === "sim";

  if (naoAtivo) { 
    return { label: "Não ativo", tone: "zinc" }; 
  }

  // se não for transferência e todos os campos estiverem nulos, não pendencia
  if (isAllNullStatus(statusObj)) {
    return { label: "—", tone: "zinc", empty: true };
  }

  // lógica normal
  const pagou     = norm(statusObj["Pagou Taxa"]) === "sim";
  const semTaxa   = norm(statusObj["Sem Taxa"] ?? statusObj["SemTaxa"]) === "sim";
  const ativado   = norm(statusObj["Ativado"]) === "sim";
  const bloqueado = norm(statusObj["Bloqueado"]) === "sim";
  const desistiu  = norm(statusObj["Desistiu"]) === "sim";

  if (desistiu)               return { label: "Desistiu", tone: "zinc" };
  if (bloqueado && ativado)   return { label: "Bloqueado", tone: "red" };
  if (semTaxa && ativado) return { label: "Sem taxa", tone: "indigo" };
  if (pagou && ativado)       return { label: "Taxa paga", tone: "emerald" };
  if (pagou && !ativado)      return { label: "Taxa paga (aguard.)", tone: "amber" };
  return { label: "Pendente", tone: "amber" };
}


function StatusPill({ status }) {
  const meta = resumirStatus(status || {});
  const toneCls = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    amber:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    red:     "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    zinc:    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300",
    indigo:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  }[meta.tone] || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300";

  const isTransfer = meta.icon === "transfer";

  return (
    <span
        className={`inline-flex h-6 items-center gap-1.5 px-3 rounded-full text-xs font-medium ${toneCls} whitespace-nowrap min-w-[132px] leading-none`}
      >
      {isTransfer ? (
        <ArrowLeftRight className="w-3.5 h-3.5" />
      ) : (
        // bolinha padrão quando não é transferência
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "currentColor", opacity: 0.85 }}
          aria-hidden
        />
      )}
      {meta.label}
    </span>
  );
}


export default function ClientesDoVendedorModal({
  open,
  onClose,
  vendedor,
  registros = [],
  statusMap,
}) {
  const UI = useUI();
  const [openDetalhe, setOpenDetalhe] = useState(false);
  const [vendaSel, setVendaSel] = useState(null);
  const [loadingVend, setLoadingVend] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusByDoc, setStatusByDoc] = useState({});
  // quais linhas estão com CPF visível (chave = docFmt)
  const [showCpf, setShowCpf] = useState(new Set());
  const toggleCpf = (key) => {
    setShowCpf((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };



  const [countdown, setCountdown] = useState(20);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshPulse, setRefreshPulse] = useState(false);
  // docs que mudaram no último refresh -> animar linha
  const [changedDocs, setChangedDocs] = useState(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncProg, setSyncProg] = useState({ done: 0, total: 0 });
  const [syncModal, setSyncModal] = useState(null); // {ok, notFound, errors:[], total}
  const [atendByDoc, setAtendByDoc] = useState({}); // { [cpfKey]: { code, label } }
  const [atendLoading, setAtendLoading] = useState(false);
  const [catalog, setCatalog] = useState({});
  const [openAtend, setOpenAtend] = useState(false);
  const [atendCliente, setAtendCliente] = useState({ id: "", nome: "" });


  async function handleOpenAtend(it) {
  try {
    // getClienteByNome já existe no arquivo (usa nome e CPF) — pode usar o docFmt como CPF
    const { id } = await getClienteByNome(it.nome, it.docFmt);
    setAtendCliente({ id, nome: it.nome });
    setOpenAtend(true);
  } catch (e) {
    console.error("Cliente não encontrado p/ atendimentos:", e);
    // opcional: toast
  }
}


  // Busca o status do atendimento mais recente por cliente (usando nome/CPF)
  const refreshAtendimentos = async () => {
    setAtendLoading(true);
    try {
      const cat = await fetchStatusCatalog(); // { N:"Novo", EP:"Em progresso", ... }
      setCatalog(cat);

      // alvos ├║nicos: o mais recente por CPF (j├í montado como syncTargets)
      const targets = syncTargets; // [{ nome, cpf, ts, key }]
      const next = { ...atendByDoc };

      const CONCURRENCY = 4;
      const pool = [];
        const runOne = async (t) => {
          try {
            // 1) achar cliente (precisamos do _raw.ativo)
            const cliente = await getClienteByNome(t.nome, t.cpf);
            const clienteId = cliente?.id;

            // 2) tentar o su_status do atendimento mais recente (continua igual)
            let code = null;
            try {
              code = await fetchUltimoSuStatusByClienteId(clienteId); // "EP" | "P" | "S" | "C" | "N" | null
            } catch {
              // silencioso
            }

            // 3) FALLBACK: se não houve atendimento e o cliente vier com ativo === "N",
            //    mostra o badge "Não ativo" (code = "NA").
            if (!code) {
              const ativoFlag = String(cliente?._raw?.ativo || "").toUpperCase();
              if (ativoFlag === "N") {
                next[t.key] = { code: "NA", label: "Não ativo" };
                return; // já resolveu este alvo
              }
            }

            // 4) se houve code de atendimento, registra normalmente
            if (code) {
              next[t.key] = { code, label: cat[code] || code };
            }
          } catch {
            // ignora not found
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
      setAtendByDoc(next);
    } finally {
      setAtendLoading(false);
    }
  };


    function getPortalTarget() {
        if (typeof document === "undefined") return null;
        const id = "app-portal-root";
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement("div");
          el.id = id;
          document.body.appendChild(el);
        }
        return el;
      }




  if (typeof document === "undefined") return null;

   const hiddenCls = open ? "" : "pointer-events-none opacity-0";
  
  // formata HH:MM:SS local
  const fmtTime = (d) =>
    d ? new Date(d).toLocaleTimeString("pt-BR", { hour12: false }) : "—";

  const [openTransfer, setOpenTransfer] = useState(false);
  const [transferInfo, setTransferInfo] = useState({ protocolo: "", sugestao: {} });

  
  // >>> alvo do portal (NADA de document.body aqui)
const portalTarget = useMemo(() => getPortalTarget(), []);

if (!portalTarget) return null; // segurança em SSR / hidratação

  // helper para descobrir o protocolo (usa seu "get")
  const getProtocolo = (r) =>
    String(get(r, "protocolo", "protocoloVenda", "protocolo_id", "id") ?? "").trim();

  const getSugestaoDestino = () => ({ nome: "", email: "" }); // pode preencher se quiser sugerir



  const abrirDetalhe = (r) => { setVendaSel(r); setOpenDetalhe(true); };

  // ESC apenas quando open=true
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Busca de status no NocoDB
    // Substitua TODO o seu refreshStatus por este
        const refreshStatus = async () => {
          setRefreshing(true);
          try {
            const docs = Array.from(
              new Set(
                (registros || [])
                  .map((r) => formatDoc?.(get(r, "cpf", "CPF", "documento", "cpfCliente", "cpf_cliente")))
                  .filter(Boolean)
              )
            );

            // carrega o JSON cacheado do vendedor (fallback)
            let vendJson = {};
            try {
              const row = await getVendedorRowByName(vendedor);
              vendJson = parseDadosJson(row) || {};
            } catch {
              vendJson = {};
            }

            // monta o novo mapa consultando a tabela por CPF (com fallback pro vendJson)
            const nextMap = {};
            const CONCURRENCY = 6;
            const pool = [];

            const runOne = async (doc) => {
              try {
                const found = await readCpfStatus(doc).catch(() => null);
                if (found?.status) {
                  nextMap[doc] = found.status; // verdade na tabela
                } else if (Object.prototype.hasOwnProperty.call(vendJson, doc)) {
                  nextMap[doc] = vendJson[doc]; // fallback (cache)
                }
              } finally {
                // nada
              }
            };

            for (const doc of docs) {
              const p = runOne(doc).finally(() => {
                const i = pool.indexOf(p);
                if (i >= 0) pool.splice(i, 1);
              });
              pool.push(p);
              if (pool.length >= CONCURRENCY) await Promise.race(pool);
            }
            await Promise.all(pool);

            // detectar diferenças vs. statusByDoc atual
            const changed = new Set();
            for (const doc of docs) {
              const before = JSON.stringify(statusByDoc?.[doc] ?? null);
              const after  = JSON.stringify(nextMap?.[doc] ?? null);
              if (before !== after) changed.add(doc);
            }

            setStatusByDoc(nextMap);
            setChangedDocs(changed);
            if (changed.size) setTimeout(() => setChangedDocs(new Set()), 1200);

            setLastUpdatedAt(Date.now());
            setRefreshPulse(true);
            setTimeout(() => setRefreshPulse(false), 300);
          } finally {
            setRefreshing(false);
          }
        };


    // carrega ao abrir / quando mudar vendedor/registros
    useEffect(() => {
      if (!open) return;
      refreshStatus();
      refreshAtendimentos();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, vendedor, JSON.stringify(registros)]);


    useEffect(() => {
      if (!open) return;
      setCountdown(20); // reseta ao abrir
      const tick = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            // dispara refresh quando zera
            refreshStatus();
            return 20;
          }
          return c - 1;
        });
      }, 2000);
      return () => clearInterval(tick);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, vendedor, JSON.stringify(registros)]);



    useEffect(() => {
    return onDev("transfer:venda", ({ protocolo }) => {
      setTransferInfo({ protocolo, sugestao: {} });
      setOpenTransfer(true);
    });
  }, []);

  // NUNCA faça early return aqui. Em vez disso, esconda visualmente:


// Parse seguro (pt-BR + ISO) com dayjs (customParseFormat habilitado no seu utils/dayjs)
const parseAnyDate = (v) => {
  if (!v) return null;
  if (v instanceof Date && !isNaN(+v)) return dayjs(v);
  if (typeof v === "number") return dayjs(v);
  const raw = String(v).trim();
  const formatos = [
    "DD/MM/YYYY, HH:mm:ss",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD",
  ];
  for (const f of formatos) {
    const d = dayjs(raw, f, true);
    if (d.isValid()) return d;
  }
  const d2 = dayjs(raw);
  return d2.isValid() ? d2 : null;
};

const toTs = (v) => {
  const d = parseAnyDate(v);
  return d ? d.valueOf() : 0;
};

const fmtPt = (v) => {
  const d = parseAnyDate(v);
  return d ? d.format("DD/MM/YYYY HH:mm:ss") : String(v || "—");
};




 const itens = (registros || []).map((r, i) => {
     const nome   = get(r, "nome", "Nome", "cliente", "Cliente") ?? "—";
     const docRaw = get(r, "cpf", "CPF", "documento", "cpfCliente", "cpf_cliente") ?? "";
     const docFmt = formatDoc?.(docRaw) || "";
     const plano  = get(r, "plano", "Plano") ?? "—";
     const dtRaw  = get(r, "dataHora", "data", "createdAt", "Data") ?? "";
     const ts     = toTs(dtRaw);               // timestamp correto (pt-BR ok)
     const dt     = fmtPt(dtRaw);              // exibição sempre consistente
     const protocolo = getProtocolo(r) || "";
     return { i, nome, docFmt, cpfMask: maskCpf(docRaw), plano, dt, ts, protocolo, _raw: r };
 });

 // LOG DE DEBUG: faça fora do map, depois de itens existir
 if (import.meta?.env?.DEV) {
   console.log(
     "[ClientesDoVendedorModal] sample ts check:",
     itens.slice(0, 3).map(x => ({ nome: x.nome, dt: x.dt, ts: x.ts }))
   );
 }





  // >>> DEDUPLICAR POR NOME (mantém o mais recente)
  const itensUniq = useMemo(() => {
    const byName = new Map();
    for (const it of itens) {
      const key = norm(it.nome);
      const prev = byName.get(key);
      if (!prev || it.ts > prev.ts) byName.set(key, it); // fica com o mais novo
    }
    // opcional: ordena do mais recente para o mais antigo
    return Array.from(byName.values()).sort((a, b) => b.ts - a.ts);
  }, [JSON.stringify(itens)]);

  const syncTargets = useMemo(() => {
  const map = new Map(); // key: docFmt (formatDoc), val: {nome, cpf, ts}
    for (const r of registros || []) {
      const nome = get(r, "nome", "Nome", "cliente", "Cliente") ?? "";
      const cpfRaw = get(r, "cpf", "CPF", "documento", "cpfCliente", "cpf_cliente") ?? "";
      const cpfKey = formatDoc?.(cpfRaw) || ""; // mesma chave que usamos no NocoDB
      if (!cpfKey) continue;
      const ts = toTs(get(r, "dataHora", "data", "createdAt", "Data") ?? "");
      const prev = map.get(cpfKey);
      if (!prev || ts > prev.ts) map.set(cpfKey, { nome, cpf: cpfRaw, ts, key: cpfKey });
    }
    return Array.from(map.values());
  }, [JSON.stringify(registros)]);



  async function syncAllFromIXC() {
  if (syncing) return;
  setSyncing(true);
  setSyncProg({ done: 0, total: syncTargets.length });

  const results = { ok: 0, notFound: 0, errors: 0, total: syncTargets.length, changedDocs: [] };
  const CONCURRENCY = 4;
  const pool = [];

  const runOne = async (t) => {
    const cpfKey = formatDoc?.(t.cpf) || "";
    try {
      const status = await calcularStatusViaIXC({ nome: t.nome, cpf: t.cpf });


      // grava no NocoDB com vendedor atual
      const res = await patchCpfStatusIfChanged(cpfKey, status, vendedor || "Outros");

      emitDev("status:clientes:updated", {
        cpf: cpfKey,
        vendedor: vendedor || "Outros",
        status,
      });

      // atualiza a UI (statusByDoc + highlight)
      setStatusByDoc((prev) => ({ ...prev, [cpfKey]: status })); 
      results.changedDocs.push(cpfKey); 
      results.ok += 1;
    } catch (e) {
      if (e?.code === "CLIENTE_NOT_FOUND") {
        results.notFound += 1;
      } else {
        console.error("[syncAllFromIXC] erro:", e);
        results.errors += 1;
      }
    } finally {
      setSyncProg((p) => ({ ...p, done: p.done + 1 }));
    }
  };

  for (const t of syncTargets) {
    const p = runOne(t).finally(() => {
      const idx = pool.indexOf(p);
      if (idx >= 0) pool.splice(idx, 1);
    });
    pool.push(p);
    if (pool.length >= CONCURRENCY) await Promise.race(pool);
  }
  await Promise.all(pool);

  emitDev("status:clientes:bulkUpdated", {
      cpfs: results.changedDocs,
      vendedor: vendedor || "Outros",
    });

  // anima as linhas atualizadas
  if (results.changedDocs.length) {
    const changed = new Set(results.changedDocs);
    setChangedDocs(changed);
    setTimeout(() => setChangedDocs(new Set()), 1200);
  }

  setSyncModal(results);
  setSyncing(false);
}



  const statusMerged = useMemo(() => ({ ...(statusMap || {}), ...statusByDoc }), [statusMap, statusByDoc]);




    return createPortal(
      <div className={`fixed inset-0 z-[1300] transition ${hiddenCls}`}>
        {/* backdrop */}
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />

        {/* modal */}
        <div className="absolute inset-x-0 top-10 mx-auto w-[min(920px,95vw)]
                        rounded-2xl border bg-white border-zinc-200 shadow-xl
                        dark:bg-zinc-950 dark:border-zinc-800
                        text-zinc-900 dark:text-zinc-100">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            {/* ESQUERDA: ícone + título */}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-semibold">
                Clientes de <span className="text-emerald-700 dark:text-emerald-300">{vendedor}</span>
              </h3>
            </div>

            {/* DIREITA: timer + fechar */}
            <div className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 border border-zinc-200 dark:border-zinc-700">
                  Atualiza em <strong className="tabular-nums ml-1">{String(countdown).padStart(2, "0")}s</strong>
                </span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Última: {fmtTime(lastUpdatedAt)}</span>
                <button
                  onClick={() => { setCountdown(20); refreshStatus(); }}
                  className="ml-2 px-2 py-0.5 rounded-md border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                  disabled={refreshing}
                  title="Atualizar agora"
                >
                  {refreshing ? "Atualizando..." : "Atualizar agora"}
                </button>
                <button
                  onClick={syncAllFromIXC}
                  disabled={syncing || (syncTargets.length === 0)}
                  className="px-2 py-0.5 rounded-md border border-emerald-600 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
                  title="Consultar IXC para todas as vendas do vendedor"
                >
                  {syncing ? `Sincronizando… ${syncProg.done}/${syncProg.total}` : "Sincronizar IXC"}
                </button>

              </div>

              {refreshing || loadingStatus ? <span>Verificando</span> : null}
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
                aria-label="Fechar"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-4">
  {itensUniq.length === 0 ? (
    <div className="text-sm opacity-70">Nenhuma venda para este vendedor no período.</div>
  ) : (
    <div className="max-h-[60vh] overflow-auto">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col />                       {/* Nome (flexível) */}
          {/* <col className="w-[170px]" />  CPF - REMOVIDO */}
          <col className="w-[120px]" /> {/* Plano */}
          <col className="w-[160px]" /> {/* Data */}
          <col className="w-[240px]" /> {/* Status + Badge */}
          <col className="w-[96px]"  /> {/* Ações */}
        </colgroup>
        
        {/* thead igual */}
        <tbody>
          {itensUniq.map((it) => {
            const st = statusMerged[it.docFmt];
            return (
              <tr
                  key={`${norm(it.nome)}-${it.docFmt || it.i}`}
                  className={`border-t border-zinc-200 dark:border-zinc-800 transition
                              ${changedDocs.has(it.docFmt) ? "bg-emerald-50 dark:bg-emerald-900/10" : ""}`}
                >
                {/* NOME + toggle CPF embutido */}
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      <div className="truncate">{it.nome}</div>

                      {/* CPF aparece só quando togglado */}
                      {showCpf.has(it.docFmt) && (
                        <div className="text-[11px] text-zinc-500 tabular-nums mt-0.5">
                          {it.cpfMask}
                        </div>
                      )}
                    </div>

                    {/* Botão compacto pra abrir/fechar CPF */}
                    <button
                      onClick={() => toggleCpf(it.docFmt)}
                      className={`inline-flex h-6 items-center px-2 rounded-full border text-[11px]
                                  ${showCpf.has(it.docFmt)
                                    ? "bg-zinc-100 border-zinc-300 text-zinc-800 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
                                    : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"}`}
                      title={showCpf.has(it.docFmt) ? "Ocultar CPF" : "Mostrar CPF"}
                      aria-label="Alternar CPF"
                    >
                      CPF
                    </button>
                  </div>
                </td>
                <td className="p-2">{it.plano}</td>
                <td className="p-2 whitespace-nowrap">{it.dt}</td>
                <td className="p-2">
                  {/* min-w-0 habilita truncamento dentro de flex; max-w garante não passar pro próximo td */}
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    <span className="shrink-0">
                      {st ? (
                        <StatusPill status={st} />
                      ) : (
                        <span className="opacity-50 text-xs">
                          {loadingStatus ? "—" : "Sem registro"}
                        </span>
                      )}
                    </span>

                    {/* Badge do atendimento: também shrink-0 pra não “amassar” e não empurrar vizinhos */}
                    {atendByDoc[it.docFmt]?.code ? (
                    <button
                      onClick={() => handleOpenAtend(it)}
                      className="focus:outline-none focus:ring-2 focus:ring-indigo-400/40 rounded-full"
                      title="Ver atendimentos"
                    >
                      <AtendStatusBadge
                        code={atendByDoc[it.docFmt].code}
                        label={atendByDoc[it.docFmt].label}
                      />
                    </button>
                  ) :  (
                      atendLoading ? <span className="opacity-40 text-[10px]">…</span> : null
                    )}
                  </div>
                </td>

                <td className="p-2 text-center">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setVendaSel(it._raw); setOpenDetalhe(true); }}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border
                                 bg-white border-zinc-200 hover:bg-zinc-50
                                 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      title="Detalhes da venda"
                      aria-label="Detalhes da venda"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        setTransferInfo({ protocolo: it.protocolo, sugestao: getSugestaoDestino() });
                        setOpenTransfer(true);
                      }}
                      disabled={!it.protocolo}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border
                                 bg-white border-zinc-200 hover:bg-zinc-50
                                 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900
                                 disabled:opacity-50"
                      title={it.protocolo ? `Transferir (${it.protocolo})` : "Sem protocolo"}
                      aria-label="Transferir venda"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
</div>


          <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border text-sm
                        bg-white border-zinc-200 hover:bg-zinc-50
                        dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900
                        text-zinc-900 dark:text-zinc-100"
            >
              Fechar
            </button>
          </div>

          {/* filhos montados juntos */}
          <DetalheVendaModal open={openDetalhe} onClose={() => setOpenDetalhe(false)} venda={vendaSel} statusMap={statusMerged} />
          <TransferirVendaModal open={openTransfer} onClose={() => setOpenTransfer(false)} protocolo={transferInfo.protocolo} sugestaoDestino={transferInfo.sugestao} onSuccess={(res)=>console.log("Transfer OK:", res)} />
          <AtendimentosModal
            open={openAtend}
            onClose={() => setOpenAtend(false)}
            clienteId={atendCliente.id}
            clienteNome={atendCliente.nome}
          />
        </div>

        {syncModal && (
          <div
            className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-title"
          >
            <div className="w-full max-w-md rounded-2xl border bg-white shadow-2xl
                            border-zinc-200
                            dark:bg-zinc-900 dark:border-zinc-700">
              {/* Header */}
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <h3 id="sync-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  Sincronização concluída
                </h3>
                <button
                  onClick={() => setSyncModal(null)}
                  className="rounded-md px-2 py-1 text-zinc-600 hover:bg-zinc-100
                            dark:text-zinc-300 dark:hover:bg-zinc-800"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 text-sm space-y-2 text-zinc-700 dark:text-zinc-200">
                <div>
                  <span className="font-medium">Total:</span>{" "}
                  <span className="tabular-nums font-semibold">{syncModal.total}</span>
                </div>

                <div className="text-emerald-700 dark:text-emerald-400">
                  <span className="font-medium">Atualizados:</span>{" "}
                  <span className="tabular-nums font-semibold">{syncModal.ok}</span>
                </div>

                <div className="text-amber-700 dark:text-amber-400">
                  <span className="font-medium">Não encontrados no IXC:</span>{" "}
                  <span className="tabular-nums font-semibold">{syncModal.notFound}</span>
                </div>

                <div className="text-red-700 dark:text-red-400">
                  <span className="font-medium">Erros:</span>{" "}
                  <span className="tabular-nums font-semibold">{syncModal.errors}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end">
                <button
                  onClick={() => setSyncModal(null)}
                  className="px-3 py-1.5 rounded-xl border text-sm
                            bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50
                            dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-700
                            focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}


      </div>,
      portalTarget
    );

}