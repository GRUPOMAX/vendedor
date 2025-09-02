// src/components/vendedor/probabilidade/utils/analiseCompletaVendas.js
import dayjs from "../utils/dayjs";

const WD = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

export function gerarAnaliseCompleta(vendas = []) {
  const byDate = new Map();
  const byWd   = new Map();
  const byPlan = new Map();

  for (const r of vendas) {
    const raw = r?.data ?? r?.dataHora ?? r?.bruto?.data ?? r?.bruto?.dataHora;
    const d = dayjs(raw, ["DD/MM/YYYY, HH:mm:ss","YYYY-MM-DD","YYYY-MM-DDTHH:mm:ss"], true);
    if (!d.isValid()) continue;

    const iso = d.format("YYYY-MM-DD");
    byDate.set(iso, (byDate.get(iso) || 0) + 1);

    const wd = d.day(); // 0..6
    byWd.set(wd, (byWd.get(wd) || 0) + 1);

    const plano = (r?.plano ?? r?.Plano ?? r?.bruto?.plano ?? r?.bruto?.Plano ?? "Indefinido").toString().trim();
    byPlan.set(plano, (byPlan.get(plano) || 0) + 1);
  }

  const top = (m) => [...m.entries()].sort((a,b)=>b[1]-a[1])[0] || null;

  const tDate = top(byDate);
  const tWd   = top(byWd);
  const tPlan = top(byPlan);

  return {
    diaMaisVendeu: tDate && { iso: tDate[0], label: dayjs(tDate[0]).format("DD/MM/YYYY"), total: tDate[1] },
    diaSemanaMaisVendeu: tWd && { wd: +tWd[0], nome: WD[+tWd[0]], total: tWd[1] },
    planoMaisVendido: tPlan && { nome: tPlan[0], total: tPlan[1] },
    distPlano: [...byPlan.entries()].map(([nome,total]) => ({ nome, total })),
    distSemana: [...byWd.entries()].map(([wd,total]) => ({ wd:+wd, nome: WD[+wd], total })),
  };
}
