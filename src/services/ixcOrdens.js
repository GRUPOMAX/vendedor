// services/ixcOrdens.js
const BASE = "https://ixc-buscar-ordens.api.webserver.app.br";

export async function fetchOrdensByTicketId(ticketId, { page = 1, rp = 50, labels = 1 } = {}) {
  if (!ticketId) return [];
  const url = `${BASE}/ordens?ticketId=${encodeURIComponent(ticketId)}&page=${page}&rp=${rp}&labels=${labels}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao buscar OS: ${r.status}`);
  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

export async function fetchOrdensStatusCatalog() {
  const url = `${BASE}/ordens/status`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao buscar catálogo de status: ${r.status}`);
  const j = await r.json();
  const values = j?.catalog?.values || {};
  return values; // ex.: { A: "Aberta", F: "Finalizada", ... }
}

// Busca o nome do assunto por ID (ex.: 23 -> "Reparo Geral")
export async function fetchAssuntoById(id) {
  const assuntoId = String(id ?? "").trim();
  if (!assuntoId) return { id: assuntoId, assunto: null };

  const url = `${BASE}/assuntos/${encodeURIComponent(assuntoId)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao buscar assunto ${assuntoId}: ${r.status}`);
  const j = await r.json();

  // a API retorna { item: { assunto: "..." } }
  const assunto =
    j?.item?.assunto ??
    j?.rows?.[0]?.assunto ??
    null;

  return { id: assuntoId, assunto };
}
