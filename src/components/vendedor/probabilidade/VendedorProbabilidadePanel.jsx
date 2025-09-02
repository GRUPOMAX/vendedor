// src/components/vendedor/probabilidade/VendedorProbabilidadePanel.jsx
import React, { useState, useMemo  } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import { motion } from "framer-motion";
import ProbControls from "./components/ProbControls";
import ProbKPIs from "./components/ProbKPIs";
import ProbChart from "./components/ProbChart";
import HistoricoResumo from "./components/HistoricoResumo";
import { gerarAnaliseCompleta } from "./utils/analiseCompletaVendas";
import dayjs from "./utils/dayjs";
import TaxaCreditoChart from "./components/TaxaCreditoChart";
import { Percent } from "lucide-react"; // ícone do botão
import ChartModal from "../ChartModal";                     // se estiver em src/components/vendedor/probabilidade/ChartModal.jsx

// HOOKS
import { useProbabilidadeDoVendedor } from "./hooks/useProbabilidadeDoVendedor"; // auto-fetch
import { useProbabilidade } from "./hooks/useProbabilidade";                     // modo manual
import { useResumoHistorico } from "./hooks/useResumoHistorico";

export default function VendedorProbabilidadePanel({
  vendedorNome,
  vendedorEmail, // <-- NOVO (necessário p/ montar a URL do histórico completo)
  dateFrom,
  dateTo,
  vendas = [],
  mapaClientes = {},
  titulo = "Probabilidade de Vendas",
  classificacao = "medio",
  cor = "emerald",
}) {
  const [mostrarProb, setMostrarProb] = useState(true);
  const [clicouProbUmaVez, setClicouProbUmaVez] = useState(false);
  const [periodo, setPeriodo] = useState("dia");
  const horizonte = periodo === "mes" ? 6 : periodo === "semana" ? 12 : 30;

  const [loadingAnalise, setLoadingAnalise] = useState(false);
  const [analise, setAnalise] = useState(null); // quando setado, substitui os dados do resumo
  const [habilitarAnalise, setHabilitarAnalise] = useState(false); // controla só o botão
  const usarAutoFetch = !!vendedorNome;
  const [msgNovosDados, setMsgNovosDados] = useState(false);
  const [showTaxaModal, setShowTaxaModal] = useState(false);






const handleSetMostrarProb = (updater) => {
  setMostrarProb((prev) => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    // entrou no HISTÓRICO quando o próximo estado for false
    if (next === false) setClicouProbUmaVez(true);
    return next;
  });
};


  const auto = useProbabilidadeDoVendedor({
    vendedorNome,
    periodo,
    horizonte,
    dateFrom,
    dateTo,
    classificacao,
  });

  const manual = useProbabilidade({
    vendas,
    periodo,
    horizonte,
    mapaClientes,
    classificacao,
  });

  const dados = usarAutoFetch ? auto : manual;

// helper p/ ler Date de vários formatos
const toDate = (raw) => {
  try {
    const s = String(raw ?? "");
    const [d, t] = s.split(",").map(x => x.trim());
    if (t) {
      const [dd, mm, yyyy] = d.split("/");
      const [hh="00", mi="00", ss="00"] = t.split(":");
      return new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
    }
    const dt = new Date(s);
    return isNaN(dt) ? null : dt;
  } catch { return null; }
};

// 1) Detecta automaticamente se há venda em DOMINGO no histórico
const temVendaNoDomingo = useMemo(() => {
  // prioridade 1: se você já clicou "Análise completa", usa o resumo (100% confiável)
  const domAnalise = analise?.weekdayResumo?.find?.(r => r.wd === 0);
  if (domAnalise) return Number(domAnalise.total || 0) > 0;

  // prioridade 2: tenta usar um histórico amplo exposto pelo hook (se houver)
  const basePreferida =
    (auto?.vendasAll && Array.isArray(auto.vendasAll) && auto.vendasAll.length > 0)
      ? auto.vendasAll
      : null;

  const baseFallback = (dados?.vendas && Array.isArray(dados.vendas) && dados.vendas.length > 0)
      ? dados.vendas
      : vendas;

  const base = basePreferida || baseFallback || [];

  for (const r of base) {
    const d = toDate(r?.dataHora ?? r?.data ?? r?.bruto?.dataHora ?? r?.bruto?.data);
    if (d && d.getDay() === 0) return true;
  }
  return false;
  // deps cobrem todas as fontes possíveis
}, [analise?.weekdayResumo, auto?.vendasAll, dados?.vendas, vendas]);

// 2) Regras/ajustes usando a flag dinâmica
const deveZerarDomingos = !temVendaNoDomingo;

// usa a mesma série do hook, mas zera domingos quando nunca vendeu nesse dia
const probsSerie = useMemo(() => {
  const serie = dados?.probs || [];
  if (!deveZerarDomingos) return serie;
  return serie.map(p =>
    dayjs(p.data).day() === 0 ? { ...p, prob: 0, esperadoQtd: 0 } : p
  );
}, [dados?.probs, deveZerarDomingos]);

// encontra o ponto de AMANHÃ na série (e zera se for domingo e nunca vendeu domingo)
const probAmanha = useMemo(() => {
  const alvo = dayjs().add(1, "day").startOf("day");
  if (deveZerarDomingos && alvo.day() === 0) return 0;
  const ponto = (probsSerie || []).find(p => dayjs(p.data).isSame(alvo, "day"));
  return typeof ponto?.prob === "number" ? ponto.prob : (dados?.probAlguma ?? 0);
}, [probsSerie, dados?.probAlguma, deveZerarDomingos]);

// “Vendas esperadas (amanhã)” alinhado com a série e regra de domingo
const esperadoQtdAmanha = useMemo(() => {
  const alvo = dayjs().add(1, "day").startOf("day");
  if (deveZerarDomingos && alvo.day() === 0) return 0;
  const ponto = (probsSerie || []).find(p => dayjs(p.data).isSame(alvo, "day"));
  const daSerie = typeof ponto?.esperadoQtd === "number" ? ponto.esperadoQtd : null;
  return daSerie ?? (dados?.esperadoQtd ?? 0);
}, [probsSerie, dados?.esperadoQtd, deveZerarDomingos]);








  // === NOVO: dias da semana com maior total (após análise completa) ===
const highlightWeekdays = useMemo(() => {
  const arr = analise?.weekdayResumo || [];
  if (!arr.length) return [];
  const max = Math.max(...arr.map(r => Number(r.total || 0)));
  return arr
    .filter(r => Number(r.total || 0) === max)
    .map(r => r.wd); // [1,4] etc. (0=Dom,...,6=Sáb)
}, [analise]);

  /* ---- LOG do que o hook está expondo (janela atual) ----
  console.groupCollapsed("[PROB] Hook estado (janela atual)");
  console.log("usarAutoFetch:", usarAutoFetch, "vendedorNome:", vendedorNome, "vendedorEmail:", vendedorEmail);
  console.log("auto.vendas (janela):", Array.isArray(auto?.vendas) ? auto.vendas.length : auto?.vendas);
  console.log("auto.vendasAll (histórico):", Array.isArray(auto?.vendasAll) ? auto.vendasAll.length : auto?.vendasAll);
  console.log("auto.loadHistoricoCompleto fn?:", typeof auto?.loadHistoricoCompleto === "function");
  console.groupEnd();*/

  // resumo padrão (janela atual)
  const { topDias, weekdayResumo, periodo: janela } = useResumoHistorico({
    vendas: (dados.vendas?.map(v => v.bruto ?? v) || vendas),
  });

// ---------- helpers ----------
    const buildVendedorJsonURL = (nome, email) => {
      if (!nome || !email) return null;

      // Nome: tira acentos e QUALQUER caractere que não seja [a-z0-9]
      const nomeSlug = String(nome)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""); // remove pontuação, espaços, etc.

      // E-mail: minúsculo, troca @ e . por _, remove espaços e qualquer char fora [a-z0-9_]
      const emailSlug = String(email)
        .trim().toLowerCase()
        .replace(/\s+/g, "")
        .replace(/@/g, "_")
        .replace(/\./g, "_")
        .replace(/[^a-z0-9_]/g, ""); // remove +, -, etc.

      if (!nomeSlug || !emailSlug) return null;

      return `https://max.api.email.nexusnerds.com.br/api/vendedor-json/${nomeSlug}__${emailSlug}.json`;
    };


  const montarResumoCompleto = (base) => {
    const parseDate = (raw) => {
      const [d, t] = String(raw ?? "").split(",").map(s => s.trim());
      if (t) {
        const [dd, mm, yyyy] = d.split("/");
        const [hh = "00", mi = "00", ss = "00"] = (t || "").split(":");
        return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
      }
      const dt = new Date(raw);
      return isNaN(dt) ? null : dt;
    };

    const byDate = new Map();
    const daysByWd = new Map();  // wd -> Set(yyyy-mm-dd)
    const salesByWd = new Map(); // wd -> total
    let minD = null, maxD = null;

    for (const r of base) {
      const raw = r?.data ?? r?.dataHora ?? r?.bruto?.data ?? r?.bruto?.dataHora;
      const d = parseDate(raw);
      if (!d) continue;

      const iso = d.toISOString().slice(0,10);
      byDate.set(iso, (byDate.get(iso) || 0) + 1);

      const wd = d.getDay(); // 0..6
      salesByWd.set(wd, (salesByWd.get(wd) || 0) + 1);
      if (!daysByWd.has(wd)) daysByWd.set(wd, new Set());
      daysByWd.get(wd).add(iso);

      if (!minD || d < minD) minD = d;
      if (!maxD || d > maxD) maxD = d;
    }

    const WD = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

    const resumoTopDias = [...byDate.entries()]
      .sort((a,b) => b[1]-a[1])
      .slice(0, 15)
      .map(([iso, vendas]) => ({
        iso,
        label: iso.split("-").reverse().join("/"),
        vendas,
      }));

    const resumoWeekday = [...salesByWd.entries()]
      .sort((a,b) => a[0]-b[0])
      .map(([wd, total]) => {
        const ocorrenciasDia = daysByWd.get(wd)?.size || 1;
        const media = total / ocorrenciasDia;
        return { wd, nome: WD[wd], total, media };
      });

    const periodoResumo = (minD && maxD) ? {
      inicio: minD.toISOString().slice(0,10),
      fim:    maxD.toISOString().slice(0,10),
      diasTotais: Math.max(1, Math.round((maxD - minD) / 86400000) + 1),
    } : null;

    return { topDias: resumoTopDias, weekdayResumo: resumoWeekday, periodo: periodoResumo };
  };

  async function handleAnaliseCompleta() {
    setLoadingAnalise(true);
    try {
      let arr = [];
      let fonte = "desconhecida";

      // 1) Tenta pegar do hook (forma preferida)
      if (usarAutoFetch) {
        if (typeof auto?.loadHistoricoCompleto === "function") {
          fonte = "auto.loadHistoricoCompleto()";
          arr = await auto.loadHistoricoCompleto();
        } else if (Array.isArray(auto?.vendasAll)) {
          fonte = "auto.vendasAll";
          arr = auto.vendasAll;
        } else if (Array.isArray(auto?.vendas)) {
          fonte = "auto.vendas (janela atual)";
          arr = auto.vendas;
        }
      } else {
        fonte = "prop.vendas (manual)";
        arr = vendas;
      }

      // mede o span (em dias) da lista atual
        const spanDias = (list) => {
          if (!Array.isArray(list) || list.length === 0) return 0;
          const toDate = (raw) => {
            try {
              const s = String(raw ?? "");
              // aceita "DD/MM/YYYY, HH:mm:ss" OU ISO
              const [d, t] = s.split(",").map(x => x.trim());
              if (t) {
                const [dd, mm, yyyy] = d.split("/");
                const [hh="00", mi="00", ss="00"] = t.split(":");
                return new Date(+yyyy, +mm - 1, +dd, +hh, +mi, +ss);
              }
              const dt = new Date(s);
              return isNaN(dt) ? null : dt;
            } catch { return null; }
          };

          let min = null, max = null;
          for (const r of list) {
            const d = toDate(r?.dataHora ?? r?.data ?? r?.bruto?.dataHora ?? r?.bruto?.data);
            if (!d) continue;
            if (!min || d < min) min = d;
            if (!max || d > max) max = d;
          }
          if (!min || !max) return 0;
          return Math.max(1, Math.round((max - min) / 86400000) + 1);
        };

      
      // 2) Se veio muito pouco (ex.: só o mês atual), força endpoint público
      // força endpoint se veio pouco OU se a janela é curta (só mês atual, por ex.)
    const span = spanDias(arr);
    const precisaForcarEndpoint =
      !Array.isArray(arr) ||
      arr.length < 15 ||   // ajuste fino: < 15 registros já força
      span < 60;           // ou menos de ~2 meses de histórico

      if (precisaForcarEndpoint) {
        const url = buildVendedorJsonURL(vendedorNome, vendedorEmail);
        if (url) {
          try {
            const resp = await fetch(url, { cache: "no-store" });
            if (resp.ok) {
              const full = await resp.json();
              if (Array.isArray(full) && full.length > (arr?.length || 0)) {
                fonte = `endpoint público (${url})`;
                arr = full;
              } else {
                console.warn("[HIST] Endpoint retornou menos/igual itens. Mantendo fonte:", fonte);
              }
            } else {
              console.warn("[HIST] Endpoint HTTP != 200:", resp.status, resp.statusText);
            }
          } catch (e) {
            console.warn("[HIST] Erro ao buscar endpoint público:", e);
          }
        } else {
          console.warn("[HIST] Não foi possível montar URL do vendedor (faltou vendedorEmail?).");
        }
      }



      // ---- LOG DETALHADO DO HISTÓRICO COMPLETO ----
      (function logHistoricoCompleto(list) {
        const toDate = (raw) => {
          try {
            const [d, t] = String(raw ?? "").split(",").map(s => s.trim());
            if (t) {
              const [dd, mm, yyyy] = d.split("/");
              const [hh="00", mi="00", ss="00"] = (t || "").split(":");
              return new Date(Number(yyyy), Number(mm)-1, Number(dd), Number(hh), Number(mi), Number(ss));
            }
            const dt = new Date(raw);
            return isNaN(dt) ? null : dt;
          } catch { return null; }
        };

        const size = Array.isArray(list) ? list.length : 0;
        let min = null, max = null;
        const byPlan = new Map();
        const byMonth = new Map();

        for (const r of (list || [])) {
          const d = toDate(r?.dataHora ?? r?.data ?? r?.bruto?.dataHora ?? r?.bruto?.data);
          if (d) {
            if (!min || d < min) min = d;
            if (!max || d > max) max = d;
            const ym = d.toISOString().slice(0,7); // YYYY-MM
            byMonth.set(ym, (byMonth.get(ym) || 0) + 1);
          }
          const p = (r?.plano ?? r?.bruto?.plano ?? "Indefinido").toString().trim();
          byPlan.set(p, (byPlan.get(p) || 0) + 1);
        }

        /*console.groupCollapsed("%c[HIST] Histórico completo","color:#10b981;font-weight:600");
        console.log("Fonte:", fonte);
        console.log("Total registros:", size);
        if (min && max) {
          console.log("Janela:", min.toISOString().slice(0,10), "→", max.toISOString().slice(0,10));
        }
        console.log("Planos (contagem):", Object.fromEntries(byPlan));
        console.log("Por mês (YYYY-MM -> qtd):", Object.fromEntries(byMonth));
        console.log("Sample(5):", (list || []).slice(0,5));
        console.groupEnd();*/
      })(arr);
      // ---------------------------------------------

      const base = (arr || []).map(v => v?.bruto ?? v);
      const full = gerarAnaliseCompleta(base);
      const resumo = montarResumoCompleto(base);

      setAnalise({
        ...resumo,                                // <- substitui os dados do HistoricoResumo (gráficos/tabelas)
        diaMaisVendeu: full.diaMaisVendeu,
        diaSemanaMaisVendeu: full.diaSemanaMaisVendeu,
        planoMaisVendido: full.planoMaisVendido,
        distPlano: full.distPlano,
        distSemana: full.distSemana,
        baseCrua: base,
      });
      setMsgNovosDados(true);
      setTimeout(() => setMsgNovosDados(false), 5000); // some depois de 5s
    } finally {
      setLoadingAnalise(false);
    }
  }

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

            {/* NOVO: botão para gráfico de taxa do crédito */}
          <button
            onClick={() => setShowTaxaModal(true)}
            className="px-3 py-1.5 rounded-xl border border-zinc-700 hover:border-zinc-500 flex items-center gap-2 text-sm"
            title="Grafico de vendas com taxa × sem taxa"
          >
            <Percent className="w-4 h-4" />
            Grafico Mensal
          </button>


        <ProbControls
          periodo={periodo}
          setPeriodo={setPeriodo}
          mostrarProb={mostrarProb}
          setMostrarProb={handleSetMostrarProb}
        />
      </motion.div>



      <ProbKPIs
        periodo={periodo}
        esperadoQtd={esperadoQtdAmanha}
        esperadoValor={dados.esperadoValor}
        probAlguma={probAmanha}
        classificacao={classificacao}
      />

      {msgNovosDados && (
        <div className="mb-2 text-sm text-emerald-400">
          Novos dados disponíveis no gráfico
        </div>
      )}


      {mostrarProb && (
        <ProbChart
          probs={probsSerie}
          periodo={periodo}
          cor={cor}
          showHighlights={!!analise}            // só depois da análise completa
          highlightWeekdays={highlightWeekdays} // array de 0..6 (dias campeões)
        />
      )}

      {/* Se analise existe, ela SUBSTITUI os dados do resumo padrão */}
      <HistoricoResumo
        topDias={analise?.topDias || topDias}
        weekdayResumo={analise?.weekdayResumo || weekdayResumo}
        periodo={analise?.periodo || janela}
        onAnaliseCompleta={handleAnaliseCompleta}
        loadingAnalise={loadingAnalise}
        showAnaliseCompleta={!mostrarProb && clicouProbUmaVez}
      />

        <ChartModal
          isOpen={showTaxaModal}
          onClose={() => setShowTaxaModal(false)}
          title="Grafico de Vendas com taxa × sem taxa"
          maxWidthClass="max-w-4xl"
        >
          <TaxaCreditoChart
        vendas={
        analise?.baseCrua      // se já rodou a análise completa, usa ela
        || auto?.vendasAll     // ✅ histórico completo direto do hook
        || (dados.vendas?.map(v => v.bruto ?? v))
        || vendas
        || []
        }
        mapaClientes={auto?.mapa || mapaClientes}  // ✅ compara pelo mapa do NocoDB
            prefer="bar"
        showDesconhecido={true}  // ligue p/ ver onde falta flag
        debug={true}
            height={420}
          />
        </ChartModal>



    </div>
  );
}
