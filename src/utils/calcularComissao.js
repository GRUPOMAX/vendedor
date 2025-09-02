export function calcularComissao(status, classificacao, tabelaComissoes) {
  const comissoes = tabelaComissoes.comissoes || {};

  if (status.bloqueado === 'SIM') {
    return 0.00;
  }

  if (status.ativado === 'SIM') {
    if (status.pagouTaxa === 'SIM') {
      return moneyToNumber(comissoes[classificacao]?.valor) || 0.00;
    } else {
      return moneyToNumber(comissoes['Sem Taxa']?.valor) || 5.00;
    }
  }

  return 0.00;
}

function moneyToNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}