// src/services/planosService.js
import { nc, q } from "./http";

const TBL_PLANOS = import.meta.env.VITE_TBL_PLANOS_VALORES || "mct4p71cqg9987v";

/**
 * Lê a tabela [PLANOS] - VALORES e devolve um map:
 *   { turbo: 99.9, gold: 129.9, infinity: 169.9, "startup company": 199.9, ... }
 */
 export async function fetchPlanosValores() {
const url = `/tables/${TBL_PLANOS}/records?${q({ limit: 1 })}`;
let data;
try {
const r = await nc.get(url);
data = r?.data;
} catch (e) {
console.error("[PLANOS] HTTP error:", e?.response?.status, e?.response?.data || e.message);
throw new Error(`Falha ao buscar tabela de planos (${TBL_PLANOS})`);
}

const row = data?.list?.[0];
//console.log("[PLANOS] list.len =", data?.list?.length, "row.keys =", row && Object.keys(row));
if (!row) return {};

// tenta várias chaves possíveis
let arr =
row.ARRAY_VALORES ??
row.array_valores ??
row.VALORES_ARRAY ??
row.valores_array ??
row.Valores ??
row.valores;

if (typeof arr === "string") {
try { arr = JSON.parse(arr); } catch { arr = null; }
}
if (!arr) {
console.warn("[PLANOS] campo ARRAY_VALORES/VALORES_ARRAY ausente no row");
return {};
}

// em algumas bases é array com { VALORES }, em outras é objeto direto
const obj = Array.isArray(arr)
? (arr[0]?.VALORES ?? arr[0]?.valores ?? arr[0])
: (arr.VALORES ?? arr.valores ?? arr);

if (!obj || typeof obj !== "object") {
console.warn("[PLANOS] objeto VALORES ausente/inválido");
return {};
}

const map = {};
for (const [k, v] of Object.entries(obj)) {
const pretty = String(k)
.replace(/^PLANO[-_ ]/i, "")
.replace(/[-_]/g, " ")
.toLowerCase();
const num = Number(
  String(v).replace(/[^\d,.-]/g, "").replace(",", ".")
) || 0;

map[pretty] = num;
}
//console.log("[PLANOS] mapa final:", map);
return map;
 }
 
 /** pega o preço de um plano pelo nome livre vindo do histórico */
 export function getPrecoPlano(nomePlano, tabela) {
   const key = String(nomePlano || "").trim().toLowerCase();
   if (!key) return 0;
 
   const alias = {
     "startupcompany": "startup company",
     "startup-company": "startup company",
     "medium-company": "medium company",
     "big-company": "big company",
   };
   const normalized =
     alias[key.replace(/\s+/g, "-")] ||
     key;
 
   if (tabela[normalized] != null) return Number(tabela[normalized]) || 0;
   const hit = Object.keys(tabela).find((k) => normalized.startsWith(k));
   if (hit) return Number(tabela[hit]) || 0;
   return 0;
 }
