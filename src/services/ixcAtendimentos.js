// services/ixcAtendimentos.js
const ATEND_BASE = "https://ixc-buscar-atendimentos.api.webserver.app.br/atendimentos";

// cache simples em memória
let _statusCatalog = null;

export async function fetchStatusCatalog() {
  if (_statusCatalog) return _statusCatalog;
  const r = await fetch(`${ATEND_BASE}/status`, { cache: "no-store" });
  const j = await r.json();
  // { catalog: { values: { N:"Novo", P:"Pendente", EP:"Em progresso", S:"Solucionado", C:"Cancelado" } } }
  _statusCatalog = j?.catalog?.values || {};
  return _statusCatalog;
}

/**
 * Dado um id de cliente, retorna o SU_STATUS do atendimento mais recente (ou null)
 */
export async function fetchUltimoSuStatusByClienteId(clienteId) {
  const url = `${ATEND_BASE}?clienteId=${encodeURIComponent(clienteId)}&rp=1000&labels=1`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Atendimentos ${r.status}`);
  const j = await r.json();
  const items = Array.isArray(j?.items) ? j.items : [];
  if (!items.length) return null;
  // ordena por data_ultima_alteracao (ou ultima_atualizacao) desc
  items.sort((a, b) => (b?.ultima_atualizacao || b?.data_ultima_alteracao || "").localeCompare(a?.ultima_atualizacao || a?.data_ultima_alteracao || ""));
  return items[0]?.su_status || null; // "EP", "P", "S", etc.
}


// NOVO: lista completa p/ o modal
export async function fetchAtendimentosByClienteId(clienteId) {
  const url = `${ATEND_BASE}?clienteId=${encodeURIComponent(clienteId)}&rp=1000&labels=1`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Atendimentos ${r.status}`);
  const j = await r.json();
  const items = Array.isArray(j?.items) ? j.items : [];
  // mais recentes primeiro
  items.sort((a, b) => (b?.ultima_atualizacao || "").localeCompare(a?.ultima_atualizacao || ""));
  return items;
}