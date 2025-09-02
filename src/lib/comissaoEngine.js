// src/lib/comissaoEngine.js


export function calcularComissaoTrace({ baseCentavos, ctx, regras = [] }) {
  let total = baseCentavos ?? 0;
  const hits = [];

  const ativos = regras
    .filter((r) => r.Ativa !== false)
    .sort((a, b) => (a.Prioridade ?? 999) - (b.Prioridade ?? 999));

  for (const r of ativos) {
    if (!matchCond(r.Condicoes || {}, ctx)) continue;

    const before = total;
    switch (r.Tipo) {
      case "fixo": {
        // 👇 novo: se base="classificacao", usa o valor já resolvido no ctx
        const v = (r.Base === "classificacao")
          ? ctx.valorClassificacaoCentavos
          : r.ValorCentavos;
        if (Number.isFinite(v)) total = v;
        break;
      }
      case "percentual":
        total = Math.round((ctx.valorPlanoCentavos || 0) * (r.Percentual || 0) / 100);
        break;
      case "ajuste":
        total = Math.max(0, total + (r.ValorCentavos || 0));
        break;
      case "minimo":
        total = Math.max(total, r.ValorCentavos || 0);
        break;
      case "maximo":
        total = Math.min(total, r.ValorCentavos || Infinity);
        break;
      default:
        break;
    }

    hits.push({
      id: r._id, nome: r._nome, tipo: r.Tipo,
      before, after: total, stop: !!r.PararAoAplicar
    });

    if (r.PararAoAplicar) break;
  }

  return { total, hits };
}





export function matchCond(cond = {}, ctx = {}) {
  const get = (k) => ctx[k];

  for (const [k, v] of Object.entries(cond)) {
    const got = get(k);

    // atalho: ["a","b"] => 'in'
    if (Array.isArray(v)) {
      if (!v.includes(got)) return false;
      continue;
    }

    if (v && typeof v === "object") {
      // comparadores
      if ("min" in v && !(got >= v.min)) return false;
      if ("max" in v && !(got <= v.max)) return false;
      if ("in"  in v && ![].concat(v.in).includes(got)) return false;
      if ("nin" in v &&  [].concat(v.nin).includes(got)) return false;
      if ("ne"  in v && !(got !== v.ne)) return false;
      if ("like" in v) {
        const needle = String(v.like ?? "").toLowerCase();
        const hay = String(got ?? "").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if ("exists" in v) {
        const ex = v.exists ? (got !== undefined && got !== null && String(got) !== "")
                            : (got === undefined || got === null || String(got) === "");
        if (!ex) return false;
      }
      continue;
    }

    // igualdade simples
    if (got !== v) return false;
  }
  return true;
}


export function calcularComissao({ baseCentavos, ctx, regras=[] }) {
  let total = baseCentavos ?? 0;
  const ativos = regras
    .filter(r => r.Ativa !== false)
    .sort((a,b)=> (a.Prioridade ?? 999) - (b.Prioridade ?? 999));

  for (const r of ativos) {
    if (!matchCond(r.Condicoes || {}, ctx)) continue;
    switch (r.Tipo) {
      case "fixo": {
        const v = (r.Base === "classificacao")
          ? ctx.valorClassificacaoCentavos
          : r.ValorCentavos;
        if (Number.isFinite(v)) total = v;
        break;
      }
      case "percentual":
        total = Math.round((ctx.valorPlanoCentavos || 0) * (r.Percentual || 0) / 100);
        break;
      case "ajuste":
        total = Math.max(0, total + (r.ValorCentavos || 0));
        break;
      case "minimo":
        total = Math.max(total, r.ValorCentavos || 0);
        break;
      case "maximo":
        total = Math.min(total, r.ValorCentavos || Infinity);
        break;
      default: break;
    }
    if (r.PararAoAplicar) break;
  }
  return total;
}