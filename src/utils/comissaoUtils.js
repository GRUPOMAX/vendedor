// src/utils/comissaoUtils.js
import { buildCtx, calcularComissaoPorRegras } from "../services/comissaoService"; // ajuste se o path for diferente

// Função utilitária para tentar extrair CPF de uma venda
export function guessCPF(venda) {
  if (!venda) return "";
  // tenta pegar campo cpf direto
  if (venda.cpf) return String(venda.cpf).replace(/\D/g, "");
  // tenta buscar em cliente
  if (venda.cliente?.cpf) return String(venda.cliente.cpf).replace(/\D/g, "");
  // fallback: se tiver campo documento
  if (venda.documento) return String(venda.documento).replace(/\D/g, "");
  return "";
}

/**
 * Calcula a comissão de UMA venda usando suas REGRAS.
 */
export function comissaoPorVendaRegras(venda, status, regras = [], opts = {}) {
  const cpf = guessCPF(venda);

  const ctx = buildCtx({
    venda,
    status,
    cpf,
    ...opts, // pode conter classificacao, mapaClientes, vendedorAtivo etc.
  });

  const valor = calcularComissaoPorRegras(Array.isArray(regras) ? regras : [], ctx);
  return Number.isFinite(valor) ? valor : 0;
}

/**
 * Soma do período usando SUAS regras.
 */
export function totalComissaoPeriodoRegras(vendas = [], statusByVendedorCpf, regras = [], opts = {}) {
  let totalCentavos = 0;

  for (const v of vendas) {
    const cpf = guessCPF(v);
    const vendedorKey = String(v.__vendedorNome || v.vendedor || v.vendedorNome || "—")
      .trim()
      .toLowerCase();
    const status = statusByVendedorCpf?.[vendedorKey]?.[cpf];

    const val = comissaoPorVendaRegras(v, status, regras, opts);
    totalCentavos += Math.round((+val || 0) * 100);
  }
  return totalCentavos / 100;
}
