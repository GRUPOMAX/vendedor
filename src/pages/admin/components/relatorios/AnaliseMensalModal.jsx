// components/analise/AnaliseMensalModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X as XIcon,
  Filter,
  Users,
  AlertTriangle,
  BadgeDollarSign,
  CheckCircle2,
  ChevronRight,
  LineChart as LineChartIcon,
} from "lucide-react";
import dayjs from "../../../../utils/dayjs";
import { parseAnyDate } from "@/utils/dateRange";
import { useUI } from "../../../../state/ThemeContext";
import { syncStatusLoteViaIXC } from "@/services/ixcStatusService";
import { formatDoc } from "@/services/nocodbVendedores";
import GraficoAnaliseModal from "../analise/GraficoAnaliseModal";

/**
 * AnaliseMensalModal
 * Consolidado: Sem Taxa, Taxa em Aberto e Taxa Paga
 */
export default function AnaliseMensalModal({
  open,
  onClose,
  vendas = [],
  de,
  ate,
  statusByVendedorCpf = {},
  className = "",
  onAfterSync,
}) {
  const UI = useUI();
  const [syncing, setSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState(null);
  const [localStatusByCpf, setLocalStatusByCpf] = useState({});
  const [openGrafico, setOpenGrafico] = useState(false);

  useEffect(() => setLocalStatusByCpf({}), [open, de, ate]);

  // Helpers ---------------------------------------------------------
  const norm = (s = "") => String(s || "—").trim().toLowerCase();
  const onlyDigits = (s = "") => String(s).replace(/\D+/g, "");

  const guessCPF = (v) =>
    onlyDigits(v?.cpf) ||
    onlyDigits(v?.documento) ||
    onlyDigits(v?.doc) ||
    onlyDigits(v?.cpfCliente) ||
    onlyDigits(v?.CPF) ||
    "";

  const getVendedor = (v) =>
    v?.__vendedorNome ||
    v?.vendedor ||
    v?.vendedorNome ||
    v?.Vendedor ||
    v?.vendedor_name ||
    "—";

  const getClienteNome = (v) => v?.nome || v?.cliente || v?.name || v?.Cliente || "—";

  const getData = (v) =>
    parseAnyDate(v?.dataHora || v?.data || v?.createdAt || v?.updatedAt);

  const getStatusFromMap = (vendKey, cpfRaw) => {
    const d = onlyDigits(cpfRaw);
    const f = formatDoc?.(d) || d;
    return (
      localStatusByCpf?.[f] ??
      localStatusByCpf?.[d] ??
      statusByVendedorCpf?.[vendKey]?.[f] ??
      statusByVendedorCpf?.[vendKey]?.[d] ??
      statusByVendedorCpf?.[f] ??
      statusByVendedorCpf?.[d] ??
      null
    );
  };

  const isSemTaxa = (status, v) => {
    const st = status || {};
    const txt = String(
      st["Sem Taxa"] ?? st["sem taxa"] ?? st["SEM TAXA"] ?? ""
    ).toUpperCase();
    const classe = String(st?.class || st?.classe || v?.class || v?.classe || "")
      .toLowerCase();
    const sstr = String(st?.status || v?.status || "").toLowerCase();
    const valorTaxa = Number(v?.valorTaxa ?? v?.taxa ?? st?.valorTaxa ?? st?.taxa);
    return (
      st?.semTaxa === true ||
      txt === "SIM" ||
      classe.includes("sem_taxa") ||
      sstr.includes("sem_taxa") ||
      v?.semTaxa === true ||
      (Number.isFinite(valorTaxa) && valorTaxa === 0)
    );
  };

  const isTaxaPaga = (status, v) => {
    const st = status || {};
    const txt = String(
      st["Pagou Taxa"] ?? st["Taxa Paga"] ?? st?.statusTaxa ?? v?.statusTaxa ?? ""
    ).toUpperCase();
    if (txt === "SIM" || txt === "PAGA" || txt === "PAGO") return true;
    const flags = [st?.taxaPaga, st?.pago, v?.taxaPaga, v?.pago, v?.pagouTaxa];
    if (flags.some((x) => x === true || x === "true" || x === 1)) return true;
    const valorPago = Number(v?.valorTaxaPago ?? st?.valorTaxaPago);
    const valor = Number(v?.valorTaxa ?? v?.taxa ?? st?.valorTaxa ?? st?.taxa);
    return (
      Number.isFinite(valorPago) &&
      Number.isFinite(valor) &&
      valor > 0 &&
      valorPago >= valor
    );
  };

  // Base filtrada por período --------------------------------------
  const [rangeDesc, setRangeDesc] = useState("");
  useEffect(() => {
    try {
      const d1 = parseAnyDate(de);
      const d2 = parseAnyDate(ate);
      if (d1?.isValid?.() && d2?.isValid?.()) {
        setRangeDesc(`${d1.format("DD/MM/YYYY")} → ${d2.format("DD/MM/YYYY")}`);
      } else {
        setRangeDesc("");
      }
    } catch {}
  }, [de, ate]);

  const inRange = (value, deVal, ateVal) => {
    const dd = parseAnyDate(value);
    const d1 = parseAnyDate(deVal)?.startOf?.("day");
    const d2 = parseAnyDate(ateVal)?.endOf?.("day");
    if (!dd?.isValid?.()) return false;
    if (d1?.isValid?.() && !dd.isSameOrAfter(d1)) return false;
    if (d2?.isValid?.() && !dd.isSameOrBefore(d2)) return false;
    return true;
  };

  const vendasPeriodo = useMemo(
    () => vendas.filter((v) => inRange(getData(v), de, ate)),
    [vendas, de, ate]
  );

  // Aggregations ----------------------------------------------------
  const resumo = useMemo(() => {
    const clientesSemTaxaSet = new Map();
    const naoPagaramSet = new Map();
    const pagaramSet = new Map();
    const semTaxaPorVendedor = new Map();

    for (const v of vendasPeriodo) {
      const vend = getVendedor(v);
      const vendKey = norm(vend);
      const cpf = guessCPF(v);
      const status = cpf ? getStatusFromMap(vendKey, cpf) : null;

      const sem = isSemTaxa(status, v);
      const paga = isTaxaPaga(status, v);

      if (sem) {
        semTaxaPorVendedor.set(vend, (semTaxaPorVendedor.get(vend) || 0) + 1);
        if (cpf && !clientesSemTaxaSet.has(cpf)) {
          clientesSemTaxaSet.set(cpf, {
            cpf,
            nome: getClienteNome(v),
            vendedor: vend,
          });
        }
      }

      if (paga) {
        if (cpf && !pagaramSet.has(cpf)) {
          pagaramSet.set(cpf, { cpf, nome: getClienteNome(v), vendedor: vend });
        }
      } else if (!sem) {
        if (cpf && !naoPagaramSet.has(cpf)) {
          naoPagaramSet.set(cpf, { cpf, nome: getClienteNome(v), vendedor: vend });
        }
      }
    }

    const clientesSemTaxa = [...clientesSemTaxaSet.values()];
    const clientesNaoPagaram = [...naoPagaramSet.values()];
    const clientesPagaram = [...pagaramSet.values()];

    const rankingSemTaxa = [...semTaxaPorVendedor.entries()]
      .map(([vendedor, total]) => ({ vendedor, total }))
      .sort((a, b) => b.total - a.total);

    return {
      totalSemTaxaClientes: clientesSemTaxa.length,
      totalNaoPagaram: clientesNaoPagaram.length,
      totalPagaram: clientesPagaram.length,
      rankingSemTaxa,
      clientesSemTaxa,
      clientesNaoPagaram,
      clientesPagaram,
    };
  }, [vendasPeriodo, statusByVendedorCpf, localStatusByCpf]);

  if (!open) return null;

  const handleSyncIXCPeriodo = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const summary = await syncStatusLoteViaIXC({ vendas: vendasPeriodo });
      setSyncSummary(summary);
      setLocalStatusByCpf((prev) => ({ ...prev, ...summary.byCpf }));
      onAfterSync?.(summary);
    } finally {
      setSyncing(false);
    }
  };

  // UI --------------------------------------------------------------
  const Modal = (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />

      {/* Sheet/Modal */}
      <div
        className={`relative w-full sm:max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl m-0 sm:m-4 ${className}`}
        style={{ background: UI.cardBg, color: UI.text }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-4 sm:p-6"
          style={{ borderBottom: `1px solid ${UI.border}` }}
        >
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              Análise do Período <ChevronRight className="w-5 h-5" />
              <span style={{ color: UI.muted }}>
                {rangeDesc || "(sem filtro)"}
              </span>
            </h2>
            <p className="text-sm" style={{ color: UI.muted }}>
              Consolidado: Sem Taxa, Taxa em Aberto e Taxa Paga
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpenGrafico(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl transition"
              style={{ border: `1px solid ${UI.border}` }}
              title="Abrir análise gráfica"
            >
              <LineChartIcon className="w-4 h-4" />
              Gráfico
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl transition"
              style={{ border: `1px solid ${UI.border}` }}
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 sm:p-6">
          <KpiCard
            icon={Users}
            title="Clientes Sem Taxa"
            value={resumo.totalSemTaxaClientes}
            hint="Únicos no período"
            UI={UI}
          />
          <KpiCard
            icon={BadgeDollarSign}
            title="Taxa em Aberto"
            value={resumo.totalNaoPagaram}
            hint="Clientes que ainda não pagaram"
            UI={UI}
          />
          <KpiCard
            icon={CheckCircle2}
            title="Taxa Paga"
            value={resumo.totalPagaram}
            hint="Clientes que já pagaram"
            UI={UI}
          />
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-8 overflow-y-auto max-h-[72vh]">
          {/* Ranking vendedores que venderam SEM TAXA */}
          <section>
            <h3 className="text-base font-semibold mb-3">Vendedores vendendo "Sem Taxa"</h3>
            {resumo.rankingSemTaxa.length ? (
              <table className="w-full text-sm border-separate border-spacing-y-2">
                <thead>
                  <tr style={{ color: UI.muted }}>
                    <th className="px-3 py-1 text-left">#</th>
                    <th className="px-3 py-1 text-left">Vendedor</th>
                    <th className="px-3 py-1 text-right">Qtde</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.rankingSemTaxa.map((r, idx) => (
                    <tr
                      key={r.vendedor}
                      className="transition"
                      style={{
                        background: "transparent",
                        borderRadius: 12,
                      }}
                    >
                      <td className="px-3 py-2 w-12">{idx + 1}</td>
                      <td className="px-3 py-2">{r.vendedor}</td>
                      <td className="px-3 py-2 text-right font-medium">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="Nenhum vendedor com vendas 'Sem Taxa' neste período." UI={UI} />
            )}
          </section>

          {/* Lista: Clientes SEM TAXA */}
          <section>
            <h3 className="text-base font-semibold mb-3">Clientes marcados como "Sem Taxa"</h3>
            {resumo.clientesSemTaxa.length ? (
              <SimpleTable
                rows={resumo.clientesSemTaxa}
                cols={[
                  { k: "nome", t: "Cliente" },
                  { k: "cpf", t: "CPF" },
                  { k: "vendedor", t: "Vendedor" },
                ]}
                UI={UI}
              />
            ) : (
              <EmptyState text="Nenhum cliente 'Sem Taxa' neste período." UI={UI} />
            )}
          </section>

          {/* Lista: Clientes com TAXA EM ABERTO */}
          <section>
            <h3 className="text-base font-semibold mb-3">Clientes com taxa em aberto</h3>
            {resumo.clientesNaoPagaram.length ? (
              <SimpleTable
                rows={resumo.clientesNaoPagaram}
                cols={[
                  { k: "nome", t: "Cliente" },
                  { k: "cpf", t: "CPF" },
                  { k: "vendedor", t: "Vendedor" },
                ]}
                UI={UI}
              />
            ) : (
              <EmptyState text="Nenhum cliente com taxa em aberto no período." UI={UI} />
            )}
          </section>

          {/* Nota */}
          <div className="text-xs flex items-center gap-2" style={{ color: UI.muted }}>
            <AlertTriangle className="w-4 h-4" />
            <span>
              Regras flexíveis: "Sem Taxa" e "Taxa Paga" são inferidas por múltiplos campos. Se
              precisar, ajusto as funções <code>isSemTaxa</code> e <code>isTaxaPaga</code> para
              refletir exatamente sua base.
            </span>
          </div>
        </div>
      </div>

      {/* Modal de Gráfico */}
      <GraficoAnaliseModal
        open={openGrafico}
        onClose={() => setOpenGrafico(false)}
        vendas={vendas}
        de={de}
        ate={ate}
        statusByVendedorCpf={statusByVendedorCpf}
        localStatusByCpf={localStatusByCpf}
      />
    </div>
  );

  return createPortal(Modal, document.body);
}

/* ------------------------------- UI helpers ------------------------------- */

function KpiCard({ icon: Icon, title, value, hint, UI }) {
  return (
    <div
      className="rounded-2xl p-4 shadow-sm"
      style={{ border: `1px solid ${UI.border}` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-xl"
          style={{
            background: "rgba(34,197,94,0.12)",
            color: UI.emerald.strong,
          }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm" style={{ color: UI.muted }}>
            {title}
          </div>
          <div className="text-2xl font-semibold">{value}</div>
          {hint ? (
            <div className="text-xs mt-0.5" style={{ color: UI.muted }}>
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SimpleTable({ rows = [], cols = [], UI }) {
  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ border: `1px solid ${UI.border}` }}
    >
      <table className="w-full text-sm">
        <thead
          style={{
            background: UI.theme === "dark" ? "rgba(24,24,27,0.4)" : "#f6f6f7",
            color: UI.muted,
          }}
        >
          <tr>
            {cols.map((c) => (
              <th key={c.k} className="px-3 py-2 text-left font-medium">
                {c.t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} style={{ borderTop: `1px solid ${UI.border}` }}>
              {cols.map((c) => (
                <td key={c.k} className="px-3 py-2">
                  {String(r?.[c.k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ text = "Sem dados", UI }) {
  return (
    <div
      className="text-sm rounded-xl p-4"
      style={{
        color: UI.muted,
        border: `1px dashed ${UI.border}`,
      }}
    >
      {text}
    </div>
  );
}

/* --------------------------- Botão de abertura --------------------------- */

export function AnaliseMensalButton({
  vendas = [],
  de,
  ate,
  statusByVendedorCpf = {},
  className = "",
  children,
}) {
  const UI = useUI();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 transition ${className}`}
        style={{ border: `1px solid ${UI.border}` }}
      >
        <Filter className="w-4 h-4" />
        {children || "Análise do Período"}
      </button>
      <AnaliseMensalModal
        open={open}
        onClose={() => setOpen(false)}
        vendas={vendas}
        de={de}
        ate={ate}
        statusByVendedorCpf={statusByVendedorCpf}
      />
    </>
  );
}
