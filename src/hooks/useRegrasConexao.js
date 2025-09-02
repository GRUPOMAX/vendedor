// src/hooks/useRegrasConexao.js
// CRUD das regras de conexão (IP allow/deny) na tabela AUTH_IP_RULES do NocoDB
// Retorna: { items, loading, error, reload, add, patch, remove }
//
// Env (Vite):
//  - VITE_NOCODB_URL
//  - VITE_NOCODB_TOKEN
//  - VITE_AUTH_IP_RULES (ID da tabela)
//  - VITE_AUTH_IP_RULES_SCHEMA = "acl" | "legacy"  (default: acl)
// Fallbacks opcionais: window.__NOCODB = { url, token, AUTH_IP_RULES }

import { useCallback, useEffect, useMemo, useState } from "react";

const V = (typeof import.meta !== "undefined" && import.meta.env) || {};
const ENV = {
  url: V.VITE_NOCODB_URL || (typeof window !== "undefined" && window.__NOCODB?.url) || "https://nocodb.nexusnerds.com.br",
  token: V.VITE_NOCODB_TOKEN || (typeof window !== "undefined" && window.__NOCODB?.token) || "",
  tbl: V.VITE_AUTH_IP_RULES || (typeof window !== "undefined" && window.__NOCODB?.AUTH_IP_RULES) || "mqimmtdfgfrho1m",
  schema: (V.VITE_AUTH_IP_RULES_SCHEMA || "acl").toLowerCase(), // "acl" | "legacy"
};

const HDRS = () => ({
  "Content-Type": "application/json",
  ...(ENV.token ? { "xc-token": ENV.token } : {}),
});

const apiList = (params = "") => `${ENV.url}/api/v2/tables/${ENV.tbl}/records${params}`; // v2 by tableId
const apiOne  = (id)           => `${ENV.url}/api/v2/tables/${ENV.tbl}/records/${id}`;

// ————————————————————————————————————————————————————————————————
// Normalização (para o componente)
const toBool = (v) => !(v === false || v === 0 || v === "false");
const up = (s) => (s == null ? "" : String(s).trim().toUpperCase()); 
const low = (s) => (s == null ? "" : String(s).trim().toLowerCase());

// — Normalização (NocoDB -> UI)
const normalizeRow = (r = {}) => {
  const isACL = ENV.schema === "acl" || ("IP_CIDR" in r || "ENABLED" in r || "PRIORITY" in r);
  if (isACL) {
    const st = (r.SUBJECT_TYPE || "GLOBAL").toString().toLowerCase();
    const sv = r.SUBJECT_VALUE || "";
    const roleCompat = st === "role" ? (sv || "any") : "any"; // p/ UI antiga/lista

    return {
      Id: r.Id ?? r.id ?? r.ID ?? r._id,
      ATIVO: !(r.ENABLED === false || r.ENABLED === 0 || r.ENABLED === "false"),
      PRIORIDADE: Number(r.PRIORITY ?? 999),
      NOME_REGRA: r.NAME || "",
      DESCRICAO: r.NOTE || "",
      TAGS: r.TAGS || "",
      PATTERN: r.IP_CIDR || "",
      ACAO: (r.ACTION || "ALLOW").toString().toLowerCase(), // exibe lower
      SUBJECT_TYPE: st,               // global | role | email
      SUBJECT_VALUE: sv || "",        // "" | "Admin" | "fulano@..."
      ROLE: roleCompat,               // compat p/ tabela
      __raw: r,
    };
  }

  // legacy...
  return {
    Id: r.Id ?? r.id ?? r.ID ?? r._id,
    ATIVO: !(r.ATIVO === false || r.ATIVO === 0 || r.ATIVO === "false"),
    PRIORIDADE: Number(r.PRIORIDADE ?? 999),
    NOME_REGRA: r.NOME_REGRA || "",
    DESCRICAO: r.DESCRICAO || "",
    TAGS: r.TAGS || "",
    PATTERN: r.PATTERN || "",
    ACAO: (r.ACAO || "allow").toLowerCase(),
    ROLE: r.ROLE || "any",
    __raw: r,
  };
};

// src/hooks/useRegrasConexao.js

// mapeia SOMENTE as chaves recebidas (evita reset indesejado)
const denormalizePatch = (p = {}) => {
  const out = {};

  if (ENV.schema !== "acl") {
    if ("ATIVO" in p)        out.ATIVO        = !(p.ATIVO === false || p.ATIVO === 0 || p.ATIVO === "false");
    if ("PRIORIDADE" in p)   out.PRIORIDADE   = Number(p.PRIORIDADE ?? 999);
    if ("NOME_REGRA" in p)   out.NOME_REGRA   = p.NOME_REGRA || "";
    if ("DESCRICAO" in p)    out.DESCRICAO    = p.DESCRICAO || "";
    if ("TAGS" in p)         out.TAGS         = p.TAGS || "";
    if ("PATTERN" in p)      out.PATTERN      = p.PATTERN || "";
    if ("ACAO" in p)         out.ACAO         = String(p.ACAO || "").toLowerCase();
    if ("ROLE" in p)         out.ROLE         = p.ROLE || "any";
    return out;
  }

  // schema ACL
  if ("ATIVO" in p)        out.ENABLED     = !(p.ATIVO === false || p.ATIVO === 0 || p.ATIVO === "false");
  if ("PRIORIDADE" in p)   out.PRIORITY    = Number(p.PRIORIDADE ?? 999);
  if ("NOME_REGRA" in p)   out.NAME        = p.NOME_REGRA || "";
  if ("DESCRICAO" in p)    out.NOTE        = p.DESCRICAO || "";
  if ("TAGS" in p)         out.TAGS        = p.TAGS || "";
  if ("PATTERN" in p)      out.IP_CIDR     = p.PATTERN || "";
  if ("ACAO" in p)         out.ACTION      = String(p.ACAO).toUpperCase();

  const hasST = "SUBJECT_TYPE" in p;
  const hasSV = "SUBJECT_VALUE" in p;

  if (hasST) {
    const st = String(p.SUBJECT_TYPE || "global").toLowerCase();
    out.SUBJECT_TYPE = st.toUpperCase();              // GLOBAL | ROLE | EMAIL
    if (st === "global") {
      out.SUBJECT_VALUE = "";
      out.ROLE = "any";                               // compat
    } else if (hasSV) {
      out.SUBJECT_VALUE = p.SUBJECT_VALUE || "";
      if (st === "role") out.ROLE = p.SUBJECT_VALUE || "any";
    }
  } else if (hasSV) {
    // mudou só o valor
    out.SUBJECT_VALUE = p.SUBJECT_VALUE || "";
  }

  // se o caller quiser alterar ROLE explicitamente
  if ("ROLE" in p) out.ROLE = p.ROLE;

  return out;
};



// ————————————————————————————————————————————————————————————————
export default function useRegrasConexao() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = apiList(`?limit=999`); // sort client-side
      const r = await fetch(url, { headers: HDRS() });
      if (r.status === 404) throw new Error("Tabela não encontrada (verifique VITE_AUTH_IP_RULES)");
      if (!r.ok) throw new Error(`NocoDB LIST ${r.status}`);
      const j = await r.json();
      const list = (j?.list || []).map(normalizeRow);
      setItems(list);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const add = useCallback(async (data) => {
    const r = await fetch(apiList(), {
      method: "POST",
      headers: HDRS(),
      body: JSON.stringify([denormalizeRow(data)]), // bulk insert aceita array
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`NocoDB INSERT ${r.status}: ${txt}`);
    }
    await reload();
  }, [reload]);

 // PATCH ---------------------------------------------------
const patch = useCallback(async (id, patchData) => {
 if (id == null || id === "") throw new Error("Id inválido");
 const payload = [{ Id: id, ...denormalizePatch(patchData) }]; // OK: bulk PATCH precisa de Id no item
 const r = await fetch(apiList(), {
   method: "PATCH",
   headers: HDRS(),
   body: JSON.stringify(payload),
 });
   if (!r.ok) {
     const txt = await r.text().catch(() => "");
     throw new Error(`NocoDB PATCH ${r.status}: ${txt}`);
   }
   await reload();
 }, [reload]);

 // DELETE ---------------------------------------------------
const remove = useCallback(async (id) => {
 if (id == null || id === "") throw new Error("Id inválido");
 const r = await fetch(apiList(), {
   method: "DELETE",
   headers: HDRS(),
   body: JSON.stringify([{ Id: id }]),
 });
 if (!r.ok) {
   const txt = await r.text().catch(() => "");
   throw new Error(`NocoDB DELETE ${r.status}: ${txt}`);
 }
 await reload();
}, [reload]);





  return useMemo(() => ({ items, loading, error, reload, add, patch, remove }), [items, loading, error, reload, add, patch, remove]);
}
