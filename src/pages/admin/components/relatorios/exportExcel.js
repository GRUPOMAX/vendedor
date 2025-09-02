// admin/components/relatorios/exportExcel.js
// Requer SheetJS (xlsx). Garanta que o projeto tenha a dependência instalada:
// npm i xlsx

import * as XLSX from "xlsx";

/**
 * Gera um arquivo .xlsx a partir de linhas + colunas (labels e accessors compatíveis com exportCSV).
 * @param {any[]} rows
 * @param {{label:string, accessor:string|function(any):any}[]} cols
 * @param {string} filenameBase
 */
export function exportToExcel(rows = [], cols = [], filenameBase = "export") {
  const matrix = [];
  // header
  matrix.push(cols.map((c) => c.label));
  // body
  for (const r of rows) {
    matrix.push(
      cols.map((c) => (typeof c.accessor === "function" ? c.accessor(r) : r[c.accessor]))
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
  XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}
