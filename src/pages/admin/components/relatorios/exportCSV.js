// admin/components/relatorios/exportCSV.js
// Utilitário simples para exportar CSV com BOM, separador ';' e colunas configuráveis.

/**
 * @typedef {Object} Column
 * @property {string} label   - Cabeçalho da coluna no CSV
 * @property {string|function(any): any} accessor - chave do objeto (string) ou função que recebe a linha
 */

const toCell = (val) => {
  if (val == null) return "";
  // remove quebras de linha e normaliza
  return String(val).replaceAll("\r", " ").replaceAll("\n", " ").trim();
};

const formatCSVValue = (v) => {
  const s = String(v ?? "");
  // se tiver ; , " ou espaço/quebra, coloca em aspas e escapa aspas internas
  if (/[;"\n\r]/.test(s)) return `"${s.replaceAll(`"`, `""`)}"`;
  return s;
};

/**
 * Exporta um array de objetos para CSV usando colunas explicitadas.
 * @param {any[]} rows
 * @param {Column[]} cols
 * @param {string} filenameBase - nome do arquivo sem extensão
 */
export function exportToCSV(rows = [], cols = [], filenameBase = "dados") {
  const sep = ";";
  const header = cols.map((c) => formatCSVValue(c.label ?? "")).join(sep);

  const body = (rows || []).map((row) => {
    return cols
      .map((c) => {
        let val;
        if (typeof c.accessor === "function") {
          try {
            val = c.accessor(row);
          } catch {
            val = "";
          }
        } else if (typeof c.accessor === "string" && c.accessor in row) {
          val = row[c.accessor];
        } else {
          val = "";
        }
        return formatCSVValue(toCell(val));
      })
      .join(sep);
  });

  const csv = [header, ...body].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Atalho para o “Resumo por vendedor” */
export function exportResumoCSV(
  resumo = [],
  { de, ate, filenameBase = "relatorio-comissao" } = {}
) {
  const toNum = (v) => (Number.isFinite(+v) ? +v : 0);

  const cols = [
    { label: "Vendedor", accessor: "vendedor" },
    { label: "Vendas", accessor: (r) => toNum(r.vendas) },
    { label: "Comissão (R$)", accessor: (r) => toNum(r.total).toFixed(2) },
    {
      label: "Ticket médio (R$)",
      accessor: (r) =>
        toNum(r.vendas) ? (toNum(r.total) / toNum(r.vendas)).toFixed(2) : "0.00",
    },
  ];

  const base = `${filenameBase}-resumo_${de}_a_${ate}`;
  exportToCSV(resumo, cols, base);
}

// ⚠️ Intencionalmente não exportamos exportVendasCSV aqui.
// O modal usa exportToCSV(vendasComCalculo, vendasColumnsPDF, base).
