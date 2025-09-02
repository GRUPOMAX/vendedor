import { useMemo } from "react";
import dayjs, { FMT } from "../utils/dayjs";

const PT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function normalizarRegistros(vendas = []) {
  return (vendas || [])
    .map((r) => {
      const raw = r?.data ?? r?.dataHora;
      const d = typeof raw === "string" ? dayjs(raw, FMT, true) : dayjs(raw);
      if (!d.isValid()) return null;
      const cpf = String(r.cpf || r.CPF || r.documento || "").replace(/\D/g, "");
      return { data: d.toDate(), cpf };
    })
    .filter(Boolean)
    .sort((a, b) => +a.data - +b.data);
}

export function useResumoHistorico({ vendas = [] }) {
  const series = useMemo(() => normalizarRegistros(vendas), [vendas]);

  const { topDias, weekdayResumo, periodo } = useMemo(() => {
    if (!series.length) {
      return {
        topDias: [],
        weekdayResumo: [],
        periodo: { inicio: null, fim: null, diasTotais: 0 }
      };
    }

    const inicio = dayjs(series[0].data).startOf("day");
    const fim = dayjs(series.at(-1).data).startOf("day");
    const diasTotais = fim.diff(inicio, "day") + 1;

    // ---- Agrupa por data (YYYY-MM-DD)
    const byDate = new Map();
    for (const r of series) {
      const k = dayjs(r.data).format("YYYY-MM-DD");
      byDate.set(k, (byDate.get(k) || 0) + 1);
    }
    const topDias = Array.from(byDate.entries())
      .map(([k, v]) => ({ iso: k, label: dayjs(k).format("DD/MM/YYYY"), vendas: v }))
      .sort((a, b) => b.vendas - a.vendas)
      .slice(0, 10);

    // ---- Dia da semana: total e média por ocorrência no período
    // total de "ocorrências" de cada weekday no intervalo observado
    const weekdayOcorr = Array(7).fill(0);
    for (let d = inicio.clone(); d.isBefore(fim) || d.isSame(fim, "day"); d = d.add(1, "day")) {
      weekdayOcorr[d.day()] += 1;
    }

    const weekdayTotais = Array(7).fill(0);
    for (const r of series) weekdayTotais[dayjs(r.data).day()] += 1;

    const weekdayResumo = weekdayTotais.map((tot, wd) => {
      const ocorr = Math.max(1, weekdayOcorr[wd]); // evita divisão por zero
      return {
        wd,
        nome: PT_WEEKDAYS[wd],
        total: tot,
        media: tot / ocorr
      };
    }).sort((a, b) => b.total - a.total);

    return {
      topDias,
      weekdayResumo,
      periodo: { inicio: inicio.toDate(), fim: fim.toDate(), diasTotais }
    };
  }, [series]);

  return { topDias, weekdayResumo, periodo, temDados: series.length > 0 };
}
