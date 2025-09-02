// utils/progressoNivel.js

/**
 * Retorna um fator de peso entre 0 e 1 com base na situação da venda dos vendedores.
 * 
 * @param {Object} cliente - Objeto do cliente (vem do mapa) ARRAY.
 * @returns {number} Peso da venda no progresso. 1 = cheia, 0.5 = parcial, 0 = ignora.
 */
export function pesoVendaParaXP(cliente) {
  if (!cliente) return 0;

  const bloqueado = String(cliente?.Bloqueado).toUpperCase() === 'SIM';
  const semTaxa   = String(cliente?.semTaxa).toUpperCase() === 'SIM';
  const pagouTaxa = String(cliente?.['Pagou Taxa']).toUpperCase() === 'SIM';
  const desistiu  = String(cliente?.Desistiu).toUpperCase() === 'SIM';

  if (desistiu) return 0;
  if (bloqueado) return 0;
  if (!pagouTaxa && !semTaxa) return 0.5;

  return 1;
}
