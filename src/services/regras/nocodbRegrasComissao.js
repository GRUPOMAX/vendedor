// src/services/regras/nocodbRegrasComissao.js
const BASE  = import.meta.env.VITE_NOCODB_URL;
const TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;
const TBL   = import.meta.env.VITE_NOCODB_TBL_REGRAS_COMISSAO; // << nova env

function headers(extra={}) { return { "Content-Type":"application/json", "xc-token":TOKEN, ...extra }; }
async function http(url, init={}) {
  const r = await fetch(url, init); const t = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${t || r.statusText}`);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
function ensure(){ if(!BASE||!TOKEN) throw new Error("NocoDB URL/TOKEN ausentes."); if(!TBL) throw new Error("VITE_NOCODB_TBL_REGRAS_COMISSAO ausente."); }

export async function listRegras() {
  ensure();
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=500&sort=PRIORIDADE`;
  const j = await http(url, { headers: headers() });
  return j?.list || [];
}
export async function createRegra(data) {
  ensure();
  const url = `${BASE}/api/v2/tables/${TBL}/records`;
  const body = JSON.stringify([{
    NOME_REGRA: data.NOME_REGRA,
    PRIORIDADE: data.PRIORIDADE ?? 999,
    REGRA: data.REGRA || {},
    ATIVO: data.ATIVO ?? true,
    DESCRICAO: data.DESCRICAO ?? "",
    TAGS: data.TAGS ?? ""
  }]);
  const j = await http(url, { method:"POST", headers: headers(), body });
  return j?.[0] || null;
}
export async function updateRegra(id, patch) {
  ensure();
  const url = `${BASE}/api/v2/tables/${TBL}/records`;
  const body = JSON.stringify([{ Id:id, ...patch }]);
  await http(url, { method:"PATCH", headers: headers(), body });
}
export async function deleteRegra(id) {
  ensure();
  const url = `${BASE}/api/v2/tables/${TBL}/records`;
  const body = JSON.stringify([{ Id:id }]);
  await http(url, { method:"DELETE", headers: headers(), body });
}
