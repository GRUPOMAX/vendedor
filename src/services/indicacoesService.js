import { nc, q } from "./http";

const TABLE_ID = "m1k63kk7jhrg4rx";   // INDICAÇÕES VENDAS
const VIEW_ID  = "vwot5v0m4u8ugvl9";

export async function getIndicacoes({ vendedor, limit = 1000 } = {}) {
  const where = vendedor ? `(Vendedor,eq,${vendedor})` : undefined;
  const url = `/tables/${TABLE_ID}/records?${q({ viewId: VIEW_ID, where, limit })}`;
  const { data } = await nc.get(url);
  return data;
}
