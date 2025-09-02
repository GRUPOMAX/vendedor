import { useEffect, useState, useRef, useMemo } from "react";
import { formatCPF } from "../../utils/cpf";
import { readCpfStatus, upsertCpfStatusByCpf, onlyDigits, formatCNPJ } from "../../services/nocodbVendedores";
import TitularAnteriorModal from "../status/TitularAnteriorModal";
import SelectField from "../status/SelectField";
import { parseTitularAnterior, titularAnteriorObsTemplate } from "../../utils/ixc";



// ENDPOINTS IXC (usa os teus gateways)
const IXC_CLIENTE_API  = "https://ixc-buscar-clientes.api.webserver.app.br/clientes";
const IXC_CONTRATO_API = "https://ixc-buscar-contratos.api.webserver.app.br/contratos";
const IXC_TITULO_API   = "https://ixc-buscar-titulo.api.webserver.app.br/titulos/abertos-recebidos";
const IXC_ORDENS_API  = "https://ixc-buscar-ordens.api.webserver.app.br/ordens";



const BIN = ["SIM", "NAO"];

function formatCpfOuCnpj(doc) {
  const clean = onlyDigits(doc || "");
  if (clean.length === 11) return formatCPF(clean);
  if (clean.length === 14) return formatCNPJ(clean);
  return doc;
}





// Substitua pela versão abaixo
async function getClienteByNome(nome, cpfPossivel) {
  const base = IXC_CLIENTE_API;
  const cleanNome = String(nome || "").trim().replace(/\s+/g, " ");
  const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
  const cpfDigits = onlyDigits(cpfPossivel);

  const urls = [];

  // 0) CPF/CNPJ primeiro (quando vier)
  if (cpfDigits.length === 11 || cpfDigits.length === 14) {
    urls.push(`${base}?nome=${encodeURIComponent(cpfDigits)}&field=cpf`);
  }

  // 1) razão exato
  if (cleanNome) {
    urls.push(`${base}?nome=${encodeURIComponent(cleanNome)}&field=razao&oper==`);
    // 2) razão like
    urls.push(`${base}?nome=${encodeURIComponent(cleanNome)}&field=razao&oper=like`);
    // 3) nome like
    urls.push(`${base}?nome=${encodeURIComponent(cleanNome)}&field=nome&oper=like`);
  }

  let lastPayload = null;

  for (const url of urls) {
    //console.log("[IXC:getClienteByNome] tentando:", url);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      //console.warn("[IXC:getClienteByNome] HTTP", r.status, "em", url);
      continue;
    }

    const j = await r.json();
    lastPayload = j;
    //console.log("[IXC:getClienteByNome] resposta bruta:", j);

    const items = Array.isArray(j?.items) ? j.items
                : Array.isArray(j?.data)  ? j.data
                : [];

    // pega o primeiro com id válido
    const hit = items.find((it) => it?.id);
    if (hit) {
      const cliente = {
        id: String(hit.id),
        razao: String(hit.razao || hit.nome || "").trim(),
        _raw: hit,
      };
      console.log("[IXC:getClienteByNome] cliente escolhido:", cliente);
      return cliente;
    }
  }

  const err = new Error("Cliente não encontrado pelo nome/CPF.");
  err.code = "CLIENTE_NOT_FOUND";
  err.meta = {
    nome: cleanNome || null,
    cpf: cpfDigits || null,
    lastPayload,
  };
  throw err;
}

async function getOrdensByClienteId(clienteId) {
  const url = `${IXC_ORDENS_API}/cliente/${encodeURIComponent(clienteId)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao buscar ordens: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

// Detecta OS de "Alteração de Titularidade"
function isAltTitularidade(os) {
  const assuntoId = String(os?.id_assunto || "").trim();
  const txt = `${os?.mensagem || ""} ${os?._raw?.mensagem || ""}`.toLowerCase();
  // Ajuste o ID se sua base usar outro (14 foi o do exemplo)
  if (assuntoId === "14") return true;
  return txt.includes("alteração de titularidade") || txt.includes("alteracao de titularidade");
}

const obsTemplate = (nome, doc) =>
  `TITULAR ANTERIOR: ${nome || ""}\nCPF ANTERIOR: ${doc || ""}`;



async function getContratosByClienteId(clienteId) {
  const url = `${IXC_CONTRATO_API}?clienteId=${encodeURIComponent(clienteId)}&raw=0`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar contratos: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

function pickContratoAtivo(itens) {
  // preferir contrato com status A e status_internet A
  const ativo = itens.find(c => c?.status === "A" && c?.status_internet === "A");
  if (ativo) return ativo;
  // fallback: o primeiro
  return itens[0] || null;
}

function parseIsoDateSafe(s) {
  // aceita "YYYY-MM-DD HH:mm:ss" também
  if (!s) return 0;
  // troca espaço por 'T' para o Date() entender melhor em alguns ambientes
  const t = String(s).trim().replace(" ", "T");
  const d = new Date(t);
  return isNaN(+d) ? 0 : +d;
}

/**
 * Fallback da taxa paga quando NÃO encontramos de cara um título R com o valor da taxa.
 * Regras:
 *  - pegar o último título RECEBIDO (status "R") de valor == taxa,
 *    com _raw.titulo_renegociado === "S" e _raw.id_saida !== "0"
 *  - se existir título ABERTO (status "A") com _raw.id_saida === "0"
 *    e _raw.ultima_atualizacao > ultima_atualizacao do recebido(100),
 *    então considera "NAO". Caso contrário "SIM".
 */
function fallbackPagouTaxaComRenegociacao(titulos, taxaValor) {
  const equalsTaxa = (v) => moneyEq(v, taxaValor);

  // candidatos recebidos de 100
  const recebidos100 = titulos.filter(
    (t) =>
      t?.status === "R" &&
      equalsTaxa(t?.valor) &&
      String(t?._raw?.titulo_renegociado || "").toUpperCase() === "S" &&
      String(t?._raw?.id_saida || "") !== "0"
  );

  if (!recebidos100.length) return null; // sem base pra decidir

  // pega o mais recente por ultima_atualizacao
  const recebidoMaisRecente = recebidos100
    .map((t) => ({
      t,
      ua: parseIsoDateSafe(t?._raw?.ultima_atualizacao),
    }))
    .sort((a, b) => b.ua - a.ua)[0]?.t;

  if (!recebidoMaisRecente) return null;

  const uaRecebido = parseIsoDateSafe(recebidoMaisRecente?._raw?.ultima_atualizacao || recebidoMaisRecente?._raw?.baixa_data);

  // existe título A (aberto), id_saida == 0, mais novo que o recebido?
  const abertoMaisNovo = titulos.some((t) => {
    if (t?.status !== "A") return false;
    if (String(t?._raw?.id_saida || "") !== "0") return false;
    const ua = parseIsoDateSafe(t?._raw?.ultima_atualizacao);
    return ua > uaRecebido; // mais atual que o "100 recebido"
  });

  // se há aberto mais novo → NÃO considerar pago; senão, considerar pago
  return abertoMaisNovo ? "NAO" : "SIM";
}



async function getTitulosAbertosRecebidos(clienteId) {
  const url = `${IXC_TITULO_API}?clienteId=${encodeURIComponent(clienteId)}&labels=1&raw=0`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falha ao buscar títulos: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

function moneyEq(a, b) {
  const pa = Math.round(parseFloat(a || "0") * 100);
  const pb = Math.round(parseFloat(b || "0") * 100);
  return pa === pb;
}



export default function EditarStatusClienteModal({
  isOpen,
  onClose,
  venda,        // { cpf, nome, protocolo }
  vendedorNome, // fallback (ex.: "Outros")
  onSaved,      // callback({ vendedor, updated, createdOnFallback, json })
}) {
  const [cpfKey, setCpfKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [camposInvalidos, setCamposInvalidos] = useState([]);
  const [showTitularAnterior, setShowTitularAnterior] = useState(false);
  const [touched, setTouched] = useState({ pagou: false, ativado: false });
  const [autoBusy, setAutoBusy] = useState(false);
  const [nfOpen, setNfOpen] = useState(false);
  const [nfData, setNfData] = useState({ nome: "", cpf: "" });


async function handleAutoFromIXC() {
  try {
    setAutoBusy(true);

    // 1) Cliente por nome/CPF
    const nomeBusca = (venda?.nome || "").trim();
    if (!nomeBusca) {
      const err = new Error("Nome vazio para busca no IXC.");
      err.code = "CLIENTE_NOT_FOUND";
      throw err;
    }
    const { id: clienteId } = await getClienteByNome(venda?.nome, venda?.cpf);

    // 1.1) >>> Checar ordens: Alteração de Titularidade
    try {
      const ordens = await getOrdensByClienteId(clienteId);
      const osAlt = ordens
        .filter(isAltTitularidade)
        .sort((a, b) => (new Date(b?.data_abertura || 0)) - (new Date(a?.data_abertura || 0)))[0];

      if (osAlt) {
        const t = parseTitularAnterior(osAlt);
        setForm(prev => ({
          ...prev,
          "Alterar Titularidade": "SIM",
          "Titular Anterior Nome": t.nome || "",
          "Titular Anterior Documento": t.doc || "",
          "Titular Anterior Obs": titularAnteriorObsTemplate(t.nome || "", t.doc || ""),
          // Em transferência, demais campos não contam como pendência
          "Pagou Taxa": null,
          "Ativado": null,
          "Bloqueado": null,
          "Desistiu": null,
          "Autorizado": null,
          "Sem Taxa": null,
        }));
        setTouched({ pagou: false, ativado: false });
        return; // já resolveu via OS → não precisa seguir contrato/títulos
      }
    } catch (errOrdens) {
      console.warn("[IXC:auto] falha ao buscar ordens:", errOrdens);
      // segue fluxo normal mesmo assim
    }

    // 2) Contratos por cliente
    const contratos = await getContratosByClienteId(clienteId);
    if (!contratos.length) throw new Error("Nenhum contrato encontrado para o cliente.");
    const contrato = pickContratoAtivo(contratos);
    if (!contrato) throw new Error("Não foi possível selecionar um contrato.");

    // ---- regras/atribuições (mantém igual ao seu) ----
    const taxa = String(contrato?.taxa_instalacao ?? "0.00");
    const isAtivoContrato = contrato?.status === "A";
    const si = contrato?.status_internet;
    const isBloqueado = si !== "A";

    let PagouTaxa = "NAO";
    let Ativado   = isAtivoContrato ? "SIM" : "NAO";
    let Bloqueado = isBloqueado ? "SIM" : "NAO";
    let Desistiu  = "NAO";
    let Autorizado = null;
    let SemTaxa   = parseFloat(taxa) === 0 ? "SIM" : "NAO";


    
    if (parseFloat(taxa) > 0) {
      const titulos = await getTitulosAbertosRecebidos(clienteId);

      const tituloRecebido = titulos.find(t => t?.status === "R" && moneyEq(t?.valor, taxa));
      const tituloAberto   = titulos.find(t => t?.status === "A" && moneyEq(t?.valor, taxa));

      if (tituloRecebido) {
        const fb = fallbackPagouTaxaComRenegociacao(titulos, taxa);
        PagouTaxa = fb ?? "SIM";
      } else {
        const fb = fallbackPagouTaxaComRenegociacao(titulos, taxa);
        PagouTaxa = fb ?? (tituloAberto ? "NAO" : "NAO");
      }

      // ⬇️ coloca o debug aqui
      console.debug(
        "[IXC:auto] taxa=%s -> PagouTaxa=%s",
        taxa,
        PagouTaxa
      );
    }


    



    // prioridade das saídas
    if (Bloqueado === "SIM") {
      Autorizado = "NEGADO";
    } else if (SemTaxa === "SIM" && Ativado === "SIM") {
      Autorizado = "SEM TAXA";
    } else if (Ativado === "SIM" && PagouTaxa === "SIM") {
      Autorizado = "APROVADO";
    } else {
      Autorizado = null;
    }

    setForm(prev => ({
      ...prev,
      "Alterar Titularidade": "NAO",
      "Titular Anterior Nome": "",
      "Titular Anterior Documento": "",
      "Titular Anterior Obs": "",
      "Pagou Taxa": PagouTaxa,
      "Ativado": Ativado,
      "Bloqueado": Bloqueado,
      "Desistiu": Desistiu,
      "Autorizado": Autorizado,
      "Sem Taxa": SemTaxa,
    }));
    setTouched({ pagou: true, ativado: true });

  } catch (e) {
    if (e?.code === "CLIENTE_NOT_FOUND") {
      setNfData({ nome: venda?.nome || "", cpf: formatCpfOuCnpj(venda?.cpf || "") });
      setNfOpen(true);
    } else {
      console.error("[IXC:auto] erro:", e);
      setNfData({ nome: venda?.nome || "", cpf: formatCpfOuCnpj(venda?.cpf || "") });
      setNfOpen(true);
    }
  } finally {
    setAutoBusy(false);
  }
}






  const [form, setForm] = useState({
    "Pagou Taxa": "NAO",
    Ativado: "NAO",
    Bloqueado: "NAO",
    Desistiu: "NAO",
    Autorizado: null,
    "Sem Taxa": "NAO", 

    // novos campos
    "Alterar Titularidade": "NAO",
    "Titular Anterior Nome": "",
    "Titular Anterior Documento": "",
    "Titular Anterior Obs": "",
  });



// zera só os campos de titularidade
function clearTitularidade() {
  setForm(prev => ({
    ...prev,
    "Alterar Titularidade": "NAO",
    "Titular Anterior Nome": "",
    "Titular Anterior Documento": "",
    "Titular Anterior Obs": "",
  }));
  setTouched({ pagou: false, ativado: false });
}


// habilita/desabilita o botão "Limpar"
const hasTitularidadeData = useMemo(() =>
  form["Alterar Titularidade"] === "SIM" ||
  !!form["Titular Anterior Nome"] ||
  !!form["Titular Anterior Documento"] ||
  !!form["Titular Anterior Obs"],
[form]);


  const dialogRef = useRef(null);

  // bootstrap
  useEffect(() => {
    async function bootstrap() {
      if (!isOpen || !venda) return;
      const doc = formatCpfOuCnpj(venda.cpf || "");
      setCpfKey(doc);

      try {
        const found = await readCpfStatus(doc);
        const s = found?.status || {};
        const isSIM = (s?.["Alterar Titularidade"] ?? "NAO") === "SIM";

        setForm((prev) => ({
          ...prev,
          ...(typeof s === "object" ? s : {}),
          "Sem Taxa": s?.["Sem Taxa"] ?? s?.["SemTaxa"] ?? "NAO",   // ⬅️ novo
          "Alterar Titularidade": isSIM ? "SIM" : "NAO",
          "Titular Anterior Nome": s?.["Titular Anterior Nome"] ?? "",
          "Titular Anterior Documento": s?.["Titular Anterior Documento"] ?? "",
          "Titular Anterior Obs": s?.["Titular Anterior Obs"] ?? "",
          ...(isSIM
            ? {
                "Pagou Taxa": null,
                "Ativado": null,
                "Bloqueado": null,
                "Desistiu": null,
                "Autorizado": null,
              }
            : {}),
        }));
      } catch {
        // mantém defaults
      }
    }
    bootstrap();
  }, [isOpen, venda]);


  // ESC fecha
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !venda) return null;

  const titularidadeSIM = form["Alterar Titularidade"] === "SIM";

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      // liga/desliga transferência
      if (key === "Alterar Titularidade") {
        if (value === "SIM") {
          next["Pagou Taxa"] = null;
          next["Ativado"]    = null;
          next["Bloqueado"]  = null;
          next["Desistiu"]   = null;
          next["Autorizado"] = null;
        } else {
          // saiu de transferência → não força desistência
          next["Titular Anterior Nome"]       = "";
          next["Titular Anterior Documento"]  = "";
          next["Titular Anterior Obs"]        = "";
          next["Pagou Taxa"] = "NAO";
          next["Ativado"]    = "NAO";
          next["Bloqueado"]  = "NAO";
          next["Desistiu"]   = "NAO";
          next["Autorizado"] = null;
        }
        // reset dos “tocados”
        setTouched({ pagou: false, ativado: false });
        return next;
      }

        if (key === "Autorizado" && prev["Alterar Titularidade"] !== "SIM") {
        if (value === "SEM TAXA") {
          next["Sem Taxa"]  = "SIM";
          // opcional: em sem taxa, "Pagou Taxa" não se aplica
          if (next["Pagou Taxa"] == null) next["Pagou Taxa"] = "NAO";
        } else {
          next["Sem Taxa"] = "NAO";
        }
      }
      
      if (key === "Pagou Taxa" && value === "SIM" && prev["Sem Taxa"] === "SIM" && prev["Alterar Titularidade"] !== "SIM") {
        next["Sem Taxa"] = "NAO";
        if (next["Autorizado"] === "SEM TAXA") next["Autorizado"] = "APROVADO";
      }

      // marca como “tocado” quando alterar Pagou/Ativado
      if (key === "Pagou Taxa") setTouched((t) => ({ ...t, pagou: true }));
      if (key === "Ativado")    setTouched((t) => ({ ...t, ativado: true }));

      // regras automáticas: só quando NÃO está em transferência
      const emTransferencia = prev["Alterar Titularidade"] === "SIM";
      if (!emTransferencia) {
        const pagou = next["Pagou Taxa"] === "SIM";
        const ativ  = next["Ativado"]    === "SIM";
        const bloq  = next["Bloqueado"]  === "SIM";
        const desis = next["Desistiu"]   === "SIM";

        // 1) Aprovado apenas em SIM+SIM
        if (pagou && ativ) {
          next["Desistiu"]   = "NAO";
          next["Autorizado"] = "APROVADO";
          return next;
        }

        // 2) Bloqueado sempre nega
        if (bloq) {
          next["Autorizado"] = "NEGADO";
          return next;
        }

        // 3) Desativado (desistiu) só se o usuário tocou NOS DOIS e escolheu NAO+NAO
        if (
          touched.pagou && touched.ativado &&
          next["Pagou Taxa"] === "NAO" && next["Ativado"] === "NAO"
        ) {
          next["Desistiu"]   = "SIM";
          next["Autorizado"] = "DESATIVADO";
          return next;
        }

        // 4) Se marcou manualmente Desistiu = SIM, refletir
        if (desis) {
          next["Autorizado"] = "DESATIVADO";
        }
      }
      // em transferência, não mexe (mantém null)
      return next;
    });
  };



  async function handleSave() {
  // quando for transferência, não exige Pagou/Ativado
  const titularidadeSIM = form["Alterar Titularidade"] === "SIM";
  if (!titularidadeSIM) {
    const obrigatorios = ["Pagou Taxa", "Ativado"];
    const faltando = obrigatorios.filter(
      (k) => !form[k] || !["SIM", "NAO"].includes(form[k])
    );
    if (faltando.length) {
      setCamposInvalidos(faltando);
      setTimeout(() => setCamposInvalidos([]), 1500);
      return;
    }
  }

  try {
    setSaving(true);
    const toSave = { ...form };

    if (!titularidadeSIM) {
        // Normaliza SEM TAXA ↔ flag
        if (toSave["Autorizado"] === "SEM TAXA") {
          toSave["Sem Taxa"] = "SIM";
          if (toSave["Pagou Taxa"] == null) toSave["Pagou Taxa"] = "NAO";
        } else {
          toSave["Sem Taxa"] = toSave["Sem Taxa"] === "SIM" ? "SIM" : "NAO";
        }
      } else {
        // Em transferência, não contabiliza nada
        toSave["Sem Taxa"] = null;
      }

    if (titularidadeSIM) {
      // grava null explicitamente para não contar como pendência
      toSave["Pagou Taxa"] = null;
      toSave["Ativado"] = null;
      toSave["Bloqueado"] = null;
      toSave["Desistiu"] = null;
      toSave["Autorizado"] = null;
      toSave["Alterar Titularidade"] = "SIM";
    } else {
      // sem transferência → remove campos de titular anterior
      toSave["Alterar Titularidade"] = "NAO";
      toSave["Titular Anterior Nome"] = null;
      toSave["Titular Anterior Documento"] = null;
      toSave["Titular Anterior Obs"] = null;
    }

    const result = await upsertCpfStatusByCpf(cpfKey, toSave, vendedorNome || "Outros");
    onSaved?.(result);
    onClose?.();
  } catch (e) {
    alert(e?.message || String(e));
  } finally {
    setSaving(false);
  }
}




  function stop(e) {
    e.stopPropagation();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose} aria-modal="true" role="dialog">
      <div
        ref={dialogRef}
        onClick={stop}
        className="w-full max-w-xl rounded-2xl border border-border dark:border-dark-border bg-card dark:bg-dark-card text-text dark:text-dark-text shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-dark-border">
          <h2 className="text-lg font-semibold">Editar Status do Cliente</h2>


          <button onClick={onClose} className="rounded-lg px-2 py-1 hover:bg-background dark:hover:bg-dark-background" aria-label="Fechar">
            ✕
          </button>
        </div>

        

        <div className="px-5 py-4 space-y-4">
          <div className="text-sm opacity-80">
            <b>Cliente:</b> {venda.nome} · <b>Protocolo:</b> {venda.protocolo}
          </div>
          <div className="flex items-center gap-2 text-sm w-full">
            <span className="px-2 py-1 rounded-lg border border-purple-600/40 bg-purple-600/10">
              {cpfKey?.length > 14 ? "CNPJ" : "CPF"}: {cpfKey}
            </span>

            <button
              type="button"
              onClick={handleAutoFromIXC}
              disabled={autoBusy || form["Alterar Titularidade"] === "SIM"}
              className="ml-auto rounded-lg px-3 py-2 border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 disabled:opacity-60"
              title="Busca cliente/contrato/títulos no IXC e preenche automaticamente"
            >
              {autoBusy ? "Carregando..." : "Busca Automática"}
            </button>
          </div>


            {/* Alteração de Titularidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
                label="Cliente – Alteração de Titularidade"
                value={form["Alterar Titularidade"]}
                onChange={(v) => setField("Alterar Titularidade", v)}
                options={BIN}
            />

            <div className="flex items-end gap-2">
                {form["Alterar Titularidade"] === "SIM" && (
                <button
                    type="button"
                    onClick={() => setShowTitularAnterior(true)}
                    className="w-full rounded-xl border border-border dark:border-dark-border px-3 py-2 hover:bg-background dark:hover:bg-dark-background"
                >
                    Registrar Titular Anterior
                </button>
                )}
            </div>
            </div>


          {/* Campos do status (desabilitados quando titularidade=SIM) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              label="Pagou Taxa"
              value={form["Pagou Taxa"]}
              onChange={(v) => setField("Pagou Taxa", v)}
              options={BIN}
              disabled={titularidadeSIM}
              allowEmpty={titularidadeSIM}
              highlight={camposInvalidos.includes("Pagou Taxa")}
            />
            <SelectField
              label="Ativado"
              value={form["Ativado"]}
              onChange={(v) => setField("Ativado", v)}
              options={BIN}
              disabled={titularidadeSIM}
              allowEmpty={titularidadeSIM}
              highlight={camposInvalidos.includes("Ativado")}
            />
            <SelectField
              label="Bloqueado"
              value={form["Bloqueado"]}
              onChange={(v) => setField("Bloqueado", v)}
              options={BIN}
              allowEmpty={titularidadeSIM}
              disabled={titularidadeSIM}
            />
            <SelectField
              label="Desistiu"
              value={form["Desistiu"]}
              onChange={(v) => setField("Desistiu", v)}
              options={BIN}
              allowEmpty={titularidadeSIM}
              disabled={titularidadeSIM}
            />
            <SelectField
                className="sm:col-span-2"
                label="Autorizado"
                value={form["Autorizado"] ?? ""}
                onChange={(v) => setField("Autorizado", v || null)}
                options={(() => {
                  if (titularidadeSIM) return [];
                  const pagou = form["Pagou Taxa"] === "SIM";
                  const ativ  = form["Ativado"] === "SIM";
                  const bloq  = form["Bloqueado"] === "SIM";
                  const desi  = form["Desistiu"] === "SIM";
                  const semTx = form["Sem Taxa"] === "SIM";   // ⬅️ novo

                  if (bloq) return ["NEGADO"];
                  if (pagou && ativ) return ["APROVADO"];
                  if (semTx && ativ) return ["SEM TAXA"]; 
                  // só oferece "DESATIVADO" quando o usuário de fato escolheu NAO+NAO nos dois
                  if (touched.pagou && touched.ativado && !pagou && !ativ) return ["DESATIVADO"];
                  if (desi) return ["DESATIVADO"];
                  return [];
                })()}
                allowEmpty
                disabled={titularidadeSIM}
              />

          </div>

          {/* Resumo do titular anterior (se já preenchido) */}
          {form["Alterar Titularidade"] === "SIM" &&
            (form["Titular Anterior Nome"] || form["Titular Anterior Documento"]) && (
              <div className="text-xs opacity-80 border rounded-xl px-3 py-2">
                <div>
                  <b>Titular anterior:</b> {form["Titular Anterior Nome"] || "—"}
                </div>
                <div>
                  <b>Documento:</b> {formatCpfOuCnpj(form["Titular Anterior Documento"]) || "—"}
                </div>
                {form["Titular Anterior Obs"] && (
                  <div>
                    <b>Obs:</b> {form["Titular Anterior Obs"]}
                  </div>
                )}
              </div>
            )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border dark:border-dark-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border dark:border-dark-border hover:bg-background dark:hover:bg-dark-background"
            type="button"
          >
            Cancelar
          </button>

          {/* aparece se tiver algo pra limpar (ou se estiver SIM) */}
          {(form["Alterar Titularidade"] === "SIM"
            || form["Titular Anterior Nome"]
            || form["Titular Anterior Documento"]
            || form["Titular Anterior Obs"]) && (
            <button
              type="button"
              onClick={clearTitularidade}
              className="px-4 py-2 rounded-xl border border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-dark-background"
              title="Limpa os campos de titularidade e remove do JSON no salvar"
            >
              Limpar Titularidade
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-background dark:bg-dark-card text-text dark:text-dark-text font-medium disabled:opacity-60"
            type="button"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>


        {nfOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl">
              <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                <h3 className="text-base font-semibold">Cliente não encontrado</h3>
                <button
                  onClick={() => setNfOpen(false)}
                  className="rounded-md px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 py-4 space-y-2 text-sm">
                <p>Não localizamos o cliente informado no IXC.</p>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 text-xs">
                  <div><b>Nome buscado:</b> {nfData.nome || "—"}</div>
                  <div><b>CPF/CNPJ:</b> {nfData.cpf || "—"}</div>
                </div>
                <ul className="list-disc ml-5 text-xs opacity-80">
                  <li>Verifique acentos/ortografia do nome.</li>
                  <li>Tente pelo CPF/CNPJ (somente dígitos).</li>
                  <li>Confirme se o cadastro existe no IXC.</li>
                </ul>
              </div>

              <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-2">
                <button
                  onClick={() => setNfOpen(false)}
                  className="rounded-xl px-4 py-2 border border-border dark:border-dark-border hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}




      </div>

      {/* Modal Titular Anterior */}
      <TitularAnteriorModal
        open={showTitularAnterior}
        onClose={() => setShowTitularAnterior(false)}
        initial={{
          nome: form["Titular Anterior Nome"],
          doc: form["Titular Anterior Documento"],
          obs: form["Titular Anterior Obs"],
        }}
        onSave={({ nome, doc, obs }) => {
          setForm((prev) => ({
            ...prev,
            "Alterar Titularidade": "SIM",
            "Titular Anterior Nome": nome,
            "Titular Anterior Documento": doc,
            "Titular Anterior Obs": obs,
          }));
        }}
      />
    </div>
  );
}
