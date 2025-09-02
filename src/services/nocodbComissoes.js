// src/services/nocodbComissoes.js
const BASE  = import.meta.env.VITE_NOCODB_URL;
const TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;

const TBL   = import.meta.env.VITE_COMISSAO_TABLE || "m21oavwguouzwej"; // <- seu ID
const COL   = "Valores_Comissão"; // exatamente como está na tabela

function headers(extra={}) {
  return { "Content-Type": "application/json", "xc-token": TOKEN, ...extra };
}
async function http(url, init={}) {
  const r = await fetch(url, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${t || r.statusText}`);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
function ensure() {
  if (!BASE || !TOKEN) throw new Error("NocoDB URL/TOKEN ausentes.");
  if (!TBL) throw new Error("Tabela de comissão não configurada.");
}

export async function fetchComissoesJSON() {
  ensure();
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=1&fields=Id,${COL}`;
  const j = await http(url, { headers: headers() });
  const row = j?.list?.[0];
  if (!row) return { rowId:null, json:{} };
  const cell = row[COL];
  const json = typeof cell === "string" ? JSON.parse(cell || "{}") : (cell || {});
  return { rowId: row.Id, json };
}

export function mapComissoesLista(json = {}) {
  // espera estrutura { comissoes: { "Ouro": {valor:"R$ 25,00"}, ... } }
  const dict = json?.comissoes || {};
  return Object.entries(dict).map(([nome, v]) => ({
    id: nome,
    nome,
    valor: String(v?.valor ?? "").trim(), // "R$ 25,00"
  }));
}

// recebe rows [{id?, nome, valor}] e salva de volta no formato da sua coluna
export async function saveComissoesLista(rowId, rows) {
  ensure();
  if (!rowId) throw new Error("RowId de comissão não encontrado.");
  const dict = {};
  for (const r of rows) {
    if (!r?.nome) continue;
    dict[r.nome] = { valor: r.valor ?? "" };
  }
  const next = { comissoes: dict };
  const url  = `${BASE}/api/v2/tables/${TBL}/records`;
  const body = JSON.stringify([{ Id: rowId, [COL]: next }]);
  await http(url, { method:"PATCH", headers: headers(), body });
  return next;
}
