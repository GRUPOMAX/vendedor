// services/ixcFuncionarios.js
const BASE = "https://ixc-fornecedor.api.webserver.app.br/api";

const _cache = new Map(); // id -> { nomeCompleto, primeiroNome }

const firstName = (s = "") => {
  const t = String(s).trim().split(/\s+/)[0] || "";
  // deixa com inicial maiúscula (opcional)
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

export async function fetchFuncionarioNomeById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  if (_cache.has(key)) return _cache.get(key);

  try {
    const r = await fetch(`${BASE}/funcionario?id=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const row = j?.rows?.[0];
    const nomeCompleto = row?.funcionario || "";
    const pNome = firstName(nomeCompleto);
    const out = { nomeCompleto, primeiroNome: pNome || key };
    _cache.set(key, out);
    return out;
  } catch {
    const out = { nomeCompleto: "", primeiroNome: key }; // fallback: mostra id
    _cache.set(key, out);
    return out;
  }
}
