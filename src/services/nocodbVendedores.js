// src/services/nocodbVendedores.js
// Atualiza status de cliente PRO CPF/CNPJ formatado dentro do JSON "DadosClientesVendedores"

const BASE = import.meta.env.VITE_NOCODB_URL;
const TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;
const TBL_VENDEDORES = import.meta.env.VITE_NOCODB_TBL_VENDEDORES;
const COL_JSON = 'DadosClientesVendedores';

const TBL_CAD_VENDEDOR =
  import.meta.env.VITE_NOCODB_TBL_CADASTRO_VENDEDOR
  || import.meta.env.VITE_VENDEDOR_TABLE           // fallback: já está no .env
  || 'mo4wnahtbw2mog2';                             // último fallback seguro

const COL_VENDEDOR_JSON = 'Vendedor';

function headersJson(extra = {}) {
  return { 'Content-Type': 'application/json', 'xc-token': TOKEN, ...extra };
}

async function httpJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${txt || r.statusText}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

function ensureEnvCadastroVendedor() {
  if (!BASE || !TOKEN) throw new Error('NocoDB URL/TOKEN ausentes nas envs.');
  if (!TBL_CAD_VENDEDOR) throw new Error('VITE_NOCODB_TBL_CADASTRO_VENDEDOR não configurado.');
}

const normNome = (s="") =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();



// --- [ADICIONE PERTO DOS HELPERS] -----------------
const normEmail = (s = "") => String(s).trim().toLowerCase();
const stripAccentsLower = (s = "") =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function toBoolLoose(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "sim";
}

// Converte o JSON bruto (coluna "Vendedor") em uma lista normalizada
export function cadastroVendedorToList(cadJSON = {}) {
  const out = [];
  for (const [key, v] of Object.entries(cadJSON || {})) {
    if (!v || typeof v !== "object") continue;
    out.push({
      key,
      nome: v?.nome ?? "",
      email: v?.email ?? "",
      telefone: v?.telefone ?? "",
      classificacao: v?.["Classificação"] ?? v?.Classificacao ?? "",
      receberNotificacao:
        String(v?.["ReceberNotificação"] ?? v?.ReceberNotificacao ?? "")
          .toLowerCase() === "true",
      bloqueado: toBoolLoose(v?.Bloqueado),
      ativo: toBoolLoose(v?.ativo),
      raw: v,
    });
  }
  return out;
}

/**
 * Valida login de VENDEDOR direto no NocoDB:
 * - Confere nome + e-mail existentes no JSON "Vendedor" (tabela TBL_CAD_VENDEDOR)
 * - Exige ativo=true (string "True" também vale) e Bloqueado !== true
 *
 * @param {{ vendedorNome: string, email: string }} params
 * @returns {Promise<{ok: true, vendedor: any} | {ok: false, reason: string, vendedor?: any}>}
 */
export async function findVendedorByNomeEmail({ vendedorNome, email }) {
  const alvoNome = stripAccentsLower(vendedorNome);
  const alvoEmail = normEmail(email);

  // Lê o único registro com o JSON Vendedor
  const { cadJSON } = await fetchCadastroVendedorJSON();
  const lista = cadastroVendedorToList(cadJSON);

  // 1) match exato por nome+email (case/acentos normalizado)
  let found = lista.find(
    (v) => stripAccentsLower(v.nome) === alvoNome && normEmail(v.email) === alvoEmail
  );

  // 2) fallback: se nome não bater, tenta por email único
  if (!found) {
    const candidatos = lista.filter((v) => normEmail(v.email) === alvoEmail);
    if (candidatos.length === 1) {
      found = candidatos[0];
    } else if (candidatos.length > 1) {
      // se houver mais de um com o mesmo e-mail (improvável), tenta includes no nome
      found = candidatos.find((v) => stripAccentsLower(v.nome).includes(alvoNome));
    }
  }

  if (!found) return { ok: false, reason: "not_found" };
  if (!found.ativo) return { ok: false, reason: "inactive", vendedor: found };
  if (found.bloqueado) return { ok: false, reason: "blocked", vendedor: found };

  return { ok: true, vendedor: found };
}



/** Busca o ÚNICO registro da tabela VENDEDOR (onde vive o JSON grande) */
export async function fetchCadastroVendedorJSON() {
  ensureEnvCadastroVendedor();
  const url = `${BASE}/api/v2/tables/${TBL_CAD_VENDEDOR}/records?limit=1&fields=Id,${COL_VENDEDOR_JSON}`;
  const j = await httpJson(url, { headers: headersJson() });
  const row = j?.list?.[0];
  if (!row) throw new Error("Tabela VENDEDOR vazia (esperava 1 registro com o JSON).");
  // Se vier string, parseia:
  const json = typeof row[COL_VENDEDOR_JSON] === "string"
    ? JSON.parse(row[COL_VENDEDOR_JSON] || "{}")
    : (row[COL_VENDEDOR_JSON] || {});
  return { rowId: row.Id, cadJSON: json };
}

/** Converte o JSON em lista amigável para UI */
export function mapCadastroVendedor(cadJSON = {}) {
  return Object.entries(cadJSON).map(([key, v]) => ({
    key,
    nome: v?.nome ?? "",
    email: v?.email ?? "",
    telefone: v?.telefone ?? "",
    classificacao: v?.["Classificação"] ?? v?.Classificacao ?? "",
    receberNotificacao: String(v?.["ReceberNotificação"] ?? v?.ReceberNotificacao ?? "").toLowerCase() === "true",
    bloqueado: (String(v?.Bloqueado ?? "").toLowerCase() === "true") || v?.Bloqueado === true,
    pix: v?.pix ?? "",
    _raw: v
  }));
}

/** Encontra a *chave* (vendedor01, vendedor02...) pelo nome */
export function findVendedorKeyByNome(cadJSON, nome) {
  const alvo = normNome(nome);
  for (const [key, v] of Object.entries(cadJSON || {})) {
    if (normNome(v?.nome) === alvo) return key;
  }
  return null;
}


/** Atualiza dados de pagamento (pix, Tipo, nome-cadastro) do vendedor */
export async function updateVendedorPixPorNome_Config({ nome, pix, tipo, nomeCadastro }) {
  const { rowId, cadJSON } = await fetchCadastroVendedorJSON();
  const key = findVendedorKeyByNome(cadJSON, nome);
  if (!key) throw new Error(`Vendedor "${nome}" não encontrado no JSON Vendedor.`);

  const next = {
    ...cadJSON,
    [key]: {
      ...(cadJSON[key] || {}),
      pix: pix ?? "",
      Tipo: tipo || "E-mail",
      "nome-cadastro": nomeCadastro || ""
    }
  };

  const url = `${BASE}/api/v2/tables/${TBL_CAD_VENDEDOR}/records`;
  const body = JSON.stringify([{ Id: rowId, [COL_VENDEDOR_JSON]: next }]);
  return httpJson(url, { method: "PATCH", headers: headersJson(), body });
}


/** Opcional: normaliza chaves como vendedor6 -> vendedor06 (uso manual quando quiser) */
export function normalizeVendedorKeys(cadJSON = {}) {
  const out = {};
  for (const [k, v] of Object.entries(cadJSON)) {
    const m = k.match(/^vendedor(\d+)$/i);
    if (m) {
      const n = Number(m[1]);
      const kk = `vendedor${String(n).padStart(2,"0")}`;
      out[kk] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}



function ensureEnv() {
  if (!BASE || !TOKEN) throw new Error('NocoDB URL/TOKEN ausentes nas envs.');
  if (!TBL_VENDEDORES) throw new Error('VITE_NOCODB_TBL_VENDEDORES não configurado.');
}

// ---------- CPF utils ----------
export function onlyDigits(s) {
  return (s || '').replace(/\D/g, '');
}

export function formatCPF(cpf) {
  const v = onlyDigits(cpf).padStart(11, '0');
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatCNPJ(cnpj) {
  const v = onlyDigits(cnpj).padStart(14, '0');
  return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatDoc(doc) {
  const v = onlyDigits(doc);
  return v.length === 11 || v.length === 14 ? v : String(doc || '').trim();
}

// ---------- READ ----------
export async function listVendedores({ limit = 10000 } = {}) {
  ensureEnv();
  const url = `${BASE}/api/v2/tables/${TBL_VENDEDORES}/records?limit=${limit}`;
  const j = await httpJson(url, { headers: headersJson() });
  return j?.list || [];
}

export async function getVendedorRowByName(nomeVendedor) {
  const all = await listVendedores();

  // Comparação estrita: exatamente igual (case sensitive)
  const row = all.find(
    x => (x.Title || x.title || x.Vendedor || x.vendedor)?.toLowerCase() === nomeVendedor.toLowerCase()
  );


  if (!row) throw new Error(`Vendedor "${nomeVendedor}" não encontrado.`);
  return row;
}


export function parseDadosJson(row) {
  const raw = row?.[COL_JSON];
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  if (typeof raw === 'object') return raw;
  return {};
}

/**
 * Procura em TODOS os vendedores qual registro contém esse CPF/CNPJ formatado como chave do JSON.
 */
export async function findVendedorByCpf(cpfFormatado) {
  const all = await listVendedores();
  for (const row of all) {
    const obj = parseDadosJson(row);
    if (obj && Object.prototype.hasOwnProperty.call(obj, cpfFormatado)) {
      return {
        row,
        vendedorNome: row.Title || row.title,
        dadosJson: obj
      };
    }
  }
  return null;
}

// ---------- WRITE ----------
async function patchById(id, bodyObj) {
  ensureEnv();
  const url = `${BASE}/api/v2/tables/${TBL_VENDEDORES}/records`;
  const payload = [{ Id: id, ...bodyObj }]; // array com objeto
  return httpJson(url, {
    method: 'PATCH',
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
}

/**
 * Upsert DO CPF/CNPJ formatado
 * Se não encontrar o CPF em nenhum vendedor:
 *   - Se for passado `fallbackVendedor`, cria/atualiza lá.
 */
export async function upsertCpfStatusByCpf(cpf, payload, fallbackVendedor) {
  if (!cpf) throw new Error('CPF obrigatório.');
  const cpfFmt = formatDoc(cpf);

  const found = await findVendedorByCpf(cpfFmt);
  if (found) {
    const { row, dadosJson } = found;
    const novo = { ...dadosJson, [cpfFmt]: { ...(dadosJson[cpfFmt] || {}), ...payload } };
    await patchById(row.Id, { [COL_JSON]: novo });
    return {
      vendedor: row.Title || row.title,
      updated: true,
      createdOnFallback: false,
      json: novo
    };
  }

  if (!fallbackVendedor) {
    throw new Error(`CPF ${cpfFmt} não está em nenhum vendedor. Informe fallbackVendedor (ex: "Outros").`);
  }

  const row = await getVendedorRowByName(fallbackVendedor);
  const atual = parseDadosJson(row);
  const novo = { ...atual, [cpfFmt]: { ...(atual[cpfFmt] || {}), ...payload } };
  await patchById(row.Id, { [COL_JSON]: novo });
  return {
    vendedor: fallbackVendedor,
    updated: true,
    createdOnFallback: true,
    json: novo
  };
}

export async function setCpfFieldByCpf(cpf, field, value, fallbackVendedor) {
  return upsertCpfStatusByCpf(cpf, { [field]: value }, fallbackVendedor);
}

export async function removeCpfByCpf(cpf) {
  const cpfFmt = formatDoc(cpf);
  const found = await findVendedorByCpf(cpfFmt);
  if (!found) return { removed: false };
  const { row, dadosJson } = found;
  const { [cpfFmt]: _drop, ...rest } = dadosJson;
  await patchById(row.Id, { [COL_JSON]: rest });
  return { removed: true, vendedor: row.Title || row.title };
}

export async function readCpfStatus(cpf) {
  const cpfFmt = formatDoc(cpf);
  const found = await findVendedorByCpf(cpfFmt);
  if (!found) return null;
  const { dadosJson, vendedorNome } = found;
  return { vendedor: vendedorNome, status: dadosJson[cpfFmt] };
}


// deep-equal leve (ordem de chaves irrelevante)
const _stable = (v) => JSON.stringify(v ?? null, Object.keys(v || {}).sort());
export async function patchCpfStatusIfChanged(cpfKey, nextStatus, vendedor) {
  // lê o registro atual (se existir)
  const curr = await readCpfStatus(cpfKey).catch(() => null); // { id, cpf, vendedor, status }
  const prevStatus = curr?.status ?? null;

  // nada mudou? não patcha
  if (_stable(prevStatus) === _stable(nextStatus) && (curr?.vendedor || vendedor) === vendedor) {
    return { changed: false, id: curr?.id || null };
  }

  // existe linha? PATCH; senão, cria (mantém compat com seu upsert antigo)
  if (curr?.id) {
    // PATCH pela primary key (id) – ajuste a URL helper conforme seu wrapper
    await fetch(`${NOCO_BASE}/db/data/v1/<schema>/<tabela>/${curr.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "xc-token": NOCO_TOKEN },
      body: JSON.stringify({ cpf: cpfKey, vendedor, status: nextStatus }),
    });
    return { changed: true, id: curr.id };
  } else {
    // create
    await upsertCpfStatusByCpf(cpfKey, nextStatus, vendedor);
    return { changed: true, id: null };
  }
}
