// src/services/nocodbVendedoresConfig.js
const BASE  = import.meta.env.VITE_NOCODB_URL;
const TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;

// Tabela ESPECÍFICA de CONFIG (1 linha com a coluna JSON "Vendedor")
const TBL = import.meta.env.VITE_NOCODB_TBL_CONFIG_VENDEDORES;
const COL = "Vendedor"; // nome da coluna JSON

function headers(extra = {}) {
  return { "Content-Type": "application/json", "xc-token": TOKEN, ...extra };
}
async function http(url, init = {}) {
  const r = await fetch(url, init);
  const t = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${t || r.statusText}`);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}
function ensure() {
  if (!BASE || !TOKEN) throw new Error("NocoDB URL/TOKEN ausentes.");
  if (!TBL) throw new Error("VITE_NOCODB_TBL_CONFIG_VENDEDORES ausente.");
}

export async function fetchConfigVendedoresJSON() {
  ensure();
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=1&fields=Id,${COL}`;
  const j = await http(url, { headers: headers() });
  const row = j?.list?.[0];
  if (!row) return { rowId: null, json: {} };
  const cell = row[COL];
  const json = typeof cell === "string" ? JSON.parse(cell || "{}") : (cell || {});
  return { rowId: row.Id, json };
}

export async function saveConfigVendedoresJSON(rowId, nextJson) {
  ensure();
  if (!rowId) throw new Error("RowId não encontrado para salvar.");
  const url  = `${BASE}/api/v2/tables/${TBL}/records`;
  const body = JSON.stringify([{ Id: rowId, [COL]: nextJson }]);
  return http(url, { method: "PATCH", headers: headers(), body });
}

export function mapConfigVendedores(json = {}) {
  const arr = Object.entries(json).map(([key, v]) => ({
    key,
    nome: v?.nome ?? "",
    email: v?.email ?? "",
    telefone: v?.telefone ?? "",
    classificacao: v?.["Classificação"] ?? v?.Classificacao ?? "",
    receberNotificacao: String(v?.["ReceberNotificação"] ?? v?.ReceberNotificacao ?? "")
      .toLowerCase() === "true",
    bloqueado: (String(v?.Bloqueado ?? "").toLowerCase() === "true") || v?.Bloqueado === true,
    pix: v?.pix ?? "",
    tipo: v?.Tipo ?? "",
    nomeCadastro: v?.["nome-cadastro"] ?? "",
    // NOVOS CAMPOS
    cpf: v?.cpf ?? "",
    codigo: v?.codigo ?? "",
    ativo: typeof v?.ativo === "boolean" ? v.ativo
      : String(v?.ativo ?? "").trim().toLowerCase() === "true",
    metaMensal: v?.metaMensal ?? "",
    _raw: v,
  }));
  arr.sort((a,b)=> a.key.localeCompare(b.key, "pt-BR", { numeric: true }));
  return arr;
}

export function patchVendedorNoJSON(json, nome, patch) {
  const norm = (s="") => s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
  const alvo = norm(nome);
  const entry = Object.entries(json).find(([_, v]) => norm(v?.nome || "") === alvo);
  if (!entry) return { next: json, changed: false, key: null };
  const [key, val] = entry;
  const next = { ...json, [key]: { ...(val || {}), ...patch } };
  return { next, changed: true, key };
}

/** --------- 🔽 NOVO: criação --------- **/

// pega o próximo índice de "vendedorNN" dentro das chaves existentes
export function nextVendedorKey(json = {}) {
  let max = 0;
  for (const k of Object.keys(json)) {
    const m = /^vendedor(\d+)$/i.exec(String(k));
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  const n = max + 1;
  // manter simples (sem zero à esquerda, pois já há mistura no seu JSON)
  return `vendedor${n}`;
}

// normaliza o payload nas MESMAS chaves que você já usa no JSON
export function makeVendedorPayload(input = {}) {
  const bool = (v) => (typeof v === "boolean" ? v : String(v ?? "").toLowerCase() === "true");

  return {
    // chaves “legadas” (iguais às que já existem)
    "Classificação": input.classificacao ?? input["Classificação"] ?? "",
    "ReceberNotificação": String(
      input.receberNotificacao ?? input["ReceberNotificação"] ?? false
    ) === "true" || input.receberNotificacao === true ? "True" : "False",
    "nome": input.nome ?? "",
    "telefone": input.telefone ?? "",
    "email": input.email ?? "",
    "Bloqueado": bool(input.Bloqueado ?? input.bloqueado ?? false),
    "pix": input.pix ?? "",
    "Tipo": input.Tipo ?? input.tipo ?? "",
    "nome-cadastro": input["nome-cadastro"] ?? input.nomeCadastro ?? "",

    // novos campos que você já lê no map
    "cpf": input.cpf ?? "",
    "codigo": input.codigo ?? "",
    "ativo": bool(input.ativo ?? true),
    "metaMensal": input.metaMensal ?? "",
  };
}

export async function createVendedorInConfig(rowId, currJson = {}, input) {
  const key = nextVendedorKey(currJson);
  const payload = makeVendedorPayload(input);
  const next = { ...currJson, [key]: payload };
  await saveConfigVendedoresJSON(rowId, next);
  return { key, next };
}
