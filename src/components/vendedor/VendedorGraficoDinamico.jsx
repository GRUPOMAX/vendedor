import React, { useEffect, useMemo, useState, useRef } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

import { useTheme } from "../../state/ThemeContext";
import { Moon, Sun, X } from "lucide-react";

import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Download,
  TrendingUp,
  LineChart as LineChartIcon,
  Calendar,
  BarChart2,
  Sigma,
  Rocket,
} from "lucide-react";
import { motion } from "framer-motion";

const PALETTE = {
  emerald: { line: "#10b981", area: "#34d399" },
  sky: { line: "#0ea5e9", area: "#38bdf8" },
  violet: { line: "#8b5cf6", area: "#a78bfa" },
  amber: { line: "#f59e0b", area: "#fbbf24" },
  zinc: { line: "#a1a1aa", area: "#d4d4d8" },
};

const T = (v) => (v ?? "").toString().trim();
const num = (v) => Number(v || 0) || 0;

// BRL
function brl(n) {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    return `R$ ${Number(n).toFixed(2)}`;
  }
}

// Agrega vendas por período
function agrupar(vendas = [], periodo = "dia", modo = "receita") {
  const FMT = [
    "DD/MM/YYYY, HH:mm:ss",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY - HH:mm:ss",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD",
  ];
  const byKey = new Map();
  for (const v of vendas) {
    const raw = v?.data ?? v?.dataHora;
    const d = typeof raw === "string" ? dayjs(raw, FMT, true) : dayjs(raw);
    if (!d.isValid()) continue;
    let key;
    if (periodo === "semana") key = d.startOf("week").format("YYYY-MM-DD");
    else if (periodo === "mes") key = d.startOf("month").format("YYYY-MM-01");
    else key = d.format("YYYY-MM-DD");

    const atual =
      byKey.get(key) || { key, data: dayjs(key).toDate(), quantidade: 0, receita: 0 };
    atual.quantidade += 1;
    atual.receita += num(v?.valor);
    byKey.set(key, atual);
  }
  const arr = Array.from(byKey.values()).sort((a, b) => a.data - b.data);
  if (arr.length > 1) {
    const filled = [];
    let cursor = dayjs(arr[0].data);
    const end = dayjs(arr[arr.length - 1].data);
    const step = periodo === "mes" ? "month" : periodo === "semana" ? "week" : "day";
    const fmt = step === "month" ? "YYYY-MM-01" : "YYYY-MM-DD";
    const map = new Map(arr.map((r) => [dayjs(r.data).format(fmt), r]));
    while (cursor.isBefore(end) || cursor.isSame(end)) {
      const k = cursor.format(fmt);
      const found = map.get(k);
      filled.push(
        found || { key: k, data: cursor.toDate(), quantidade: 0, receita: 0 }
      );
      cursor = cursor.add(1, step);
    }
    return filled.map((r) => ({
      ...r,
      valor: modo === "receita" ? r.receita : r.quantidade,
    }));
  }
  return arr.map((r) => ({ ...r, valor: modo === "receita" ? r.receita : r.quantidade }));
}

// Regressão linear (y = a + b*x)
function regressaoLinear(series) {
  const n = series.length;
  if (n < 2) return { a: 0, b: 0, r2: 0 };
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    const y = num(series[i].valor);
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const b = (n * sxy - sx * sy) / Math.max(n * sxx - sx * sx, 1e-9);
  const a = (sy - b * sx) / n;
  const yMean = sy / n;
  const ssTot = syy - n * yMean * yMean;
  const ssRes = series.reduce((acc, _, i) => {
    const x = i + 1;
    const y = series[i].valor;
    const yhat = a + b * x;
    return acc + (y - yhat) * (y - yhat);
  }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { a, b, r2 };
}

function gerarPrevisao(series, horizonte, periodo) {
  const { a, b } = regressaoLinear(series);
  const step = periodo === "mes" ? "month" : periodo === "semana" ? "week" : "day";
  const baseIdx = series.length;
  const lastDate = dayjs(series[series.length - 1]?.data);
  const out = [];
  for (let i = 1; i <= horizonte; i++) {
    const x = baseIdx + i;
    const yhat = Math.max(0, a + b * x);
    out.push({
      key: `F-${i}`,
      data: lastDate.add(i, step).toDate(),
      previsao: yhat,
    });
  }
  return out;
}

function exportCSV(rows, filename = "series.csv") {
  const header = Object.keys(rows[0] || {});
  const csv = [header.join(",")]
    .concat(rows.map((r) => header.map((h) => JSON.stringify(r[h] ?? "")).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Ajusta lambda com base em atributos
function ajustarLambda(lambda, venda, vendedorClass) {
  let fator = 1;

  // Cliente ativo aumenta chance
  if (venda.clienteAtivo) fator *= 1.2;

  // Taxa paga aumenta ainda mais
  if (venda.taxaPaga) fator *= 1.5;

  // Classificação do vendedor (exemplo: 1=ruim, 3=top)
  const mapaClass = { ruim: 0.8, medio: 1, top: 1.3 };
  fator *= mapaClass[vendedorClass] ?? 1;

  return lambda * fator;
}

function scoreVendaPorCliente(cpf, mapa = {}) {
  const c = mapa[cpf] || {};
  const ativo    = (c.Ativo ?? c.ativo ?? c.status === 'ATIVO');
  const taxaPaga = (c.TaxaPaga ?? c.taxaPaga ?? c.taxa === 'PAGA');

  // pesos simples e transparentes (ajuste à vontade)
  const wAtivo = ativo ? 1.0 : 0.3;
  const wTaxa  = taxaPaga ? 1.0 : 0.6;
  return wAtivo * wTaxa; // 1.0 (ótimo) -> ~0.18 (ruim)
}

const mapeado = (raw || []).map(r => ({
  data: r.dataHora,
  valor: 1,                 // contagem de venda
  cpf:  String(r.cpf || r.CPF || r.documento || "").replace(/\D/g,"")
}));
setTodasVendas(mapeado);



// Novo perfilWeekday ajustado
function perfilWeekday(series) {
  const buckets = Array.from({ length: 7 }, () => ({ soma: 0, dias: 0 }));
  for (const r of series) {
    const d = dayjs(r.data); if (!d.isValid()) continue;
    const wd = d.day();
    const cpf = r.cpf || "";
    const peso = scoreVendaPorCliente(cpf, mapaClientes); // 👈 pondera pela situação do cliente
    buckets[wd].soma += peso;    // antes: += r.valor
    buckets[wd].dias += 1;
  }
  return buckets.map(b => (b.dias > 0 ? b.soma / b.dias : 0));
}




const probPeloMenosUma = (lambda) => 1 - Math.exp(-Math.max(0, lambda));

function gerarProbabilidade(series, horizonte, periodo, classificacaoVendedor = "medio") {
  const step = periodo === "mes" ? "month" : periodo === "semana" ? "week" : "day";
  const last = dayjs(series.at(-1)?.data);

  // passa a classificação pra dentro
  const porWeekday = perfilWeekday(series, classificacaoVendedor);

  const out = [];
  for (let i = 1; i <= horizonte; i++) {
    const dt = last.add(i, step);

    if (step !== "day") {
      const dias = step === "week" ? 7 : dt.daysInMonth();
      let somaLambda = 0;
      const base = dt.startOf(step);

      for (let k = 0; k < dias; k++) {
        const wd = base.add(k, "day").day();
        somaLambda += porWeekday[wd] || 0;
      }

      out.push({
        key: `P-${i}`,
        data: dt.toDate(),
        prob: probPeloMenosUma(somaLambda),
        lambda: somaLambda,
      });
    } else {
      const wd = dt.day();
      const lambda = porWeekday[wd] || 0;
      out.push({
        key: `P-${i}`,
        data: dt.toDate(),
        prob: probPeloMenosUma(lambda),
        lambda,
      });
    }
  }
  return out;
}


function esperadoPeriodoFuturoDesde(serie, periodo) {
  const baseLast = dayjs(serie.at(-1)?.data);
  const porWeekday = perfilWeekday(serie);
  if (periodo === "dia") {
    const wd = baseLast.add(1, "day").day();
    const lambda = porWeekday[wd] || 0;
    return { esperado: lambda, probAlguma: probPeloMenosUma(lambda) };
  }
  const start =
    periodo === "semana"
      ? baseLast.add(1, "day").startOf("week")
      : baseLast.add(1, "day").startOf("month");
  const end = periodo === "semana" ? start.endOf("week") : start.endOf("month");
  let somaLambda = 0;
  for (let d = start; d.isBefore(end) || d.isSame(end, "day"); d = d.add(1, "day")) {
    somaLambda += porWeekday[d.day()] || 0;
  }
  return { esperado: somaLambda, probAlguma: probPeloMenosUma(somaLambda) };
}
// --------------------------------------------------------------------

export default function VendedorGraficoDinamico({
  vendas = [],
  titulo = "Gráfico Dinâmico",
  cor = "emerald",
  modoInicial = "quantidade",
  vendedorEmail,
  vendedorNome,
  endpointBase = "https://max.api.email.nexusnerds.com.br/api/vendedor-json",
  onClose = undefined,
  classificacao = null,
  mapaClientes = {}  
}) {
  const [periodo, setPeriodo] = useState("dia");
  const [modo, setModo] = useState(modoInicial);
  const [mostrarMM, setMostrarMM] = useState(true); // agora controla a linha de Prob
  const [analiseAtiva, setAnaliseAtiva] = useState(false);
  const [escopoAnalise, setEscopoAnalise] = useState("completa");
  const [isDark, setIsDark] = useState(true);

  const [todasVendas, setTodasVendas] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const chartRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(800);

  const toDay = (x) => (typeof x === "string" ? dayjs(x) : dayjs(x));
  const rangeLabel = (arr, get = (r) => r.data ?? r.dataHora) => {
    if (!arr?.length) return "vazio";
    const sorted = [...arr].sort((a, b) => toDay(get(a)) - toDay(get(b)));
    const first = sorted[0],
      last = sorted[sorted.length - 1];
    return `${toDay(get(first)).format("DD/MM/YYYY")} → ${toDay(get(last)).format(
      "DD/MM/YYYY"
    )} (${arr.length})`;
  };

  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === "dark";

  const vendasUsadas = useMemo(() => {
    if (escopoAnalise === "completa" && todasVendas.length) return todasVendas;
    return vendas || [];
  }, [escopoAnalise, todasVendas, vendas]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(media.matches);
    const listener = (e) => setIsDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (escopoAnalise === "completa" && vendedorEmail && !todasVendas.length) {
      carregarHistoricoCompleto();
    }
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (chartRef.current) setChartWidth(chartRef.current.offsetWidth);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  // formatos aceitos
  const FMT = [
    "DD/MM/YYYY, HH:mm:ss",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY - HH:mm:ss",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD",
  ];

  // Normaliza base
  const baseNormalizada = useMemo(() => {
    const base = vendasUsadas || [];
    const out = base
      .map((v) => ({ ...v, data: v.data ?? v.dataHora }))
      .filter((v) => dayjs(v.data, FMT, true).isValid());
    return out;
  }, [vendasUsadas]);

  // Escopo
  const vendasFiltradas = useMemo(() => {
    if (escopoAnalise === "mensal") {
      const inicio = dayjs().subtract(1, "month").startOf("month");
      const fim = dayjs().endOf("month");
      return baseNormalizada.filter((v) => {
        const d = dayjs(v.data, FMT, true);
        return (d.isAfter(inicio) || d.isSame(inicio, "day")) &&
          (d.isBefore(fim) || d.isSame(fim, "day"));
      });
    }
    return baseNormalizada;
  }, [baseNormalizada, escopoAnalise]);

  // Series
  const serieBase = useMemo(
    () => agrupar(vendasFiltradas, periodo, modo),
    [vendasFiltradas, periodo, modo]
  );

      // Série de contagem SEMPRE em "quantidade" para cálculo probabilístico
    const serieContagem = useMemo(
      () => agrupar(vendasFiltradas, periodo, "quantidade"),
      [vendasFiltradas, periodo]
    );


  const reg = useMemo(() => regressaoLinear(serieBase), [serieBase]);

  const horizonte = periodo === "mes" ? 6 : periodo === "semana" ? 12 : 30;
  const previsao = useMemo(
    () => gerarPrevisao(serieBase, horizonte, periodo),
    [serieBase, horizonte, periodo]
  );
  const probFutura = useMemo(
    () => gerarProbabilidade(serieContagem, horizonte, periodo),
    [serieContagem, horizonte, periodo]
  );

  // Monta dados para o gráfico
  const dados = useMemo(() => {
    const fmt =
      periodo === "mes" ? "MMM/YYYY" : periodo === "semana" ? "DD/MM (sem)" : "DD/MM";

    const hist = serieBase.map((r) => ({
      dataLabel: dayjs(r.data).format(fmt),
      data: r.data,
      valor: r.valor,
    }));

    const prev = previsao.map((p) => ({
      dataLabel: dayjs(p.data).format(fmt),
      data: p.data,
      previsao: p.previsao,
    }));

    const probs = probFutura.map((p) => ({
      dataLabel: dayjs(p.data).format(fmt),
      data: p.data,
      prob: p.prob, // 0..1
      lambda: p.lambda,
    }));

    // merge por data
    const byKey = new Map();
    for (const row of [...hist, ...prev, ...probs]) {
      const k = +dayjs(row.data);
      byKey.set(k, { ...(byKey.get(k) || {}), ...row });
    }
    return Array.from(byKey.values()).sort(
      (a, b) => +dayjs(a.data) - +dayjs(b.data)
    );
  }, [serieBase, previsao, probFutura, periodo]);

  // KPIs probabilísticos
  const totais = useMemo(() => {
    const total = serieBase.reduce((acc, r) => acc + r.valor, 0);
    const dias = Math.max(1, serieBase.length);
    const media = total / dias;
    const tendencia = reg.b;
    const { esperado, probAlguma } = esperadoPeriodoFuturoDesde(serieContagem, periodo);
     // esperado/probabilidade **sempre** baseados em contagem de vendas
    return { total, media, tendencia, r2: reg.r2, esperado, probAlguma };
  }, [serieBase, serieContagem, reg, periodo]);

  function baixarCSV() {
    exportCSV(
      dados.map((d) => ({
        data: dayjs(d.data).toISOString(),
        valor: d.valor ?? "",
        previsao: d.previsao ?? "",
        prob: d.prob ?? "",
        lambda: d.lambda ?? "",
      })),
      "grafico-vendedor.csv"
    );
  }

  const unidade = modo === "receita" ? "R$" : "un";
  const C = PALETTE[cor] || PALETTE.emerald;

  const valueFormatter = (v, name) => {
    if (v == null || Number.isNaN(v)) return "";
     if (name?.includes("Prob")) return `${Math.round(v * 100)}%`
      return unidade === "R$" ? brl(v) : (modo === "quantidade" ? Math.round(v) : v);
  };

  async function carregarHistoricoCompleto() {
    if (!vendedorEmail) {
      console.warn("[GD] vendedorEmail ausente — não dá pra buscar histórico completo");
      return;
    }

    const emailId = vendedorEmail.toLowerCase().replace(/[@.]/g, "_");
    const emailLocal = vendedorEmail.split("@")[0];
    const maybeNome =
      typeof vendedorNome === "string" && vendedorNome.trim()
        ? vendedorNome.trim().toLowerCase()
        : emailLocal.replace(/\d+$/, "");

    const candidates = [
      `${endpointBase}/${emailId}.json`,
      `${endpointBase}/${maybeNome}__${emailId}.json`,
    ];

    try {
      setCarregando(true);
      let raw = null,
        ok = false,
        lastStatus = null,
        usedUrl = null;

      for (const url of candidates) {
        try {
          const resp = await fetch(url, { cache: "no-store" });
          lastStatus = resp.status;
          if (resp.ok) {
            raw = await resp.json();
            ok = true;
            usedUrl = url;
            break;
          }
        } catch (e) {
          console.warn("[GD][fetch] erro na URL", url, e);
        }
      }

      if (!ok) {
        console.warn("[GD][fetch] nenhuma URL funcionou. Último status=", lastStatus);
        return;
      }

      const mapPlanoParaValor = (plano) => 1; // ajuste se quiser receita real
      const mapeado = (raw || []).map((r) => ({
        data: r.dataHora,
        valor: mapPlanoParaValor(r.plano),
      }));
      setTodasVendas(mapeado);
    } finally {
      setCarregando(false);
    }
  }

  function toggleAnalise() {
    setAnaliseAtiva((on) => {
      const next = !on;
      if (next && escopoAnalise === "completa" && !todasVendas.length) {
        carregarHistoricoCompleto();
      }
      return next;
    });
  }

  useEffect(() => {
    if (escopoAnalise === "completa" && analiseAtiva && !todasVendas.length) {
      carregarHistoricoCompleto();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopoAnalise, analiseAtiva]);

  return (
    <div className="w-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-4 flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <LineChartIcon className="w-5 h-5 opacity-70" />
          <h2 className="text-lg font-semibold">{titulo}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            onClick={() => setModo(modo === "receita" ? "quantidade" : "receita")}
            className="px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-zinc-500"
          >
            {modo === "receita" ? "Receita" : "Quantidade"}
          </button>
          <button
            onClick={() => setPeriodo("dia")}
            className={`px-3 py-1.5 rounded-xl border ${
              periodo === "dia" ? "border-zinc-300" : "border-zinc-700"
            } hover:border-zinc-500 flex items-center gap-1`}
          >
            <Calendar className="w-4 h-4" />
            Dia
          </button>
          <button
            onClick={() => setPeriodo("semana")}
            className={`px-3 py-1.5 rounded-xl border ${
              periodo === "semana" ? "border-zinc-300" : "border-zinc-700"
            } hover:border-zinc-500`}
          >
            Semana
          </button>
          <button
            onClick={() => setPeriodo("mes")}
            className={`px-3 py-1.5 rounded-xl border ${
              periodo === "mes" ? "border-zinc-300" : "border-zinc-700"
            } hover:border-zinc-500`}
          >
            Mês
          </button>

          {/* Botão agora controla exibição da Probabilidade */}
          <button
            onClick={() => setMostrarMM((v) => !v)}
            className="px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-zinc-500"
          >
            Prob. de venda
          </button>

          <button
            onClick={toggleAnalise}
            className={`px-3 py-1.5 rounded-xl border ${
              analiseAtiva ? "border-emerald-400" : "border-zinc-700"
            } hover:border-zinc-500 flex items-center gap-1`}
          >
            <TrendingUp className="w-4 h-4" />
            {analiseAtiva ? "Análise ON" : "Analisar Vendedor"}
          </button>
          <button
            onClick={() => {
              setEscopoAnalise("completa");
              if (analiseAtiva && !todasVendas.length) carregarHistoricoCompleto();
            }}
            className={`px-3 py-1.5 rounded-xl border ${
              escopoAnalise === "completa" ? "border-emerald-400" : "border-zinc-700"
            }`}
          >
            Análise Completa
          </button>
          <button
            onClick={() => setEscopoAnalise("mensal")}
            className={`px-3 py-1.5 rounded-xl border ${
              escopoAnalise === "mensal" ? "border-emerald-400" : "border-zinc-700"
            }`}
          >
            Análise Mensal
          </button>
          <button
            onClick={baixarCSV}
            className="px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-zinc-500 flex items-center gap-1"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>

          {/* Tema */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-700"
            title="Alternar tema"
          >
            {isDarkMode ? (
              <Sun className="w-5 h-5 text-yellow-300" />
            ) : (
              <Moon className="w-5 h-5 text-zinc-700" />
            )}
          </button>

          {/* Fechar */}
          {typeof onClose === "function" && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-700"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPI
          title={modo === "receita" ? "Receita total" : "Total de vendas"}
          value={modo === "receita" ? brl(totais.total) : totais.total}
          icon={<BarChart2 className="w-4 h-4" />}
        />
        <KPI
          title={`Média por ${periodo}`}
          value={modo === "receita" ? brl(totais.media) : totais.media.toFixed(2)}
          icon={<Sigma className="w-4 h-4" />}
        />
        <KPI
          title="Tendência (inclinação)"
          value={`${
            totais.tendencia >= 0 ? "+" : ""
          }${modo === "receita" ? brl(totais.tendencia) : totais.tendencia.toFixed(2)}`}
          icon={<TrendingUp className="w-4 h-4" />}
        />
          <KPI
            title={
              periodo === "dia"
                ? "Vendas esperadas (amanhã)"
                : periodo === "semana"
                ? "Vendas esperadas (próx. semana)"
                : "Vendas esperadas (próx. mês)"
            }
            value={totais.esperado.toFixed(1)}
            icon={<Rocket className="w-4 h-4" />}
          />
           <KPI
            title={
              periodo === "dia"
                ? "Prob. de pelo menos 1 venda (amanhã)"
                : periodo === "semana"
                ? "Prob. de pelo menos 1 venda (semana)"
                : "Prob. de pelo menos 1 venda (mês)"
            }
            value={`${Math.round(totais.probAlguma * 100)}%`}
            icon={<TrendingUp className="w-4 h-4" />}
          />
      </div>

      <div ref={chartRef} className="h-80 w-full rounded-2xl border border-zinc-800 p-2">
        <AreaChart
          key={`grafico-${periodo}-${modo}-${mostrarMM}-${analiseAtiva}-${escopoAnalise}-${
            vendasUsadas?.length || 0
          }`}
          width={chartWidth}
          height={305}
          data={dados}
          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopOpacity={0.6} stopColor={C.area} />
              <stop offset="95%" stopOpacity={0} stopColor={C.area} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis dataKey="dataLabel" tick={{ fontSize: 12 }} interval="preserveStartEnd" />

          {/* Eixo esquerdo: valores (receita/quantidade) */}
          +<YAxis
            yAxisId="left"
            tick={{ fontSize: 12 }}
            width={60}
            tickFormatter={(v) => (modo === "quantidade" ? Math.round(v) : v)}
          />

          {/* Eixo direito: Probabilidade (0–100%) */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            width={60}
          />

          <Tooltip
            formatter={(value, name) => [valueFormatter(value, name), name]}
            labelFormatter={(label, payload) =>
              payload?.[0]?.payload?.data
                ? dayjs(payload[0].payload.data).format("DD/MM/YYYY")
                : label
            }
            contentStyle={{
              background: isDark ? "#0a0a0a" : "#ffffff",
              border: "1px solid #262626",
              borderRadius: 12,
              color: isDark ? "#ffffff" : "#000000",
            }}
          />

          <Legend />

          {/* HISTÓRICO */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="previsao"
            name="Vendas esperadas"
            fill="url(#g1)"
            fillOpacity={0.25}
            stroke={C.line}
            strokeWidth={2}
            dot={false}
          />

          {/* PREVISÃO (regressão) */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="previsao"
            name="Previsão"
            stroke={C.line}
            strokeWidth={2}
            dot={false}
            strokeDasharray="6 6"
          />

          {/* PROBABILIDADE (0..1) – controlada pelo botão "Prob" */}
          {mostrarMM && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="prob"
              name="Prob. de venda"
              stroke={C.area}
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 4"
            />
          )}

          {analiseAtiva && <ReferenceLine y={0} stroke="#444" />}
        </AreaChart>
      </div>

      {analiseAtiva && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 text-sm text-zinc-300 space-y-2"
        >
          <p>
            <strong>Leitura rápida:</strong> R² ≈ {totais.r2.toFixed(3)}.{" "}
            {totais.r2 >= 0.6
              ? "Boa aderência do modelo."
              : totais.r2 >= 0.3
              ? "Aderência moderada."
              : "Baixa aderência — histórico possivelmente irregular."}
          </p>
          <ul className="list-disc pl-5">
            <li>
              Inclinação positiva sugere crescimento; negativa, retração. Use com o
              contexto de campanhas e sazonalidade.
            </li>
            <li>
              A projeção probabilística usa Poisson por dia da semana; combine com
              sazonalidade mensal se necessário.
            </li>
          </ul>
        </motion.div>
      )}
    </div>
  );
}

function KPI({ title, value, icon }) {
  return (
    <div className="rounded-2xl border border-zinc-800 p-3 flex items-center gap-3">
      <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white dark:text-white text-black">
        {React.cloneElement(icon, { className: "w-4 h-4" })}
      </div>
      <div className="leading-tight">
        <div className="text-xs opacity-70">{title}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}
