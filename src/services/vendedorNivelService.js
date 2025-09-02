// Serviço para ler/atualizar a classificação do vendedor no JSON "Vendedor"
// TABELA: mo4wnahtbw2mog2 (NocoDB)

const BASE  = import.meta.env.VITE_NOCODB_URL || 'https://nocodb.nexusnerds.com.br';
const TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;
const TBL_VENDEDOR = 'mo4wnahtbw2mog2'; // <- corrigido com base no erro
const COL_JSON = 'Vendedor';

function headers() {
  return { 'Content-Type': 'application/json', 'xc-token': TOKEN };
}

async function http(url, opts={}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${txt || r.statusText}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

// Lê o primeiro registro da tabela e retorna: { rowId, vendedoresJson }
export async function readVendedoresJson() {
  const data = await http(`${BASE}/api/v2/tables/${TBL_VENDEDOR}/records?limit=1`, {
    headers: headers()
  });

  const row = data?.list?.[0];
  if (!row) throw new Error('Tabela de Vendedor vazia');

  const rowId = row?.Id || row?.ID_ || row?.id || row?.id_; // ⚠️ "Id" é o PK principal
  if (!rowId) throw new Error('ID_ do registro não encontrado');

  const vendedoresJson = row[COL_JSON]
    ? (typeof row[COL_JSON] === 'string' ? JSON.parse(row[COL_JSON]) : row[COL_JSON])
    : {};

  return { rowId, vendedoresJson };
}

// Lê apenas a Classificação atual de uma chave ("vendedor01", etc)
export async function readClassificacao(vendedorKey) {
  const { vendedoresJson } = await readVendedoresJson();
  const atual = vendedoresJson?.[vendedorKey]?.['Classificação'];
  return typeof atual === 'string' ? atual : null;
}

// Atualiza a Classificação no JSON e faz PATCH do registro
export async function updateClassificacao(vendedorKey, novaClassificacao) {
  const { rowId, vendedoresJson } = await readVendedoresJson();
  const atual = vendedoresJson[vendedorKey] || {};

  const novoJson = {
    ...vendedoresJson,
    [vendedorKey]: { ...atual, ['Classificação']: novaClassificacao }
  };

  // Corpo como array para bulk update, incluindo o PK "Id"
  const body = JSON.stringify([ { Id: rowId, [COL_JSON]: novoJson } ]);

  const res = await http(`${BASE}/api/v2/tables/${TBL_VENDEDOR}/records`, { // <- sem /{rowId}
    method: 'PATCH',
    headers: headers(),
    body
  });

  return res;
}