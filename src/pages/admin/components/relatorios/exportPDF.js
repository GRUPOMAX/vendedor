// admin/components/relatorios/exportPDF.js
// Requer jspdf e autotable:
// npm i jspdf jspdf-autotable

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Exporta um PDF com tabela.
 * @param {Object} opts
 * @param {string} opts.title           - Título do relatório (opcional)
 * @param {string} opts.subtitle        - Subtítulo (ex.: período)
 * @param {{label:string, accessor:string|function(any):any}[]} opts.columns
 * @param {any[]} opts.rows
 * @param {string} [opts.filenameBase]  - nome sem extensão
 * @param {"portrait"|"landscape"} [opts.orientation]
 */
export function exportToPDF({ title = "Relatório", subtitle = "", columns = [], rows = [], filenameBase = "relatorio", orientation = "portrait" }) {
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });

  // Cabeçalho
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  if (subtitle) {
    doc.setFontSize(10);
    doc.text(subtitle, 40, 58);
  }

  // Tabela
  const head = [columns.map((c) => c.label)];
  const body = rows.map((r) => columns.map((c) => (typeof c.accessor === "function" ? c.accessor(r) : r[c.accessor])));

  autoTable(doc, {
    head,
    body,
    startY: 80,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 185, 129] }, // emerald-ish
    theme: "striped",
  });

  doc.save(`${filenameBase}.pdf`);
}
