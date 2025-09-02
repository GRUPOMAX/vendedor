export function calcularComissaoCliente({ cpf, cliente, classificacao, tabela }) {
  if (!cliente) return 0;

  const clsKey = (classificacao || '').toString().toLowerCase();
  const valorComissao = Number(tabela?.map?.[clsKey] ?? 0);

  const normalizar = (v) =>
    (v || '').toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '');

  const pagouTaxa = normalizar(cliente?.["Pagou Taxa"]);
  const bloqueado = normalizar(cliente?.["Bloqueado"]);
  const ativado = normalizar(cliente?.["Ativado"]);
  const desistiu = normalizar(cliente?.["Desistiu"]);

  // BLOQUEADO / DESISTIU → ZERA
  if (bloqueado === 'sim' || desistiu === 'sim') return 0;

  // Classificação "sem taxa"
  if (clsKey === 'sem taxa') return 5;

  if (ativado === 'sim' && pagouTaxa === 'sim') return valorComissao;
  if (ativado === 'sim' && pagouTaxa !== 'sim') return 5;

  // Tudo fora = 0
  return 0;
}
