// src/services/authService.js
import { nc, q } from "./http";

const TBL_ADMIN = import.meta.env.VITE_TBL_AUTH_ADMIN;

// ────────────────────────────────────────────────────────────────────────────────
// ACL (regras de conexão)
const API_BASE   = import.meta.env.VITE_API_BASE;
const WHOAMI_URL = import.meta.env.VITE_WHOAMI_URL || "/whoami";
const TBL_AUTH_IP = import.meta.env.VITE_AUTH_IP_RULES || "mqimmtdfgfrho1m";
const AUTH_SCHEMA = (import.meta.env.VITE_AUTH_IP_RULES_SCHEMA || "acl").toLowerCase(); // "acl" | "legacy"

// ——— helpers IP
const normalizeIp = (ip) => {
  const s = String(ip || "").trim();
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return m ? m[1] : s;
};
function ip4ToInt(ip) {
  const m = String(ip).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return ((+m[1] << 24) >>> 0) + ((+m[2] << 16) >>> 0) + ((+m[3] << 8) >>> 0) + (+m[4] >>> 0);
}
function matchCidrV4(ip, cidr) {
  const [base, bitsStr] = String(cidr).split("/");
  const bits = Number(bitsStr);
  if (!Number.isFinite(bits)) return false;
  const ipInt = ip4ToInt(ip);
  const baseInt = ip4ToInt(base);
  if (ipInt == null || baseInt == null) return false;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}
function ipMatchesPattern(ip, pattern) {
  if (!pattern) return false;
  const p = String(pattern).trim();
  if (p.includes("/")) {
    if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(p)) return matchCidrV4(ip, p);
    return ip === p; // IPv6 literal = igualdade simples
  }
  if (p.includes("*")) {
    const re = new RegExp(
      "^" +
        p
          .split(".")
          .map((o) => (o === "*" ? "\\d+" : o.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&")))
          .join("\\.") +
        "$"
    );
    return re.test(ip);
  }
  return ip === p;
}
function normalizeForMatch(ip) { 
  if (!ip) return ""; 
  const m = String(ip).match(/(\d{1,3}\.){3}\d{1,3}/); 
  return m ? m[0] : String(ip); 
}

async function preflightAcl({ ip, role, email }) {
  // chama o teu servidor (middleware ACL já está na rota /protegido)
  const r = await fetch(`${API_BASE}/protegido`, {
    method: 'GET',
    headers: {
      'X-Forwarded-For': ip || '',
      'X-Auth-Role': role || 'any',
      'X-Auth-Email': email || ''
    }
  });
  if (r.ok) return { ok: true };
  let j = null; try { j = await r.json(); } catch {}
  if (j?.error === 'access_denied') {
    throw new Error('Acesso bloqueado por regra de conexão (IP não autorizado).');
  }
  throw new Error('Falha na verificação de acesso.');
}

async function getClientIp(ipOverride) {
  if (ipOverride) return normalizeForMatch(normalizeIp(ipOverride));
  try {
    const whoUrl = WHOAMI_URL.startsWith("http") ? WHOAMI_URL : `${API_BASE}${WHOAMI_URL}`;
    const r = await fetch(whoUrl, { headers: { Accept: "application/json" } });
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();

    if (ct.includes("application/json")) {
      try {
        const j = JSON.parse(body);
        return normalizeForMatch(normalizeIp(j?.ip || j?.address || j?.clientIp || ""));
      } catch {}
    }
    // fallback: extrai um IPv4 de qualquer resposta
    const m = body.match(/(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}/);
    return m ? m[0] : normalizeForMatch(normalizeIp(body.trim()));
  } catch {
    return "";
  }
}


let _rulesCache = { ts: 0, list: [] };
async function fetchAuthIpRules() {
  // cache leve de 60s
  if (Date.now() - _rulesCache.ts < 60_000 && _rulesCache.list.length) return _rulesCache.list;

  const { data } = await nc.get(`/tables/${TBL_AUTH_IP}/records?${q({ limit: 999 })}`);
  const raw = data?.list || [];

  const list = raw
    .map((r) => {
      if (AUTH_SCHEMA === "acl" || ("IP_CIDR" in r || "PRIORITY" in r)) {
        return {
          enabled: !(r.ENABLED === false || r.ENABLED === 0 || r.ENABLED === "false"),
          priority: Number(r.PRIORITY ?? 999),
          action: String(r.ACTION || "ALLOW").toLowerCase(), // allow|deny
          stype: String(r.SUBJECT_TYPE || "GLOBAL").toLowerCase(), // global|role|email
          svalue: String(r.SUBJECT_VALUE || ""),
          pattern: String(r.IP_CIDR || ""),
          name: r.NAME || "",
        };
      }
      // legacy
      return {
        enabled: !(r.ATIVO === false || r.ATIVO === 0 || r.ATIVO === "false"),
        priority: Number(r.PRIORIDADE ?? 999),
        action: String(r.ACAO || "allow").toLowerCase(),
        stype: r.ROLE && r.ROLE !== "any" ? "role" : "global",
        svalue: r.ROLE && r.ROLE !== "any" ? String(r.ROLE) : "",
        pattern: String(r.PATTERN || ""),
        name: r.NOME_REGRA || "",
      };
    })
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  _rulesCache = { ts: Date.now(), list };
  return list;
}

function subjectMatches(user, rule) {
  const st = rule.stype;
  if (st === "global") return true;
  if (st === "role") return String(user?.role || "").toLowerCase() === String(rule.svalue || "").toLowerCase();
  if (st === "email") return String(user?.email || "").toLowerCase() === String(rule.svalue || "").toLowerCase();
  return false;
}

function decideForUser(ip, user, rules, defaultAction = "allow") {
  let decision = defaultAction;
  let matched = null;
  for (const r of rules) {
    if (!subjectMatches(user, r)) continue;
    if (ipMatchesPattern(ip, r.pattern)) {
      decision = r.action;
      matched = r;
      break;
    }
  }
  return { decision, matched };
}

/** Aplica ACL. Se ipOverride vier, usa ele; senão tenta WHOAMI. */
async function enforceIpRulesOrThrow(user, ipOverride) { 
  const [ipRaw, rules] = await Promise.all([getClientIp(ipOverride), fetchAuthIpRules()]); 
  const ip = normalizeForMatch(normalizeIp(ipRaw));
  if (!ip || !rules.length) return { ip, decision: "allow" };

  const { decision, matched } = decideForUser(ip, user, rules, "allow");
  if (decision === "deny") {
    console.warn("[LOGIN BLOQUEADO] ip:", ip, "regra:", matched);
    throw new Error("Acesso bloqueado por regra de conexão (IP não autorizado).");
  }
  return { ip, decision };
}


/** Helper opcional pra prever a decisão na UI (ex.: badge na tela de login) */
export async function previewAclDecision({ ip, role, email }, fallback = "allow") {
  const rules = await fetchAuthIpRules();
  const ipNorm = normalizeIp(ip || (await getClientIp()));
  const { decision, matched } = decideForUser(ipNorm, { role, email }, rules, fallback);
  return { ip: ipNorm, decision, rule: matched };
}

// ────────────────────────────────────────────────────────────────────────────────
// utils comuns
const norm = (s = "") => String(s).trim();
const normEmail = (s = "") => norm(s).toLowerCase();
const stripAccentsLower = (s = "") => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function toBoolLoose(v) {
  if (typeof v === "boolean") return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "sim";
}

// ────────────────────────────────────────────────────────────────────────────────
// ADMIN
const EMAIL_COL_CANDIDATES = ["email", "Email", "E-mail", "e-mail", "E_mail"];

async function findAdminRowByEmail(em) {
  for (const col of EMAIL_COL_CANDIDATES) {
    const where = `(${encodeURIComponent(col)},eq,${em})`;
    try {
      const { data } = await nc.get(`/tables/${TBL_ADMIN}/records?${q({ where, limit: 5 })}`);
      const row = data?.list?.find((r) => normEmail(r?.[col]) === em);
      if (row) return row;
    } catch (err) {
      if (String(err?.message || err).includes("422")) continue;
      throw err;
    }
  }
  return null;
}

export async function loginAdmin({ email, senha, ip }) {
  const em = normEmail(email);
  const pw = norm(senha);
  if (!em || !pw) throw new Error("Informe email e senha.");

  const row = await findAdminRowByEmail(em);
  if (!row) throw new Error("Credenciais inválidas para administrador.");
  const ok = [norm(row?.password), norm(row?.["Password-mester"])].some((v) => v && v === pw);
  if (!ok) throw new Error("Credenciais inválidas para administrador.");

  // ✅ pré-checagem centralizada no servidor
  await preflightAcl({ ip, role: 'admin', email: em });

  // (opcional) manter enforceIpRulesOrThrow como redundância local
  await enforceIpRulesOrThrow({ role:'admin', email: em }, ip); // já existia

  return { role:'admin', name:'Administrador', email: row.email || row.Email || row["E-mail"] || em };
}

export async function loginVendedor({ vendedor, email, ip }) {
  const nome = norm(vendedor);
  const mail = normEmail(email);
  if (!nome || !mail) throw new Error("Informe vendedor e email.");

  const r = await findVendedorByNomeEmail({ vendedorNome:nome, email:mail });
  if (!r.ok) {
    if (r.reason === "not_found") throw new Error("Vendedor ou e-mail não encontrados no NocoDB.");
    if (r.reason === "inactive") throw new Error("Vendedor inativo no NocoDB.");
    if (r.reason === "blocked") throw new Error("Vendedor bloqueado no NocoDB.");
    throw new Error("Falha ao validar vendedor no NocoDB.");
  }

  // ✅ pré-checagem centralizada no servidor
  await preflightAcl({ ip, role: 'vendedor', email: mail });

  // (opcional) redundância local
  await enforceIpRulesOrThrow({ role:'vendedor', email: mail }, ip);

  const v = r.vendedor;
  return {
    role: "vendedor",
    name: v.nome,
    email: v.email,
    telefone: v.telefone ?? "",
    classificacao: v.classificacao ?? "",
    key: v.key,
    ts: Date.now(),
  };
}


// ────────────────────────────────────────────────────────────────────────────────
// VENDEDOR (NocoDB)
const TBL_CAD_VENDEDOR =
  import.meta.env.VITE_NOCODB_TBL_CADASTRO_VENDEDOR ||
  import.meta.env.VITE_VENDEDOR_TABLE ||
  "mo4wnahtbw2mog2";

const COL_VENDEDOR_JSON = "Vendedor";

async function fetchCadastroVendedorJSON() {
  const { data } = await nc.get(
    `/tables/${TBL_CAD_VENDEDOR}/records?${q({
      limit: 1,
      fields: `Id,${COL_VENDEDOR_JSON}`,
    })}`
  );
  const row = data?.list?.[0];
  if (!row) throw new Error("Tabela de cadastro de vendedores vazia (esperava 1 registro).");

  let cadJSON = row?.[COL_VENDEDOR_JSON];
  if (!cadJSON) cadJSON = {};
  if (typeof cadJSON === "string") {
    try {
      cadJSON = JSON.parse(cadJSON);
    } catch {
      cadJSON = {};
    }
  }
  return { rowId: row.Id, cadJSON };
}

function cadastroVendedorToList(cadJSON = {}) {
  const out = [];
  for (const [key, v] of Object.entries(cadJSON || {})) {
    if (!v || typeof v !== "object") continue;
    out.push({
      key,
      nome: v?.nome ?? "",
      email: v?.email ?? "",
      telefone: v?.telefone ?? "",
      classificacao: v?.["Classificação"] ?? v?.Classificacao ?? "",
      ativo: toBoolLoose(v?.ativo),
      bloqueado: toBoolLoose(v?.Bloqueado),
      raw: v,
    });
  }
  return out;
}

async function findVendedorByNomeEmail({ vendedorNome, email }) {
  const alvoNome = stripAccentsLower(vendedorNome);
  const alvoEmail = normEmail(email);
  const { cadJSON } = await fetchCadastroVendedorJSON();
  const lista = cadastroVendedorToList(cadJSON);

  let found = lista.find((v) => stripAccentsLower(v.nome) === alvoNome && normEmail(v.email) === alvoEmail);

  if (!found) {
    const candidatos = lista.filter((v) => normEmail(v.email) === alvoEmail);
    if (candidatos.length === 1) {
      found = candidatos[0];
    } else if (candidatos.length > 1) {
      found = candidatos.find((v) => stripAccentsLower(v.nome).includes(alvoNome));
    }
  }

  if (!found) return { ok: false, reason: "not_found" };
  if (!found.ativo) return { ok: false, reason: "inactive", vendedor: found };
  if (found.bloqueado) return { ok: false, reason: "blocked", vendedor: found };
  return { ok: true, vendedor: found };
}


// (exports úteis)
export { normalizeIp, ipMatchesPattern };
