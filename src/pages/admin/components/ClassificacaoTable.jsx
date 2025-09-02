// components/ClassificacaoTable.jsx
import React, { useMemo, useState } from "react";
import { Users } from "lucide-react";
import ClientesDoVendedorModal from "./ClientesDoVendedorModal";
import { useUI } from "../../../state/ThemeContext";
import dayjs from "../../../utils/dayjs";

 const asNum = (v, def = 0) => { 
   if (typeof v === "number" && Number.isFinite(v)) return v; 
   if (!v) return def; 
   const s = String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); 
   const n = Number(s); 
   return Number.isFinite(n) ? n : def; 
 };

const fmt2 = (v) =>
  asNum(v, 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ---------- Datas ----------
const parseAnyDate = (v) => {
  if (!v) return null;
  if (v instanceof Date && !isNaN(+v)) return dayjs(v);
  if (typeof v === "number") return dayjs(v);
  const s = String(v).trim();
  const fmts = [
    "DD/MM/YYYY, HH:mm:ss",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD",
  ];
  for (const f of fmts) {
    const d = dayjs(s, f, true);
    if (d.isValid()) return d;
  }
  const d2 = dayjs(s);
  return d2.isValid() ? d2 : null;
};
const withinRangeLocal = (dtRaw, deYmd, ateYmd) => {
  const d = parseAnyDate(dtRaw);
  if (!d) return false;
  const start = dayjs(deYmd, "YYYY-MM-DD").startOf("day");
  const end = dayjs(ateYmd, "YYYY-MM-DD").endOf("day");
  return d.isSameOrAfter(start) && d.isSameOrBefore(end);
};

// ---------- Helpers de regras/status ----------
const guessCPF = (r) =>
  String(
    r?.cpf || r?.CPF || r?.cpf_cliente || r?.cpfCliente || r?.documento || r?.doc || ""
  ).replace(/\D/g, "");

const norm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isTransferencia = (cliente) => {
  const alter = norm(cliente?.["Alterar Titularidade"]);
  return (
    alter === "sim" ||
    !!cliente?.["Titular Anterior Nome"] ||
    !!cliente?.["Titular Anterior Documento"] ||
    !!cliente?.["Titular Anterior Obs"]
  );
};

const buildCtx = ({ venda, cliente, classificacao }) => {
  const n = (v) => norm(v);
  const alt = n(cliente?.["Alterar Titularidade"]);
  const antNome = cliente?.["Titular Anterior Nome"];
  const antDoc = cliente?.["Titular Anterior Documento"];
  const antObs = (cliente?.["Titular Anterior Obs"] || "").toString();
  const ehTransfer =
    alt === "sim" || !!antNome || !!antDoc || /transfer|titularidade/i.test(n(antObs));

  const pagouTaxa = n(cliente?.["Pagou Taxa"]) === "sim" || cliente?.PagouTaxa === true;
  const semTaxa =
    n(cliente?.["Sem Taxa"]) === "sim" || cliente?.SemTaxa === true || !pagouTaxa;

  const bloqueado =
    cliente?.Bloqueado === true ||
    n(cliente?.Bloqueado) === "sim" ||
    n(cliente?.status) === "bloqueado" ||
    n(cliente?.["Status Cliente"]) === "bloqueado";

  const ativado = n(cliente?.Ativado) === "sim" || cliente?.Ativado === true;
  const clienteAtivoFinal = !!(ativado && !bloqueado);

  let motivo = (cliente?.motivo || cliente?.["Motivo"] || "").toString();
  if (!motivo && ehTransfer) motivo = "transferencia";

  return {
    semTaxa,
    bloqueado,
    clienteAtivo: clienteAtivoFinal,
    motivo,
    classificacao: (classificacao || "").toLowerCase(),
    base: 0, // aqui a base não é o valor da venda
  };
};

const evalWhen = (when = {}, ctx = {}) => {
  const like = (a, b) =>
    (a || "").toString().toLowerCase().includes((b || "").toString().toLowerCase());
  for (const [field, cond] of Object.entries(when)) {
    const val = ctx[field];
    if (Array.isArray(cond)) {
      if (!cond.includes(val)) return false;
      continue;
    }
    if (cond && typeof cond === "object") {
      if ("ne" in cond && val === cond.ne) return false;
      if ("nin" in cond && Array.isArray(cond.nin) && cond.nin.includes(val)) return false;
      if ("like" in cond && !like(val, cond.like)) return false;
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
};

const calcularComissaoPorRegras = (regras = [], ctx) => {
  const ordered = (regras || [])
    .filter((r) => r?.ATIVO !== false)
    .sort((a, b) => (a?.PRIORIDADE ?? 999) - (b?.PRIORIDADE ?? 999));

  let base = Number(ctx.base || 0);
  let total = 0;

  for (const r of ordered) {
    const rule =
      typeof r?.REGRA === "string" ? JSON.parse(r.REGRA || "{}") : r?.REGRA || {};
    if (!evalWhen(rule.when, ctx)) continue;

    const calc = rule.calc || {};
    switch (calc.type) {
      case "fixo": {
        const vCent =
          calc.base === "classificacao"
            ? Number(ctx.valorClassificacaoCentavos || 0)
            : Number(calc.valorCentavos || 0);
        total += vCent / 100;
        break;
      }
      case "percentual": {
        const p = Number(calc.percentual || 0) / 100;
        total += base * p;
        break;
      }
      case "ajuste": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base += v;
        break;
      }
      case "minimo": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base = Math.max(base, v);
        break;
      }
      case "maximo": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base = Math.min(base, v);
        break;
      }
      default:
        break;
    }
    if (rule.stop) break;
  }
  return Number(total.toFixed(2));
};

const getValorClassificacaoCentavos = (tabela, classificacao) => {
  const key = (classificacao || "").toLowerCase();
  let v = tabela?.map?.[key];
  if (v != null) return v >= 100 ? Math.round(+v) : Math.round(+v * 100);

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const entry =
    tabela?.comissoes?.[classificacao] ??
    tabela?.comissoes?.[cap(key)] ??
    tabela?.comissoes?.[key];

  const raw = entry?.valor ?? entry;
  if (typeof raw === "string") {
    const n = Number(
      String(raw).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")
    );
    return Math.round((Number.isFinite(n) ? n : 0) * 100);
  }
  if (typeof raw === "number")
    return raw >= 100 ? Math.round(raw) : Math.round(raw * 100);
  return 0;
};

// =========================================================

export default function ClassificacaoTable({
  rows = [],
  vendas = [],
  de,
  ate,
  statusMap,
  statusByVendCpf = {},
  regras = [],
  tabelaPct = null,
}) {
  const UI = useUI();
  const [open, setOpen] = useState(false);
  const [modalVend, setModalVend] = useState("");
  const [modalRegs, setModalRegs] = useState([]);

  // Calcula vendas e total por vendedor aplicando REGRAS
  const safeRows = useMemo(() => {
    return (rows || []).map((r) => {
      const vendedor = r.vendedor || r.Vendedor || r.nome || r.Nome || "—";
      const cls =
        r.cls || r.Classificação || r.classificacao || r.Classificacao || "—";

      // filtra vendas do vendedor no período
      const alvo = norm(vendedor);
      const listaVend = (vendas || []).filter((v) => {
        const vendNome = v.__vendedorNome || v.vendedor || v.Vendedor || "";
        if (norm(vendNome) !== alvo) return false;
        const dtRaw = v.dataHora ?? v.data ?? v.createdAt ?? v.Data;
        return withinRangeLocal(dtRaw, de, ate);
      });

      // dedup por CPF (pega a mais recente)
      const mapa = new Map(); // cpf -> venda
      for (const v of listaVend) {
        const cpf = guessCPF(v);
        if (!cpf) continue;
        const t = parseAnyDate(v.dataHora ?? v.data ?? v.createdAt ?? v.Data)?.valueOf() || 0;
        const cur = mapa.get(cpf);
        const tc =
          cur && parseAnyDate(cur.dataHora ?? cur.data ?? cur.createdAt ?? cur.Data)?.valueOf();
        if (!cur || t > (tc || -Infinity)) mapa.set(cpf, v);
      }

      const valorClassifCent = getValorClassificacaoCentavos(tabelaPct, cls);
      let total = 0;

      for (const venda of mapa.values()) {
        const cpf = guessCPF(venda);
         // 1º: status do próprio vendedor; 2º: fallback global
        const cliente = (statusByVendCpf?.[alvo]?.[cpf]) || (statusMap?.[cpf]) || {};
        const ctx = buildCtx({ venda, cliente, classificacao: cls });
        ctx.valorClassificacaoCentavos = valorClassifCent;

        const val =
          Array.isArray(regras) && regras.length
            ? calcularComissaoPorRegras(regras, ctx)
            : isTransferencia(cliente)
              ? 0
              : valorClassifCent / 100;

        total += Number.isFinite(val) ? val : 0;
      }

      return {
        vendedor,
        cls,
        vendas: mapa.size,
        total: Number(total.toFixed(2)),
      };
    });
   }, [rows, vendas, de, ate, statusMap, statusByVendCpf, regras, tabelaPct]);

  // Modal: mostra clientes daquele vendedor no período (sem dedup)
  const abrirModal = (vendedorNome) => {
    const alvo = norm(vendedorNome);
    const lista = (vendas || []).filter((v) => {
      const vendNome = v.__vendedorNome || v.vendedor || v.Vendedor || "";
      if (norm(vendNome) !== alvo) return false;
      const dtRaw = v.dataHora ?? v.data ?? v.createdAt ?? v.Data;
      return withinRangeLocal(dtRaw, de, ate);
    });
    setModalVend(vendedorNome);
    setModalRegs(lista);
    setOpen(true);
  };

  

  return (
    <>
      <div className="rounded-2xl border overflow-hidden bg-white border-zinc-200 dark:bg-transparent dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 dark:bg-zinc-900/60">
            <tr>
              <th className="text-left p-3">Vendedor</th>
              <th className="text-left p-3">Classificação</th>
              <th className="text-right p-3">Vendas</th>
              <th className="text-right p-3">Comissão (R$)</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((r, i) => (
              <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="p-3">{r.vendedor}</td>
                <td className="p-3">{r.cls}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-2">
                    <span className="tabular-nums">{r.vendas}</span>
                    <button
                      onClick={() => abrirModal(r.vendedor)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg border
                                 bg-white border-zinc-200 hover:bg-zinc-50
                                 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      title="Ver clientes do período"
                      aria-label="Ver clientes do período"
                      style={{ outline: "none", boxShadow: "none" }}
                    >
                      <Users className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                <td className="p-3 text-right">{fmt2(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientesDoVendedorModal
        open={open}
        onClose={() => setOpen(false)}
        vendedor={modalVend}
        registros={modalRegs}
        statusMap={statusMap}
      />
    </>
  );
}
