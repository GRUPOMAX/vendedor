// src/features/vendedor/probabilidade/utils/format.js
export function brl(n) {
  try {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  } catch {
    const x = Number(n || 0);
    return `R$ ${x.toFixed(2)}`;
  }
}

export const ticketPorClass = {
  top: 120, "sênior": 120, senior: 120,
  medio: 90, "médio": 90, pleno: 90,
  junior: 60, "júnior": 60,
  default: 80,
};

export function ticketMedio(classificacao) {
  if (!classificacao) return ticketPorClass.default;
  const k = String(classificacao).toLowerCase();
  return ticketPorClass[k] ?? ticketPorClass.default;
}
