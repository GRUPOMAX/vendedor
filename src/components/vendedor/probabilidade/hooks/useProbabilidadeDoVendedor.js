// src/components/vendedor/probabilidade/hooks/useProbabilidadeDoVendedor.js
import { useEffect, useMemo, useState } from "react";
import dayjs, { FMT } from "../utils/dayjs";
import { listarVendedores } from "../../../../services/vendedoresService";
import { carregarMapaClientesDoVendedor, carregarTabelaComissao } from "../../../../services/comissaoService"; // ⬅️ +tabela

// ----------------- helpers -----------------
const norm = (v) => (v ?? "").toString().trim().toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const yes = (v) => {
  const s = norm(v);
  return s === "sim" || s === "true" || s === "1" || s === "paga" || s === "aprovado" || s === "ativo";
};

const getAtivo     = (c = {}) => yes(c.Autorizado) || yes(c.Ativado) || yes(c.ativo) || yes(c.Ativo);
const getTaxaPaga  = (c = {}) => yes(c["Pagou Taxa"]) || yes(c.TaxaPaga) || yes(c.taxaPaga) || norm(c.taxa) === "paga";
const getBloqueado = (c = {}) => yes(c["Bloqueado"]) || yes(c.bloqueado);
const getDesistiu  = (c = {}) => yes(c["Desistiu"])  || yes(c.desistiu);

const probPeloMenosUma = (l) => 1 - Math.exp(-Math.max(0, l));

function inferValor(r) {
  const raw = r?.valor ?? r?.valorTotal ?? r?.preco ?? r?.price ?? r?.ticket ?? r?.amount ?? r?.bruto?.valor;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const n = Number(String(raw).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizeVenda(r) {
  const raw = r?.data ?? r?.dataHora;
  const d = typeof raw === "string" ? dayjs(raw, FMT, true) : dayjs(raw);
  if (!d.isValid()) return null;
  const cpf = String(r.cpf || r.CPF || r.documento || "").replace(/\D/g, "");

  const valor = inferValor(r);
  if (!valor) {
    //console.warn("[inferValor] Sem valor encontrado para:", r?.protocolo || r?.id, r?.cpf, r);
  }

  return { data: d.toDate(), cpf, valor, bruto: r };
}


function perfilWeekday(series, mapaClientes) {
  const buckets = Array.from({ length: 7 }, () => ({ soma: 0, dias: 0 }));
  for (const r of series) {
    const d = dayjs(r.data);
    if (!d.isValid()) continue;
    const wd = d.day();
    const c = mapaClientes[r.cpf] || {};
    const wAtivo = getAtivo(c) ? 1.0 : 0.3;
    const wTaxa = getTaxaPaga(c) ? 1.0 : 0.6;
    const peso = wAtivo * wTaxa;
    buckets[wd].soma += peso;
    buckets[wd].dias += 1;
  }
  return buckets.map((b) => (b.dias > 0 ? b.soma / b.dias : 0));
}

// src/components/vendedor/probabilidade/hooks/useProbabilidadeDoVendedor.js
// ...imports iguais

// helpers iguais (norm/yes/getAtivo/getTaxaPaga/getBloqueado/getDesistiu ...)

export function useProbabilidadeDoVendedor({
  vendedorNome,
  periodo = "dia",
  horizonte = 30,
  dateFrom,
  dateTo,
  classificacao = "medio",
}) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [hist, setHist] = useState([]);     // histórico COMPLETO normalizado
  const [janela, setJanela] = useState([]); // só pra UI (filtro data)
  const [mapa, setMapa] = useState({});
  const [tabelaComissao, setTabelaComissao] = useState({ kind: "fixed", map: {} });

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setLoading(true); setErro(null);

        // ⚠️ ATENÇÃO: aqui precisa importar a função CERTA.
        // Se o arquivo for nocodbVendedores.js, a função exportada chama listVendedores (sem R).
        // => use isso:
        //   import { listVendedores } from "../../../../services/nocodbVendedores";
        //   const lst = await listVendedores();
        // Se estiver usando o catálogo público antigo, mantenha listarVendedores do vendedoresService.
        const lst = await listarVendedores(); // usa seu serviço atual
        const it = lst.find(x => (x.vendedor || "").toLowerCase() === (vendedorNome || "").toLowerCase());
        if (!it) throw new Error("Vendedor não encontrado no catálogo público.");
        const url = `https://max.api.email.nexusnerds.com.br${it.url}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("Falha ao carregar vendas do vendedor.");
        const raw = await res.json();

        const all = (raw || []).map(normalizeVenda).filter(Boolean).sort((a,b)=>+a.data-+b.data);

        // janela apenas para exibir (não afeta o cálculo)
        const df = dateFrom ? dayjs(dateFrom, "YYYY-MM-DD") : null;
        const dt = dateTo   ? dayjs(dateTo,   "YYYY-MM-DD").endOf("day") : null;
        const windowed = all.filter(r => {
          const d = dayjs(r.data);
          if (df && d.isBefore(df)) return false;
          if (dt && d.isAfter(dt))  return false;
          return true;
        });

        // mapa NocoDB (filtra pelos CPFs do HISTÓRICO)
        const cpfs = new Set(all.map(v => v.cpf).filter(Boolean));
        const mapaCompleto = await carregarMapaClientesDoVendedor(vendedorNome);
        const mapaFiltrado = {};
        for (const cpf of cpfs) if (mapaCompleto[cpf]) mapaFiltrado[cpf] = mapaCompleto[cpf];

        // tabela de comissão (valores fixos por classificação)
        const tabela = await carregarTabelaComissao();

        if (!cancel) {
          setHist(all);
          setJanela(windowed);
          setMapa(mapaFiltrado);
          setTabelaComissao(tabela);

          /* 🔊 LOGS pra depurar se está vindo tudo
          console.log("[PROB] Histórico total de vendas:", all.length, { sample: all.slice(0,9) });
          console.log("[PROB] Janela UI (dateFrom/dateTo):", windowed.length, { dateFrom, dateTo });
          console.log("[PROB] CPFs no histórico:", cpfs.size);
          console.log("[PROB] Mapa (filtrado por CPFs):", Object.keys(mapaFiltrado).length, { sample: Object.entries(mapaFiltrado).slice(0,3) });
          console.log("[PROB] Tabela de comissão:", tabela);*/
        }
      } catch (e) {
        if (!cancel) setErro(e.message || String(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [vendedorNome, dateFrom, dateTo]);

  const {
    probs, esperadoQtd, probAlguma, esperadoValor,
    ticketComTaxa, ticketSemTaxa, pTaxa, ticketMedioMix, baseDates,
    valorUnitarioEsperado, mix
  } = useMemo(() => {
    if (!hist.length) {
      return {
        probs: [], esperadoQtd: 0, probAlguma: 0, esperadoValor: 0,
        ticketComTaxa: 0, ticketSemTaxa: 0, pTaxa: 0, ticketMedioMix: 0,
        baseDates: [], valorUnitarioEsperado: 0, mix: { pFull:0, pSem:0, pZero:1 }
      };
    }

    // 1) mistura de status pelos CLIENTES do mapa
    let nFull = 0, nSem = 0, nZero = 0;
    for (const cpf of Object.keys(mapa)) {
      const c = mapa[cpf] || {};
      if (getBloqueado(c) || getDesistiu(c)) { nZero++; continue; }
      if (!getAtivo(c))                        { nZero++; continue; }
      if (getTaxaPaga(c)) nFull++; else nSem++;
    }
    const N = Math.max(1, nFull + nSem + nZero);
    const pFull = nFull / N, pSem = nSem / N, pZero = nZero / N;

    // 2) valor por classificação
    const clsKey = norm(classificacao);
    const valorTabela = Number(tabelaComissao?.map?.[clsKey] ?? 0);

    // 3) valor unitário SEM MIX (sempre o valor da classificação cheia)
    const valorUnit = valorTabela;

    /*console.log("[PROB] Comissão aplicada:", {
    classificacao: clsKey,
    valorTabela,
    valorUnit,
    aplicouMix: false,
    });*/

    // 4) λ por weekday (histórico todo) → previsão de quantidade
    const baseLambda = perfilWeekday(hist, mapa);
    const classBoost = { ruim: 0.9, medio: 1.0, top: 1.15 };
    const lambdaW = baseLambda.map(l => l * (classBoost[classificacao] ?? 1));

    const step = periodo === "mes" ? "month" : periodo === "semana" ? "week" : "day";
    const last = dayjs(hist.at(-1)?.data).isValid() ? dayjs(hist.at(-1).data) : dayjs();

    const out = [];
    const baseDates = [];
    const maxH = periodo === "dia" ? Math.min(30, horizonte) : horizonte;

    for (let i = 1; i <= maxH; i++) {
      const dt = last.add(i, step);
      if (step !== "day") {
        const dias = step === "week" ? 7 : dt.daysInMonth();
        let soma = 0;
        const base = dt.startOf(step);
        for (let k = 0; k < dias; k++) soma += lambdaW[base.add(k,"day").day()] || 0;
        out.push({ data: dt.toDate(), prob: probPeloMenosUma(soma), lambda: soma });
      } else {
        const wd = dt.day();
        const l = lambdaW[wd] || 0;
        out.push({ data: dt.toDate(), prob: probPeloMenosUma(l), lambda: l });
      }
      baseDates.push(dt.toDate());
    }

    // quantidade esperada p/ próxima janela
    const next = last.add(1, step);
    let qtd = 0;
    if (step === "day") {
      qtd = lambdaW[next.day()] || 0;
    } else {
      const dias = step === "week" ? 7 : next.daysInMonth();
      const start = next.startOf(step);
      for (let k = 0; k < dias; k++) qtd += lambdaW[start.add(k,"day").day()] || 0;
    }

    const prob1 = probPeloMenosUma(qtd);
    const esperadoValor = qtd * valorUnit;

    //console.log("[PROB] Saída:", { periodo, qtdEsperada:qtd, probAlguma:prob1, valorUnit, esperadoValor });

    // compat com UI
    const pTaxa = pFull;
    const ticketComTaxa = valorTabela;
    const ticketSemTaxa = 5;
    const ticketMedioMix = valorUnit;

    return {
      probs: out,
      esperadoQtd: qtd,
      probAlguma: prob1,
      esperadoValor,
      ticketComTaxa,
      ticketSemTaxa,
      pTaxa,
      ticketMedioMix,
      baseDates,
      valorUnitarioEsperado: valorUnit,
      mix: { pFull, pSem, pZero }
    };
  }, [hist, mapa, periodo, horizonte, classificacao, tabelaComissao]);

  return {
    loading, erro,
    vendas: janela.length ? janela : hist,
    vendasAll: hist, 
    mapa,
    probs, esperadoQtd, esperadoValor, probAlguma, baseDates,
    ticketComTaxa, ticketSemTaxa, pTaxa, ticketMedioMix,
    valorUnitarioEsperado,
    mix,
  };
}
