// useProbabilidade.js
import { useMemo } from "react";
import dayjs, { FMT } from "../utils/dayjs";

const probPeloMenosUma = (lambda) => 1 - Math.exp(-Math.max(0, lambda));

// --------- normalizadores vindos do NocoDB ----------
const norm = (v) =>
  (v ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const yes = (v) => {
  const s = norm(v);
  // cobre SIM/TRUE/1, e estados que você usa (PAGA/APROVADO/ATIVO)
  return s === "sim" || s === "true" || s === "1" || s === "paga" || s === "aprovado" || s === "ativo";
};

const getAtivo = (c = {}) => yes(c.Autorizado) || yes(c.Ativado) || yes(c.ativo) || yes(c.Ativo);
const getTaxaPaga = (c = {}) => yes(c["Pagou Taxa"]) || yes(c.TaxaPaga) || yes(c.taxaPaga) || norm(c.taxa) === "paga";

// --------- helpers ----------
function inferValor(r) {
  const raw = r?.valor ?? r?.valorTotal ?? r?.preco ?? r?.price ?? r?.ticket ?? r?.amount;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const n = Number(String(raw).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function normalizarRegistros(vendas = []) {
  return (vendas || [])
    .map((r) => {
      const raw = r?.data ?? r?.dataHora;
      const d = typeof raw === "string" ? dayjs(raw, FMT, true) : dayjs(raw);
      if (!d.isValid()) return null;
      const cpf = String(r.cpf || r.CPF || r.documento || "").replace(/\D/g, "");
      return { data: d.toDate(), cpf, valor: inferValor(r) };
    })
    .filter(Boolean)
    .sort((a, b) => +a.data - +b.data);
}

function scoreVendaPorCliente(cpf, mapa = {}) {
  const c = mapa[cpf] || {};
  const wAtivo = getAtivo(c) ? 1.0 : 0.3;
  const wTaxa = getTaxaPaga(c) ? 1.0 : 0.6;
  return wAtivo * wTaxa;
}

function perfilWeekday(series, mapaClientes) {
  const buckets = Array.from({ length: 7 }, () => ({ soma: 0, dias: 0 }));
  for (const r of series) {
    const d = dayjs(r.data);
    if (!d.isValid()) continue;
    const wd = d.day();
    const peso = scoreVendaPorCliente(r.cpf || "", mapaClientes);
    buckets[wd].soma += peso;
    buckets[wd].dias += 1;
  }
  return buckets.map((b) => (b.dias > 0 ? b.soma / b.dias : 0));
}

// --------- HOOK PRINCIPAL ----------
export function useProbabilidade({
  vendas,
  periodo = "dia",       // "dia" | "semana" | "mes"
  horizonte = 30,        // pontos futuros (dias/semanas/meses)
  mapaClientes = {},     // { cpf -> { Autorizado/Ativado/Bloqueado, "Pagou Taxa", ... } }
  classificacao = "medio"
}) {
  const series = useMemo(() => normalizarRegistros(vendas), [vendas]);

  // ---------- TICKETS E MIX DE TAXA (SOMENTE NOCODB) ----------
  const { ticketComTaxa, ticketSemTaxa, pTaxa } = useMemo(() => {
    const cpfs = Object.keys(mapaClientes || {});
    const ativos = cpfs.filter((cpf) => getAtivo(mapaClientes[cpf]));
    const comTaxa = ativos.filter((cpf) => getTaxaPaga(mapaClientes[cpf]));
    const pTaxaMapa = ativos.length ? comTaxa.length / ativos.length : 0;

    // tickets médios do HISTÓRICO, separados via MAPA
    let somaCom = 0, nCom = 0, somaSem = 0, nSem = 0;
    for (const r of series) {
      const c = mapaClientes[r.cpf] || {};
      const v = r.valor || 0;
      if (getTaxaPaga(c)) { somaCom += v; nCom += 1; } else { somaSem += v; nSem += 1; }
    }
    const avgCom = nCom ? somaCom / nCom : 0;
    const avgSem = nSem ? somaSem / nSem : 0;

    // se faltar base de um lado, usa o outro
    const tCom = avgCom || avgSem || 0;
    const tSem = avgSem || avgCom || 0;

    return { ticketComTaxa: tCom, ticketSemTaxa: tSem, pTaxa: pTaxaMapa };
  }, [series, mapaClientes]);

  // ---------- PROBABILIDADE / QUANTIDADE ESPERADA ----------
  const { probs, esperadoQtd, probAlguma, baseDates } = useMemo(() => {
    if (!series.length) return { probs: [], esperadoQtd: 0, probAlguma: 0, baseDates: [] };

    const classBoost = { ruim: 0.9, medio: 1.0, top: 1.15 };
    const step = periodo === "mes" ? "month" : periodo === "semana" ? "week" : "day";

    const lastRaw = series.at(-1)?.data;
    const last = dayjs(lastRaw).isValid() ? dayjs(lastRaw) : dayjs(); // fallback = hoje

    const baseLambda = perfilWeekday(series, mapaClientes);
    const lambdaW = baseLambda.map((l) => l * (classBoost[classificacao] ?? 1));

    const out = [];
    const baseDates = [];
    const maxH = periodo === "dia" ? Math.min(30, horizonte) : horizonte;

    for (let i = 1; i <= maxH; i++) {
      const dt = last.add(i, step);
      if (step !== "day") {
        const dias = step === "week" ? 7 : dt.daysInMonth();
        let soma = 0;
        const base = dt.startOf(step);
        for (let k = 0; k < dias; k++) soma += lambdaW[base.add(k, "day").day()] || 0;
        out.push({ data: dt.toDate(), prob: probPeloMenosUma(soma), lambda: soma });
      } else {
        const wd = dt.day();
        const l = lambdaW[wd] || 0;
        out.push({ data: dt.toDate(), prob: probPeloMenosUma(l), lambda: l });
      }
      baseDates.push(dt.toDate());
    }

    // quantidade esperada na PRÓXIMA janela
    const next = last.add(1, step);
    let esperadoQtd = 0;
    if (step === "day") {
      esperadoQtd = lambdaW[next.day()] || 0;
    } else {
      const dias = step === "week" ? 7 : next.daysInMonth();
      const start = next.startOf(step);
      for (let k = 0; k < dias; k++) esperadoQtd += lambdaW[start.add(k, "day").day()] || 0;
    }
    const probAlguma = probPeloMenosUma(esperadoQtd);

    return { probs: out, esperadoQtd, probAlguma, baseDates };
  }, [series, periodo, horizonte, mapaClientes, classificacao]);

  // ---------- VALOR ESPERADO (mix com/sem taxa com base no NOCODB) ----------
  const ticketMedioMix = pTaxa * ticketComTaxa + (1 - pTaxa) * ticketSemTaxa;
  const esperadoValor = esperadoQtd * ticketMedioMix;

  return {
    series,
    probs,
    esperadoQtd,        // quantidade esperada
    esperadoValor,      // R$ esperado = qtd × ticket(mix)
    probAlguma,
    baseDates,
    // telemetria:
    ticketComTaxa,
    ticketSemTaxa,
    pTaxa,
    ticketMedioMix,
  };
}
