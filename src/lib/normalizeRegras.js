// src/lib/normalizeRegras.js
export function normalizeRegrasFromDb(dbRows = []) {
  return dbRows.map((row) => {
    const reg = typeof row.REGRA === "string" ? JSON.parse(row.REGRA || "{}") : (row.REGRA || {});
    const calc = reg.calc || {};
    return {
      Ativa: row.ATIVO !== false,
      Prioridade: row.PRIORIDADE ?? 999,
      Condicoes: reg.when || {},
      Tipo: String(calc.type || "ajuste"),
      ValorCentavos: calc.valorCentavos,
      Percentual: calc.percentual,
      PararAoAplicar: !!reg.stop,
      Base: calc.base, // "classificacao" | undefined
      // opcionalmente carregue para debug:
      _nome: row.NOME_REGRA,
      _id: row.Id,
    };
  });
}
