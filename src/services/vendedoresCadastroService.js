// src/services/vendedoresCadastroService.js
// Lê o JSON de cadastro de vendedores e devolve [{nome, email, telefone}]

const BASE = import.meta.env.VITE_NOCODB_URL;
const TOKEN =
  import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;
  // Tabela que contém o JSON de CADASTRO (nome/email/telefone)
  const TBL_VENDEDORES =
  import.meta.env.VITE_NOCODB_TBL_CADASTRO_VENDEDOR // preferencial
  || import.meta.env.VITE_VENDEDOR_TABLE            // compat antigo
  || import.meta.env.VITE_NOCODB_TBL_VENDEDORES;    // último recurso

const CADASTRO_COL_ENV =
  import.meta.env.VITE_NOCODB_VEND_CADASTRO_COL ||
  import.meta.env.VITE_COL_CADASTRO ||
  "Vendedor";

function headersJson(extra = {}) {
  return { "Content-Type": "application/json", "xc-token": TOKEN, ...extra };
}
async function httpJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${txt || r.statusText}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}
function ensureEnv() {
  if (!BASE || !TOKEN) throw new Error("NocoDB URL/TOKEN ausentes nas envs.");
  if (!TBL_VENDEDORES) throw new Error("VITE_NOCODB_TBL_VENDEDORES não configurado.");
}

const norm = (s="") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
function parseMaybeJSON(v) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!(s.startsWith("{") || s.startsWith("["))) return null;
    try { return JSON.parse(s); } catch { return null; }
  }
  return null;
}

export async function fetchVendedorRows({ limit = 10000 } = {}) {
  ensureEnv();
  const url = `${BASE}/api/v2/tables/${TBL_VENDEDORES}/records?limit=${limit}`;
  const j = await httpJson(url, { headers: headersJson() });
  return j?.list || [];
}

function detectCadastroJsonColumn(row) {
  if (!row) return null;
  if (CADASTRO_COL_ENV in row) return CADASTRO_COL_ENV; // .env primeiro
  const candidates = ["Vendedor","VENDEDOR","vendedores","cadastro","Cadastro","DadosVendedores"];
  for (const k of candidates) if (k in row) return k;
  for (const [k, v] of Object.entries(row)) {
    const obj = parseMaybeJSON(v);
    if (obj && JSON.stringify(obj).toLowerCase().includes('"email"')) return k;
  }
  return null;
}

function fromCadastroObjToArray(obj) {
  const arr = [];
  for (const it of Object.values(obj || {})) {
    arr.push({
      nome     : it?.nome || it?.Nome || it?.title || it?.Title || "",
      email    : it?.email || it?.Email || it?.login || it?.Login || "",
      telefone : it?.telefone || it?.Telefone || "",
    });
  }
  return arr.filter(v => v.nome);
}

/** Lê o JSON da coluna de cadastro e retorna [{nome,email,telefone}] */
export async function listVendedoresCadastro() {
  const rows = await fetchVendedorRows({ limit: 10000 }); // <— varre várias linhas
  if (!rows.length) return [];

  let cadastro = null;
  // procura a primeira linha que tenha a coluna com JSON válido
  for (const row of rows) {
    const col = detectCadastroJsonColumn(row);
    if (!col) continue;
    const obj = parseMaybeJSON(row[col]);
    if (obj && Object.keys(obj).length) { cadastro = obj; break; }
    console.log("[CADASTRO] Tabela:", TBL_VENDEDORES, "Coluna:", CADASTRO_COL_ENV);

    
  }

  if (!cadastro) return [];
  return fromCadastroObjToArray(cadastro);
}

// Alias para manter o nome esperado no front
export const listVendedores = listVendedoresCadastro;

export async function getEmailDoVendedorByNome(nome) {
  const lista = await listVendedoresCadastro();
  const item = lista.find(v => norm(v.nome) === norm(nome));
  return item?.email || "";

}
