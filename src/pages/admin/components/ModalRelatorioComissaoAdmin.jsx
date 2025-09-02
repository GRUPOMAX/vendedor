import React, { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  FileText,
  FileSpreadsheet,
  Users as UsersIcon,
  ListOrdered,
  Search,
  ArrowUpDown,
  CheckCircle,
  Pencil,
  Clock,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { useUI } from "../../../state/ThemeContext";
import { exportResumoCSV, exportToCSV } from "./relatorios/exportCSV";
import { exportToExcel } from "./relatorios/exportExcel";
import { exportToPDF } from "./relatorios/exportPDF";
import ClientesDoVendedorModal from "./ClientesDoVendedorModal";
import PixQrButton from "../../admin/components/pix/PixQrButton";
import { fetchCadastroVendedorJSON, mapCadastroVendedor } from "../../../services/nocodbVendedores";
import EditComprovanteModal from "../components/relatorios/EditComprovanteModal";
import { findRegistroComissaoByPeriodo } from "../../../services/nocodbComprovantesPix";
import { fetchContaPagarStatus } from "../../../services/ixcContasApagarStatus";
import dayjs from "../../../utils/dayjs";
import { formatDateKey } from "../../../utils/date";
import PaymentProofModal from './relatorios/PaymentProofModal.jsx';

// --- helpers de chave estável e id do NocoDB ---
const getRecordId = (v) => v?.id || v?.ID || v?._id || null;
const getProtocolo = (v) => v?.protocolo || v?.Protocolo || null;

// --- normalizações básicas ---
const normStr = (s = "") =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");

// pega o "vendKey" igual ao usado no statusMap
const vendKeyOf = (row) => normStr(row.__vendedorNome || row.vendedor || row.Vendedor || "—");

// tenta várias chaves de CPF que podem existir no statusMap
const cpfCandidates = (row) => {
  const raw = row.cpf || row.CPF || row.documento || row.cpfCliente || row.cpf_cliente || "";
  const d   = onlyDigits(raw);
  const mask11 = d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,"$1.$2.$3-$4") : null;
  const mask14 = d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5") : null;
  return [String(raw).trim(), d, mask11, mask14].filter(Boolean);
};

// === mesma regra do ClientesDoVendedorModal ===
const norm = (v) =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const isTransferenciaStatus = (s = {}) => {
  const a = norm(s['Alterar Titularidade']);
  return (
    a === 'sim' ||
    !!s['Titular Anterior Nome'] ||
    !!s['Titular Anterior Documento'] ||
    !!s['Titular Anterior Obs']
  );
};
// pega CPF "cru" da linha
const guessCPF = (r) =>
  String(r?.cpf || r?.CPF || r?.cpf_cliente || r?.cpfCliente || r?.documento || r?.doc || "")
    .replace(/\D/g, "");

// parse robusto da data de um registro
const dateMs = (r) => {
  const s = r?.dataHora ?? r?.data ?? r?.createdAt ?? r?.Data ?? null;
  if (!s) return 0;
  const m = dayjs(
    s,
    [
      "YYYY-MM-DDTHH:mm:ssZ",
      "YYYY-MM-DDTHH:mm:ss.SSSZ",
      "YYYY-MM-DD HH:mm:ss",
      "YYYY-MM-DD",
      "DD/MM/YYYY HH:mm",
      "DD/MM/YYYY",
      "DD-MM-YYYY HH:mm",
      "DD-MM-YYYY",
    ],
    true
  );
  return m.isValid() ? m.valueOf() : (new Date(s).getTime() || 0);
};



const isAllNullStatus = (s = {}) => {
  const keys = ['Pagou Taxa', 'Ativado', 'Bloqueado', 'Desistiu', 'Autorizado', 'Sem Taxa', 'SemTaxa'];
  return keys.every((k) => s[k] == null || s[k] === '');
};
function resumirStatus(statusObj = {}) {
  if (isTransferenciaStatus(statusObj)) {
    return { label: "Alteração de Titularidade", tone: "indigo", icon: "transfer" };
  }
  if (isAllNullStatus(statusObj)) return { label: "—", tone: "zinc", empty: true };

  const pagou     = norm(statusObj["Pagou Taxa"]) === "sim";
  const semTaxa   = norm(statusObj["Sem Taxa"] ?? statusObj["SemTaxa"]) === "sim";
  const ativado   = norm(statusObj["Ativado"]) === "sim";
  const bloqueado = norm(statusObj["Bloqueado"]) === "sim";
  const desistiu  = norm(statusObj["Desistiu"]) === "sim";

  if (desistiu)            return { label: "Desistiu", tone: "zinc" };
  if (bloqueado)           return { label: "Bloqueado", tone: "red" };
  if (semTaxa && ativado)  return { label: "Sem taxa", tone: "indigo" };
  if (pagou && ativado)    return { label: "Taxa paga", tone: "emerald" };
  if (pagou && !ativado)   return { label: "Taxa paga (aguard.)", tone: "amber" };
  return { label: "Pendente", tone: "amber" };
}

// busca o objeto de status (cru) no statusMap pelo vendedor/CPF
 function findStatusFromMap(row, statusMap = {}, statusByVendCpf = {}) { 
   const cpfs   = cpfCandidates(row); 
   const vend   = vendKeyOf(row); 
   const byVend = (statusByVendCpf?.[vend]) || (statusMap?.[vend]) || {}; 
   // 1) preferir mapa do vendedor 
   for (const k of cpfs) { if (byVend && byVend[k]) return byVend[k]; } 
   // 2) cair para o global (achatado) 
   for (const k of cpfs) { if (statusMap && statusMap[k]) return statusMap[k]; } 
   return null; 
 }

// helper local
const toNum = (v) => (Number.isFinite(+v) ? +v : 0);

 function comissaoEfetiva(row) {
   return toNum(row.__comissaoCalc ?? row.comissao ?? row.Comissao);
 }



// --- mini cliente NocoDB para buscar pelo protocolo ---
const NOCODB_URL = import.meta.env.VITE_NOCODB_URL;
const NOCODB_TOKEN = import.meta.env.VITE_NOCODB_TOKEN;
const TABLE_ID = import.meta.env.VITE_NOCODB_TBL_VENDAS;
const ncHeaders = { accept: "application/json", "xc-token": NOCODB_TOKEN };

async function fetchLatestByProtocolo(proto) {
  if (!proto) return null;
  const qs = new URLSearchParams({
    where: `(protocolo,eq,${proto})`,
    orderby: "updated_at,desc",
    limit: "1",
    offset: "0",
  }).toString();
  const url = `${NOCODB_URL}/api/v2/tables/${TABLE_ID}/records?${qs}`;
  const r = await fetch(url, { headers: ncHeaders });
  if (!r.ok) throw new Error(`NocoDB fetchLatestByProtocolo ${proto} failed: ${r.status}`);
  const data = await r.json();
  return Array.isArray(data?.list) && data.list.length ? data.list[0] : null;
}

// Só loga em DEV e se VITE_DEBUG_CP=1
const __DEBUG_CP__ = import.meta.env.DEV && import.meta.env.VITE_DEBUG_CP === "0";

const dlog  = (...a) => __DEBUG_CP__ && console.log(...a);
const dwarn = (...a) => __DEBUG_CP__ && console.warn(...a);
const derr  = (...a) => __DEBUG_CP__ && console.error(...a);
const dgrp  = (label, fn) => {
  if (!__DEBUG_CP__) return;           // não executa o bloco em produção
  console.group(label);
  try { fn(); } finally { console.groupEnd(); }
};

function ClienteStatusBadge({ meta }) {
      if (!meta) return <span className="text-xs opacity-60">—</span>;
      const toneCls = {
        emerald: "bg-emerald-100 text-emerald-700",
        amber:   "bg-amber-100 text-amber-800",
        red:     "bg-rose-100 text-rose-700",
        zinc:    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300",
        indigo:  "bg-indigo-100 text-indigo-700",
      }[meta.tone] || "bg-zinc-100 text-zinc-700";
      return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${toneCls}`}>
          {meta.icon === "transfer" ? "⇄" : <span className="w-1.5 h-1.5 rounded-full" style={{background:"currentColor",opacity:.85}}/>}
          {meta.label}
        </span>
      );
    }


export default function ModalRelatorioComissaoAdmin({
  isOpen,
  onClose,
  de,
  ate,
  resumo = [],
  vendas = [],
  calcComissao,
  getStatus,
  filenameBase = "relatorio-comissao",
  statusMap = {},
  statusByVendCpf = {},
}) {
  if (!isOpen) return null;

  const UI = useUI?.() || {};
  const [tab, setTab] = useState("resumo");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "total", dir: "desc" });
  const [clientesOpen, setClientesOpen] = useState(false);
  const [vendSel, setVendSel] = useState("");
  const cadRef = useRef({ loaded: false, list: [] });
  const normNome = (s = "") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const [proofMap, setProofMap] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const showComissaoCol = tab !== "vendas"; 
  // Colunas fixas: Data, Vendedor, Cliente, CPF, Plano, Situação, (vazia p/ ações), Protocolo = 8 
  // Se showComissaoCol: + Status + Comissão = 2 extras → 10 
  const vendasColsCount = showComissaoCol ? 10 : 8;
  const [cpStatusByVend, setCpStatusByVend] = useState({});
  const [regByVend, setRegByVend] = useState({});
  const [proofsReady, setProofsReady] = useState(false);
  const [swapByProto, setSwapByProto] = useState({});
  const protoWatchersRef = useRef(new Map());
  const [cancelledProtos, setCancelledProtos] = useState(new Set());
  const [proofOpen, setProofOpen] = useState(false);
  const [proofData, setProofData] = useState(null);

  const TXID_MAX = 25;
  const mkTxid = (s) => String(s || "").slice(0, TXID_MAX);
  const keyTxVend = (txid, vendedor) => `${txid}::${String(vendedor || "")}`;
  const txidResumo = () => mkTxid(`COM-${deUse}-${ateUse}`);
  const txidVenda = (v) => mkTxid(`COM-${getProtocolo(v) || getRecordId(v) || "VENDA"}`);

  const { deUse, ateUse, deISO, ateISO } = useMemo(() => {
    const parsed = dayjs(de, ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY"], true);
    const base = parsed.isValid() ? parsed : dayjs();
    const start = base.startOf("month");
    const end = base.endOf("month");
    return {
      deUse: start.format("DD-MM-YYYY"),
      ateUse: end.format("DD-MM-YYYY"),
      deISO: start.format("YYYY-MM-DD"),
      ateISO: end.format("YYYY-MM-DD"),
    };
  }, [isOpen, de]);

  const { deFmt, ateFmt } = useMemo(() => {
    const parse = (x) => {
      const m = dayjs(x, ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY"], true);
      return m.isValid() ? m : dayjs(x);
    };
    const d1 = parse(de);
    const d2 = parse(ate);
    return {
      deFmt: d1.isValid() ? d1.format("DD-MM-YYYY") : formatDateKey(de),
      ateFmt: d2.isValid() ? d2.format("DD-MM-YYYY") : formatDateKey(ate),
    };
  }, [de, ate]);

  const norm = (s = "") =>
    String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

  async function resolveNomeCompleto(nomeCurto, cadRef, ensureCadastro) {
    await ensureCadastro();
    const alvo = normStr(nomeCurto);
    const hit = cadRef.current.list.find((i) => {
      const n = normStr(i.nome);
      return n === alvo || n.startsWith(alvo) || n.includes(alvo);
    });
    return hit?.nome || nomeCurto;
  }


  useEffect(() => {
  if (isOpen) console.clear();
}, [isOpen]);


  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        const vendedoresResumo = Array.from(
          new Set((resumo || []).map((r) => String(r.vendedor || "").trim()).filter(Boolean))
        );

        dgrp("[CP] INIT", () => {
          dlog("Período (mês atual):", { de: deUse, ate: ateUse });
          dlog("Vendedores (resumo):", vendedoresResumo);
        });

        const map = {};
        const regs = {};
        for (const vend of vendedoresResumo) {
          const nomeCompleto = await resolveNomeCompleto(vend, cadRef, ensureCadastro);
          dlog(`[CP] Checando vendedor:`, { curto: vend, completo: nomeCompleto });

          const hit = await findRegistroComissaoByPeriodo({ vendedor: nomeCompleto, de: deISO, ate: ateISO });
          dlog("→ Resultado findRegistroComissaoByPeriodo:", hit);

          if (hit?.registro) {
            const st = await fetchContaPagarStatus(hit.registro);
            dlog("→ Status IXC:", st);
            regs[vend] = { registro: hit.registro, vendedorCompleto: nomeCompleto };
            map[vend] = { ...st, registro: hit.registro, vendedorCompleto: nomeCompleto };
          } else {
            dlog("→ NÃO achou registro no período para", nomeCompleto);
          }
        }

        setRegByVend(regs);
        setCpStatusByVend(map);
        dlog("[CP] Mapa final cpStatusByVend:", map);
      } catch (e) {
        derr("Erro ao checar status CP:", e);
      }
    })();
  }, [isOpen, deUse, ateUse, resumo]);

  // ▶️ Poll de status a cada 5s enquanto o modal estiver aberto
    useEffect(() => {
      if (!isOpen) return;

      let killed = false;
      let timerId = null;

      const tick = async () => {
        try {
          // 1) lista única de vendedores do resumo
          const vendedoresResumo = Array.from(
            new Set((resumo || []).map(r => String(r.vendedor || "").trim()).filter(Boolean))
          );

          // 2) (re)descobrir registro do período e trocar se mudou
          let regsNext = { ...regByVend };
          let regsChanged = false;

          for (const vend of vendedoresResumo) {
            const nomeCompleto = await resolveNomeCompleto(vend, cadRef, ensureCadastro);
            const hit = await findRegistroComissaoByPeriodo({ vendedor: nomeCompleto, de: deISO, ate: ateISO });

            const novoRegistro = hit?.registro ?? hit?.REGISTRO ?? null;
            const sameMonth = hit?.periodo
              ? dayjs(hit.periodo.de, ["DD-MM-YYYY","YYYY-MM-DD"], true)
                  .isSame(dayjs(deUse, "DD-MM-YYYY"), "month")
              : true;

            if (novoRegistro && sameMonth) {
              const atual = regsNext[vend]?.registro ?? null;
              if (!atual || atual !== novoRegistro) {
                regsNext = { ...regsNext, [vend]: { registro: novoRegistro, vendedorCompleto: nomeCompleto } };
                regsChanged = true;
              }
            }
          }

          if (regsChanged || Object.keys(regsNext).length !== Object.keys(regByVend).length) {
            setRegByVend(regsNext);
          }

          // 3) 🔥 SEMPRE atualizar o status de quem tem registro
          const entries = Object.entries(regsNext);
          if (entries.length) {
            const results = await Promise.all(entries.map(async ([vend, info]) => {
              try {
                const st = await fetchContaPagarStatus(info.registro);
                return [vend, { ...st, registro: info.registro, vendedorCompleto: info.vendedorCompleto }];
              } catch (e) {
                dwarn("[CP] Falha ao consultar status IXC do", vend, e);
                return null;
              }
            }));

            setCpStatusByVend(prev => {
              let changed = false;
              const next = { ...prev };
              for (const r of results) {
                if (!r) continue;
                const [vend, val] = r;
                const before = prev[vend];
                if (!before ||
                    before.status !== val.status ||
                    before.status_label !== val.status_label ||
                    before.registro !== val.registro) {
                  next[vend] = val;
                  changed = true;
                }
              }
              return changed ? next : prev; // evita re-render desnecessário
            });
          }
        } catch (e) {
          derr("[CP] Erro no poll de status:", e);
        } finally {
          if (!killed) timerId = setTimeout(tick, 20000);
        }
      };

      tick();
      return () => { killed = true; if (timerId) clearTimeout(timerId); };
      // não precisa depender de cpStatusByVend; o set acima já é idempotente
    }, [isOpen, deUse, ateUse, deISO, ateISO, resumo, regByVend]);



  useEffect(() => {
    if (!isOpen) return;
    setProofMap({});
    setProofsReady(true);
  }, [isOpen, resumo, vendas]);

  useEffect(() => {
    if (!isOpen) return;
    const cancelled = new Set(
      (vendas || [])
        .filter((v) => {
          const st = (typeof getStatus === "function" ? getStatus(v) : v.status || v.Status || "").toString();
          return st.toLowerCase().includes("cancel") || st === "C";
        })
        .map((v) => getProtocolo(v))
        .filter(Boolean)
    );
    setCancelledProtos(cancelled);
    dlog("[SWAP] Protocolos cancelados:", Array.from(cancelled));
  }, [isOpen, vendas, getStatus]);

  useEffect(() => {
    if (!isOpen) {
      for (const stop of protoWatchersRef.current.values()) try { stop(); } catch {}
      protoWatchersRef.current.clear();
      return;
    }

    for (const proto of cancelledProtos) {
      if (!proto) continue;
      if (protoWatchersRef.current.has(proto)) continue;

      let cancelled = false;
      let t = null;

      const tick = async () => {
        try {
          const latest = await fetchLatestByProtocolo(proto);
          if (latest) {
            const newId = getRecordId(latest);
            const newStatus = latest.status || latest.Status || "";
            const prevId =
              swapByProto[proto]?.id ||
              getRecordId((vendas || []).find((v) => getProtocolo(v) === proto));

            if (newId && newId !== prevId) {
              dlog(`[SWAP] ${proto}: ID trocou ${prevId || "(nenhum)"} -> ${newId} | status=${newStatus}`);
              setSwapByProto((prev) => ({
                ...prev,
                [proto]: {
                  id: newId,
                  status: newStatus,
                  updatedAt: latest.updated_at || new Date().toISOString(),
                  record: latest,
                },
              }));

              const aindaCancelado = String(newStatus).toLowerCase().includes("cancel") || newStatus === "C";
              if (!aindaCancelado) {
                setCancelledProtos((prev) => {
                  const next = new Set(prev);
                  next.delete(proto);
                  return next;
                });
                if (t) clearTimeout(t);
                protoWatchersRef.current.delete(proto);
                return;
              }
            }
          }
        } catch (e) {
          dwarn("[SWAP] tick erro:", e);
        } finally {
          if (!cancelled) t = setTimeout(tick, 20000);
        }
      };

      tick();
      const stop = () => {
        cancelled = true;
        if (t) clearTimeout(t);
      };
      protoWatchersRef.current.set(proto, stop);
    }

    for (const [proto, stop] of Array.from(protoWatchersRef.current.entries())) {
      if (!cancelledProtos.has(proto)) {
        try { stop(); } catch {}
        protoWatchersRef.current.delete(proto);
      }
    }

    return () => {};
  }, [isOpen, cancelledProtos, vendas, swapByProto]);

  const onProofSent = ({ txid, url, vendedor, valor }) => {
    const k = keyTxVend(txid, vendedor);
    setProofMap((m) => ({ ...m, [k]: { ok: true, url, vendedor, valor } }));
  };

  const getDadosPix = async (vendedorNome) => {
    await ensureCadastro();
    const alvo = normNome(vendedorNome);
    const hit = cadRef.current.list.find((i) => normNome(i.nome) === alvo);
    return {
      chave: hit?.pix || "",
      nomeCadastro: hit?._raw?.["nome-cadastro"] || hit?._raw?.nome_cadastro || "",
    };
  };

  const ensureCadastro = async () => {
    if (!cadRef.current.loaded) {
      const { cadJSON } = await fetchCadastroVendedorJSON();
      cadRef.current = { loaded: true, list: mapCadastroVendedor(cadJSON) };
    }
  };

  const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
  const fmtMoney = (v) => `R$ ${toNum(v).toFixed(2)}`;
  const fmtDate = (s) => {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(+d)) return String(s);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  };

  
// helper robusto p/ export (usa meta existente OU reconstrói pelo statusMap)
// por:
 function comissaoEfetivaExport(row) { 
   const toNum = (v) => 
     typeof v === "string" ? +(v.replace(/\./g, "").replace(",", ".")) || 0 : (Number.isFinite(+v) ? +v : 0); 
   return toNum(row.__comissaoCalc ?? row.comissao ?? row.Comissao); 
 }
  const vendasColumnsPDF = [
  { label: "Data/Hora", accessor: (r) => fmtDate(r.dataHora || r.data || r.createdAt) },
  { label: "Vendedor", accessor: (r) => r.__vendedorNome || r.vendedor || r.Vendedor || "" },
  { label: "Cliente", accessor: (r) => r.nome || r.Nome || r.cliente || r.Cliente || "" },
  { label: "CPF/CNPJ", accessor: (r) => r.cpf || r.CPF || r.documento || r.cpfCliente || r.cpf_cliente || "" },
  { label: "Plano", accessor: (r) => r.plano || r.Plano || "" },
  { label: "Situação", accessor: (r) =>
      (r.__clienteStatusMeta?.label) ||
      resumirStatus(findStatusFromMap(r, statusMap, statusByVendCpf) || {}).label || "—"
  },
  { label: "Protocolo/ID", accessor: (r) => getProtocolo(r) || getRecordId(r) || "" },
];


const vendasComCalculo = useMemo(() => {
  const toNumSafe = (v) =>
    typeof v === "string"
      ? +v.replace(/\./g, "").replace(",", ".") || 0
      : Number.isFinite(+v) ? +v : 0;

  return (vendas || []).map((v) => {
    const cRaw = typeof calcComissao === "function" ? calcComissao(v) : (v.comissao ?? v.Comissao);
    const c = toNumSafe(cRaw);
    const st = typeof getStatus === "function" ? getStatus(v) : v.status || v.Status || "";
    const rawClienteStatus = findStatusFromMap(v, statusMap, statusByVendCpf);
    const clienteStatusMeta = resumirStatus(rawClienteStatus || {});
    return { ...v, __comissaoCalc: c, __statusTxt: st, __clienteStatusMeta: clienteStatusMeta };
  });
}, [vendas, calcComissao, getStatus, statusMap, statusByVendCpf]);

// Dedup por CPF dentro de cada vendedor: só a venda mais recente comissiona
const vendasComCalculoDedup = useMemo(() => {
  const latestByKey = new Map(); // key = vendKey::cpf
  const out = vendasComCalculo.map(v => ({ ...v })); // não mutar o original

  // 1ª passada: descobrir mais recentes
  for (const v of out) {
    const vend = vendKeyOf(v);          // normalizado
    const cpf = guessCPF(v) || "";
    if (!cpf) continue;
    const key = `${vend}::${cpf}`;
    const ts = dateMs(v);
    const cur = latestByKey.get(key);
    if (!cur || ts > cur.ts) {
      latestByKey.set(key, { ts, ref: v });
    }
  }

  // 2ª passada: marcar quem NÃO é o mais recente
  for (const v of out) {
    const vend = vendKeyOf(v);
    const cpf = guessCPF(v) || "";
    if (!cpf) continue;
    const key = `${vend}::${cpf}`;
    const keep = latestByKey.get(key)?.ref;
    if (keep && keep !== v) {
      v.__deduct = true; // dup -> não comissiona
      console.log(`[DEBUG] Deduplicando venda de ${vend} com CPF ${cpf} (menor data: ${dateMs(v)} vs ${dateMs(keep)})`);
    } else {
      console.log(`[DEBUG] Mantendo venda de ${vend} com CPF ${cpf} (data: ${dateMs(v)})`);
    }
  }
  return out;
}, [vendasComCalculo]);

const vendasDedupe = useMemo(() => {
  return vendasComCalculoDedup.filter(v => !v.__deduct);
}, [vendasComCalculoDedup]);

// 2) (opcional) se houver swap por protocolo, usa o registro atualizado
const vendasBase = useMemo(() => {
  return vendasDedupe.map(v => {
    const proto = getProtocolo(v);
    const override = proto ? swapByProto[proto]?.record : null;
    return override || v;
  });
}, [vendasDedupe, swapByProto]);

// 3) Monta o resumo somando as comissões efetivas
const resumoFromVendas = useMemo(() => {
  const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
  const map = new Map();

  for (const base0 of vendasBase) {
    const base = base0;
  const valorEfetivo = toNum(
    typeof calcComissao === "function"
      ? calcComissao(base)
      : (base.__comissaoCalc ?? base.comissao ?? base.Comissao ?? 0)
  );

    const vendedor = String(base.__vendedorNome || base.vendedor || base.Vendedor || "ÔÇö").trim();
    const acc = map.get(vendedor) || { vendedor, vendas: 0, total: 0 };

    acc.vendas += 1;
    acc.total += valorEfetivo;
    map.set(vendedor, acc);
  }

  return [...map.values()];
}, [vendasBase, calcComissao]);






 
const filteredResumo = useMemo(() => {
 const term = q.trim().toLowerCase();
 let arr = [...resumoFromVendas];
 if (term) {
   arr = arr.filter(r => String(r.vendedor || "").toLowerCase().includes(term));
 }
 const { key, dir } = sort;
 arr.sort((a, b) => {
   const av = key === "vendedor" ? String(a[key] || "").toLowerCase() : toNum(a[key]);
   const bv = key === "vendedor" ? String(b[key] || "").toLowerCase() : toNum(b[key]);
   if (av < bv) return dir === "asc" ? -1 : 1;
   if (av > bv) return dir === "asc" ? 1 : -1;
   return 0;
 });
 return arr;
}, [resumoFromVendas, q, sort]);

const resumoTotal = useMemo(() => {
 const vendasSum   = filteredResumo.reduce((a, r) => a + toNum(r.vendas), 0);
 const comissaoSum = filteredResumo.reduce((a, r) => a + toNum(r.total), 0);
 const media       = vendasSum ? comissaoSum / vendasSum : 0;
 return { vendasSum, comissaoSum, media };
}, [filteredResumo]);









  const registrosDoVendedorSel = useMemo(() => {
    if (!vendSel) return [];
    const norm = (s) => String(s || "").trim().toLowerCase();
    return (vendasComCalculo || []).filter(
      (v) => norm(v.__vendedorNome || v.vendedor || v.Vendedor) === norm(vendSel)
    );
  }, [vendasComCalculo, vendSel]);

  const resumoColumns = [
    { label: "Vendedor", accessor: "vendedor" },
    { label: "Vendas", accessor: (r) => toNum(r.vendas) },
    { label: "Comissão (R$)", accessor: (r) => toNum(r.total).toFixed(2) },
    {
      label: "Ticket médio (R$)",
      accessor: (r) => (toNum(r.vendas) ? (toNum(r.total) / toNum(r.vendas)).toFixed(2) : "0.00"),
    },
  ];

  const vendasColumns = [
    { label: "Data/Hora", accessor: (r) => fmtDate(r.dataHora || r.data || r.createdAt) },
    { label: "Vendedor", accessor: (r) => r.__vendedorNome || r.vendedor || r.Vendedor || "" },
    { label: "Cliente", accessor: (r) => r.nome || r.Nome || r.cliente || r.Cliente || "" },
    { label: "CPF/CNPJ", accessor: (r) => r.cpf || r.CPF || r.documento || r.cpfCliente || r.cpf_cliente || "" },
    { label: "Plano", accessor: (r) => r.plano || r.Plano || "" },
    { label: "Situação", accessor: (r) => r.__clienteStatusMeta?.label || "—" },
    { label: "Status", accessor: (r) => r.__statusTxt || r.status || r.Status || "" },
  
        // ⬇️ aqui vai a comissão efetiva
    { label: "Comissão (R$)", accessor: (r) => comissaoEfetivaExport(r, statusMap).toFixed(2) },
    { label: "Protocolo/ID", accessor: (r) => getProtocolo(r) || getRecordId(r) || "" },
  ];

  const handleExportResumoExcel = () => {
    exportToExcel(filteredResumo, resumoColumns, `${filenameBase}-resumo_${deUse}_a_${ateUse}`);
  };
  const handleExportResumoPDF = () => {
    exportToPDF({
      title: "Resumo por vendedor",
      subtitle: `De ${deUse} a ${ateUse}`,
      columns: resumoColumns,
      rows: vendasComCalculoDedup,
      filenameBase: `${filenameBase}-resumo_${deUse}_a_${ateUse}`,
      orientation: "portrait",
    });
  };

const handleExportVendasExcel = () => {
  exportToExcel(vendasComCalculoDedup, vendasColumnsPDF, `${filenameBase}-vendas_${deUse}_a_${ateUse}`);
};

const handleExportVendasPDF = () => {
  exportToPDF({
    title: "Vendas do período",
    subtitle: `De ${deUse} a ${ateUse}`,
    columns: vendasColumnsPDF,
    rows: vendasComCalculoDedup,
    filenameBase: `${filenameBase}-vendas_${deUse}_a_${ateUse}`,
    orientation: "landscape",
  });
};




  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "desc" };
      return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
    });
  };

  const getChavePix = async (vendedorNome) => {
    await ensureCadastro();
    const alvo = normNome(vendedorNome);
    const hit = cadRef.current.list.find((i) => normNome(i.nome) === alvo);
    return hit?.pix || "";
  };

  function StatusBadge({ code, label, registro }) {
    let color = "bg-zinc-200 text-zinc-800",
      Icon = Clock;
    if (code === "P" || /Quitad|Pago/i.test(label)) {
      color = "bg-emerald-100 text-emerald-700";
      Icon = CheckCircle;
    } else if (code === "C" || /Cancelad/i.test(label)) {
      color = "bg-rose-100 text-rose-700";
      Icon = XCircle;
    } else if (code === "A" || /Aberto|Ativo/i.test(label)) {
      color = "bg-amber-100 text-amber-800";
      Icon = Clock;
    }



    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}
        title={`Registro #${registro}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {label || code || "–"}
        {registro ? <span className="opacity-70 ml-1">#{registro}</span> : null}
      </span>
    );
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-6"
        onMouseDown={onClose}
      >
        <div
          className="w-full sm:max-w-5xl bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border
                     border-zinc-200 dark:border-zinc-800 overflow-hidden
                     text-zinc-900 dark:text-zinc-100"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-4 sm:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-semibold">Admin · Relatório de Vendas e Comissão</h3>
              <div className="text-xs opacity-70 mt-0.5">
                Período: <strong>{deUse}</strong> até <strong>{ateUse}</strong>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Fechar"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-2 items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTab("resumo")}
                className={`px-3 py-1.5 rounded-xl text-sm border ${
                  tab === "resumo"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                }`}
              >
                <UsersIcon className="inline w-4 h-4 mr-1" /> Resumo por vendedor
              </button>
              <button
                onClick={() => setTab("vendas")}
                className={`px-3 py-1.5 rounded-xl text-sm border ${
                  tab === "vendas"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                }`}
              >
                <ListOrdered className="inline w-4 h-4 mr-1" /> Vendas do período
              </button>
            </div>

            <div className="flex items-center gap-2">
              {tab === "resumo" && (
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 opacity-60" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Filtrar vendedor…"
                      className="pl-8 pr-3 py-1.5 rounded-xl text-sm border
                                 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800
                                 text-zinc-900 dark:text-zinc-100
                                 placeholder-zinc-500 dark:placeholder-zinc-400"
                    />
                  </div>
                  <button
                    onClick={() => exportResumoCSV(filteredResumo, { de: deUse, ate: ateUse, filenameBase })}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border
                               bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                               border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    title="Exportar CSV (resumo)"
                  >
                    <Download className="w-4 h-4" /> CSV
                  </button>
                  <button
                    onClick={handleExportResumoExcel}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border
                               bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                               border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    title="Exportar Excel (resumo)"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button
                    onClick={handleExportResumoPDF}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border
                               bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                               border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    title="Exportar PDF (resumo)"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                </>
              )}
              {tab === "vendas" && (
                <>
                  <button
                      onClick={() => {
                        const base = `${filenameBase}-vendas_${deUse}_a_${ateUse}`;
                        exportToCSV(vendasComCalculo, vendasColumnsPDF, base);
                      }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border
                               bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                               border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    title="Exportar CSV (vendas)"
                  >
                    <Download className="w-4 h-4" /> CSV
                  </button>
                  <button
                    onClick={handleExportVendasExcel}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border
                               bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                               border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    title="Exportar Excel (vendas)"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button
                    onClick={handleExportVendasPDF}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border
                               bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
                               border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                    title="Exportar PDF (vendas)"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-3 sm:p-4 max-h-[72vh] overflow-auto">
            {tab === "resumo" ? (
              <div>
                <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/40 text-zinc-700 dark:text-zinc-300">
                      <tr>
                        <Th
                          label="Vendedor"
                          onClick={() => toggleSort("vendedor")}
                          sorted={sort.key === "vendedor"}
                          dir={sort.dir}
                        />
                        <Th
                          label="Vendas"
                          className="text-right"
                          onClick={() => toggleSort("vendas")}
                          sorted={sort.key === "vendas"}
                          dir={sort.dir}
                        />
                        <Th
                          label="Comissão (R$)"
                          className="text-right"
                          onClick={() => toggleSort("total")}
                          sorted={sort.key === "total"}
                          dir={sort.dir}
                        />
                        <Th label="Ticket médio (R$)" className="text-right" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResumo.map((r, i) => {
                        const valor = toNum(r.total);
                        const txid = txidResumo();
                        const k = keyTxVend(txid, r.vendedor);
                        const proof = proofMap[k];
                        return (
                          <tr key={`${r.vendedor}-${i}`} className="border-t border-zinc-200 dark:border-zinc-800">
                            <td className="px-3 py-2 font-medium">
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline text-left"
                                onClick={() => {
                                  setVendSel(r.vendedor);
                                  setClientesOpen(true);
                                }}
                                title={`Ver clientes de ${r.vendedor}`}
                              >
                                {r.vendedor}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{toNum(r.vendas)}</td>
                            <td className="px-3 py-2">
                              <div className="w-full flex items-center justify-end gap-2 tabular-nums">
                                <span>{fmtMoney(valor)}</span>
                                {cpStatusByVend[r.vendedor] ? (
                                  <div className="flex items-center gap-1">
                                    <StatusBadge
                                      code={cpStatusByVend[r.vendedor].status}
                                      label={cpStatusByVend[r.vendedor].status_label}
                                      registro={cpStatusByVend[r.vendedor].registro}
                                    />
                                        {(
                                          cpStatusByVend[r.vendedor]?.status === "F" ||
                                          cpStatusByVend[r.vendedor]?.status === "P" ||
                                          /Quitad|Pago/i.test(cpStatusByVend[r.vendedor]?.status_label || "")
                                        ) && (
                                          <button
                                            className="px-2 py-0.5 text-xs rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                            onClick={() => {
                                              const pd = cpStatusByVend[r.vendedor] || {};
                                              // passa só o essencial; o modal busca o resto se faltar
                                              setProofData({ registro: pd.registro || pd.id, ...pd });
                                              setProofOpen(true);
                                            }}
                                            title="Ver comprovante"
                                          >
                                            Ver comprovante
                                          </button>
                                        )}


                                    {(cpStatusByVend[r.vendedor].status === "C" ||
                                      /Cancelad/i.test(cpStatusByVend[r.vendedor].status_label || "")) && (
                                      <PixQrButton
                                        className="ml-1"
                                        title="Reabrir solicitação (novo contas a pagar)"
                                        vendedor={r.vendedor}
                                        valor={valor}
                                        getDadosPix={getDadosPix}
                                        txid={txid}
                                        de={deUse}
                                        ate={ateUse}
                                        registrosAntigos={[cpStatusByVend[r.vendedor].registro].filter(Boolean)}
                                        registroAtual={cpStatusByVend[r.vendedor].registro}
                                        onSent={onProofSent}
                                        Icon={RotateCcw}
                                      >
                                        <RotateCcw className="w-4 h-4" />
                                      </PixQrButton>
                                    )}
                                  </div>
                                ) : proofsReady ? (
                                  <PixQrButton
                                    vendedor={r.vendedor}
                                    valor={valor}
                                    getDadosPix={getDadosPix}
                                    txid={txid}
                                    de={deUse}
                                    ate={ateUse}
                                    title="PIX: pagar comissão total do período"
                                    onSent={onProofSent}
                                  />
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 text-xs rounded border border-zinc-200 dark:border-zinc-800 opacity-70">
                                    verificando…
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {fmtMoney(toNum(r.vendas) ? valor / toNum(r.vendas) : 0)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-zinc-200 dark:border-zinc-800 font-medium">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{resumoTotal.vendasSum}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(resumoTotal.comissaoSum)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtMoney(resumoTotal.vendasSum ? resumoTotal.comissaoSum / resumoTotal.vendasSum : 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                <div className="overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950/40 text-zinc-700 dark:text-zinc-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Data/Hora</th>
                        <th className="px-3 py-2 text-left">Vendedor</th>
                        <th className="px-3 py-2 text-left">Cliente</th>
                        <th className="px-3 py-2 text-left">CPF/CNPJ</th>
                        <th className="px-3 py-2 text-left">Plano</th>
                        <th className="px-3 py-2 text-left">Situação</th>
                        {showComissaoCol &&  <th className="px-3 py-2 text-left">Status</th>}
                        <th className="px-3 py-2 text-left">    </th>
                        {showComissaoCol && <th className="px-3 py-2 text-right">Comissão (R$)</th>}
                        <th className="px-3 py-2 text-left">Protocolo/ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendasComCalculoDedup.map((v, i) => {
                        const proto    = getProtocolo(v);
                        const override = proto ? swapByProto[proto]?.record : null;
                        const base     = override || v; // <- fonte da verdade para esta linha

                        // (re)calcule os DERIVADOS usando o registro base atual
                        const statusTxt = typeof getStatus === "function"
                          ? getStatus(base)
                          : (base.status || base.Status || "");

                            const valor = toNum(
                              typeof calcComissao === "function"
                                ? calcComissao(base)
                                : (base.__comissaoCalc ?? base.comissao ?? base.Comissao ?? 0)
                            );

                        const vendNome = base.__vendedorNome || base.vendedor || base.Vendedor || "";
                        const txid     = txidVenda(base);
                        const k        = keyTxVend(txid, vendNome);
                        const proof    = proofMap[k];
                        const displayId= getProtocolo(base) || getRecordId(base);
                        const swapped  = Boolean(override);

                        return (
                          <tr
                            key={`${proto || getRecordId(base) || i}-${getRecordId(base) || ""}`}
                            className="border-t border-zinc-200 dark:border-zinc-800"
                          >
                            <td className="px-3 py-2">{fmtDate(base.dataHora || base.data || base.createdAt)}</td>
                            <td className="px-3 py-2">{vendNome}</td>
                            <td className="px-3 py-2">{base.nome || base.Nome || base.cliente || base.Cliente || ""}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {base.cpf || base.CPF || base.documento || base.cpfCliente || base.cpf_cliente || ""}
                            </td>

                            {/* ✅ Plano (coluna correta) */}
                            <td className="px-3 py-2">
                              {base.plano || base.Plano || ""}
                            </td>

                            {/* ✅ Situação (badge) */}
                            <td className="px-3 py-2">
                              <ClienteStatusBadge
                                meta={base.__clienteStatusMeta || resumirStatus(findStatusFromMap(base, statusMap, statusByVendCpf) || {})}
                              />
                              {swapped && <span className="ml-2 text-xs opacity-60">ID atualizado</span>}
                            </td>

                            <td className="px-3 py-2">
                              <span className={swapped ? "bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded" : ""}>
                                {statusTxt}
                              </span>
                            </td>
                            {showComissaoCol && (
                              <td className="px-3 py-2">
                                <div className="w-full flex items-center justify-end gap-2 tabular-nums">
                                  <span>{fmtMoney(valor)}</span>
                                  {proof?.ok ? (
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="inline-flex items-center gap-1 text-emerald-600"
                                        title="Comprovante recebido"
                                      >
                                        <CheckCircle className="w-4 h-4" />
                                      </span>
                                      <button
                                        className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        title="Editar comprovante"
                                        onClick={() => {
                                          setEditItem({ txid, vendedor: vendNome, valor, url: proof.url });
                                          setEditOpen(true);
                                        }}
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : proofsReady ? (
                                    <PixQrButton
                                      vendedor={vendNome}
                                      valor={valor}
                                      getDadosPix={getDadosPix}
                                      txid={txid}
                                      title="PIX: pagar comissão desta venda"
                                      onSent={onProofSent}
                                    />
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded border border-zinc-200 dark:border-zinc-800 opacity-70">
                                      verificando…
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-2">
                              {displayId}
                              {swapped && <span className="ml-2 text-xs opacity-70">↺ ID atualizado</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {vendasComCalculo.length === 0 && (
                        <tr>
                          <td colSpan={vendasColsCount} className="px-3 py-6 text-center opacity-60">
                            Sem vendas no período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ClientesDoVendedorModal
        open={clientesOpen}
        onClose={() => setClientesOpen(false)}
        vendedor={vendSel}
        registros={registrosDoVendedorSel}
        statusMap={statusMap}
      />
      <EditComprovanteModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        item={editItem}
        onSaved={(updated) => {
          if (updated?.txid) {
            const vend = updated.vendedor || editItem?.vendedor || "";
            const k = keyTxVend(updated.txid, vend);
            setProofMap((m) => ({
              ...m,
              [k]: { ...(m[k] || {}), ...updated, ok: true, vendedor: vend },
            }));
          }
          setEditOpen(false);
        }}
      />
      <PaymentProofModal
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        paymentData={proofData}
      />
    </>,
    document.body
  );
}

function Th({ label, className = "", onClick, sorted, dir }) {
  return (
    <th className={`px-3 py-2 text-left select-none ${className}`}>
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 hover:underline text-zinc-700 dark:text-zinc-300"
      >
        <span>{label}</span>
        {sorted && <ArrowUpDown className={`w-3.5 h-3.5 ${dir === "desc" ? "rotate-180" : ""}`} />}
      </button>
    </th>
  );
}