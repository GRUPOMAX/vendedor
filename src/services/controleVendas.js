import { nc, q } from "./http";

/** IDs do NocoDB */
const TABLE_ID = "myyj60ek0dxwpbh";    // CONTROLE DE VENDAS
const VIEW_ID  = "vwd7cnlhei5hvhnu";   // view padrão

/**
 * Filtro por período e vendedor usando NocoDB where
 * - dateFrom/dateTo: strings 'YYYY-MM-DD'
 * - vendedor: string (nome exato salvo no registro)
 */
export async function getControleVendas({ dateFrom, dateTo, vendedor, limit = 1000, offset = 0 } = {}) {
  const whereClauses = [];

  if (dateFrom && dateTo) {
    // CreatedAt entre as datas (ajuste se sua coluna de data for outra)
    whereClauses.push(`(CreatedAt,bt,${dateFrom},${dateTo})`);
  } else if (dateFrom) {
    whereClauses.push(`(CreatedAt,ge,${dateFrom})`);
  } else if (dateTo) {
    whereClauses.push(`(CreatedAt,le,${dateTo})`);
  }

  if (vendedor) {
    // tente casar pelo campo Vendedor (ou Title, conforme seu schema)
    whereClauses.push(`(Vendedor,eq,${vendedor})`);
  }

  const where = whereClauses.length ? whereClauses.join("~and") : undefined;

  const url = `/tables/${TABLE_ID}/records?${q({
    viewId: VIEW_ID,
    where,
    limit,
    offset,
  })}`;

  const { data } = await nc.get(url);
  return data; // { list, PageInfo }
}
