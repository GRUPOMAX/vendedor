// src/services/nocodbComprovantesPix.js

import dayjs from "dayjs";

// ====== ENV / CONSTS ======
const NOCODB_BASE =
  import.meta.env.VITE_NOCODB_URL;

const NOCODB_TOKEN =
  import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;

// Tabela onde você guarda "COMPROVANTES - COMISSÃO"
// (padrão mantém o antigo caso não tenha a env)
const TBL_COMISSAO =
  import.meta.env.VITE_NOCODB_TBL_PIX_COMPROVANTES || "pix_comprovantes";

// API do uploader (mesma usada na UploadComprovantePage)
const UPLOAD_API =
  import.meta.env.VITE_UPLOAD_API || import.meta.env.VITE_API_BASE || "http://localhost:10005";

// ====== HELPERS ======
function headersJson(extra = {}) {
  return { "Content-Type": "application/json", "xc-token": NOCODB_TOKEN, ...extra };
}
async function httpJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${txt || r.statusText}`);
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

// ====== FUNÇÕES ======

/**
 * Salva ou atualiza REGISTRO de Contas a Pagar na tabela "COMPROVANTES - COMISSÃO".
 * Busca por vendedor e período; se existir, atualiza (PATCH) com id_antigo; senão, cria (POST).
 * @param {{ vendedor: string, de: string, ate: string, registro: string|number, dados?: any, id_antigo?: string }} p
 */
export async function salvarRegistroComissao({ vendedor, de, ate, registro, dados = {}, id_antigo = null }) {
  const REGISTRO = String(registro || "").trim();
  if (!REGISTRO) throw new Error("REGISTRO inválido");

  // 1) Busca row existente por vendedor e período
  const existente = await findRegistroComissaoByPeriodo({ vendedor, de, ate });
  const rowId = existente?.id || existente?.row?.Id || existente?.row?.id;

  // Monta payload com id_antigo para auditoria
  const payloadDados = {
    periodo: dados.periodo,
    vendedor: dados.vendedor,
    nomeCadastro: dados.nomeCadastro,
    valor: dados.valor,
    observacao: dados.observacao,
    tipo_pagamento: dados.tipo_pagamento,
    createdAt: dados.createdAt || new Date().toISOString(),
    id_antigo: id_antigo || (existente?.registro || null), // Preserva o REGISTRO antigo para auditoria
  };

  const payload = {
    vendedor: vendedor || "",
    REGISTRO,
    dados: payloadDados,
  };

  if (rowId) {
    // 2) Tenta PATCH no row existente
    try {
      const urlPatch = `${NOCODB_BASE}/api/v2/tables/${TBL_COMISSAO}/records`;
      //console.log("[NocoDB] Atualizando row existente:", { rowId, payload });
      const response = await httpJson(urlPatch, {
        method: "PATCH",
        headers: headersJson(),
        body: JSON.stringify({ Id: rowId, ...payload }),
      });
      return response; // Retorna o resultado do PATCH
    } catch (e) {
      console.warn("[NocoDB] Falha no PATCH, tentando fallback:", e);
      // Fallback só se necessário
    }
  }

  // 3) POST se novo ou PATCH falhou
  const urlPost = `${NOCODB_BASE}/api/v2/tables/${TBL_COMISSAO}/records`;
  //console.log("[NocoDB] Criando novo row:", payload);
  return httpJson(urlPost, {
    method: "POST",
    headers: headersJson(),
    body: JSON.stringify(payload),
  });
}
/**
 * Nova função: Deleta um row por ID.
 * @param {string|number} id
 */
export async function deleteRegistroComissao(id) {
  if (!id) throw new Error("ID obrigatório para deleção");
  const urlDelete = `${NOCODB_BASE}/api/v2/tables/${TBL_COMISSAO}/records/${id}`;
  return httpJson(urlDelete, {
    method: "DELETE",
    headers: headersJson(),
  });
}


// services/nocodbVendas.js
export async function fetchVendaStatusById(vendaId) {
  try {
    // Exemplo: consulta ao NocoDB para obter o status da venda pelo ID
    // Substitua pela sua lógica real de integração com o NocoDB
    const response = await fetch(`/api/nocodb/vendas/${vendaId}`);
    const data = await response.json();
    return {
      id: data.id || vendaId,
      status: data.status || data.Status || "",
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch (e) {
    console.error(`Erro ao consultar status da venda ${vendaId}:`, e);
    return null;
  }
}




/**
 * Busca comprovantes por uma lista de TXIDs.
 * Tenta GET ?txids=... e cai no POST /batch se necessário.
 */
export async function fetchComprovantesPorTxid(txids = []) {
  const arr = Array.isArray(txids) ? txids.filter(Boolean) : [];
  if (arr.length === 0) return [];

  // Tenta GET com query (?txids=...)
  try {
    const q = new URLSearchParams({ txids: arr.join(",") }).toString();
    const r = await fetch(`${UPLOAD_API.replace(/\/$/, "")}/api/comprovantes?${q}`);
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || "Falha ao buscar comprovantes");
    return j.list || [];
  } catch (e) {
    // Fallback via POST /batch
    const r = await fetch(`${UPLOAD_API.replace(/\/$/, "")}/api/comprovantes/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txids: arr }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || "Falha ao buscar comprovantes");
    return j.list || [];
  }
}

const normDate = (x) => {
  const m = dayjs(x, ["YYYY-MM-DD","DD-MM-YYYY","DD/MM/YYYY"], true);
  return m.isValid() ? m.format("YYYY-MM-DD") : dayjs(x).format("YYYY-MM-DD");
};

export async function findRegistroComissaoByPeriodo({ vendedor, de, ate }) {
  const deN = normDate(de);
  const ateN = normDate(ate);

  const where = `(vendedor,eq,"${String(vendedor).replace(/"/g, '\\"')}")`;
  const urlWhere = `${NOCODB_BASE}/api/v2/tables/${TBL_COMISSAO}/records?where=${encodeURIComponent(where)}&limit=200`;
  const urlAll   = `${NOCODB_BASE}/api/v2/tables/${TBL_COMISSAO}/records?limit=200`;

  if (typeof window !== "undefined") {
    //console.log("[CP/SVC] DEBUG NocoDB cfg:", { NOCODB_BASE, TBL_COMISSAO, vendedor, deN, ateN });
    //console.log("[CP/SVC] URL(where):", urlWhere);
  }

  // 1) tenta com where
  let list = [];
  try {
    const r = await fetch(urlWhere, { headers: { "xc-token": NOCODB_TOKEN } });
    const j = await r.json();
    list = Array.isArray(j?.list) ? j.list : [];
    //console.log("[CP/SVC] count with where:", list.length);
  } catch (e) {
    console.warn("[CP/SVC] erro no where:", e);
  }

  // 2) se nada veio, tenta SEM where e filtra no cliente
  if (list.length === 0) {
    if (typeof window !== "undefined") 
      //console.log("[CP/SVC] fallback: fetch ALL (sem where):", urlAll);
    try {
      const r2 = await fetch(urlAll, { headers: { "xc-token": NOCODB_TOKEN } });
      const j2 = await r2.json();
      const all = Array.isArray(j2?.list) ? j2.list : [];
      //console.log("[CP/SVC] total rows (ALL):", all.length, "primeiras 3:", all.slice(0,3));

      // filtra por nome (igual ao valor salvo na tabela) e período
      const hit = all.find((row) => {
        const sameVend = String(row?.vendedor || "").trim() === String(vendedor).trim();
        let dados = row?.dados;
        if (typeof dados === "string") { try { dados = JSON.parse(dados); } catch { dados = {}; } }
        const p = dados?.periodo || {};
        return sameVend && normDate(p.de) === deN && normDate(p.ate) === ateN;
      });

      if (hit) {
        //console.log("[CP/SVC] MATCH via fallback ALL:", { id: hit.Id ?? hit.id, registro: hit.REGISTRO, vendedor: hit.vendedor, dados: hit.dados });
        return { id: hit.Id ?? hit.id, registro: hit.REGISTRO, row: hit };
      }
    } catch (e2) {
      console.warn("[CP/SVC] erro no fallback ALL:", e2);
    }
  } else {
    // já veio lista com where → verifica período
    for (const row of list) {
      let dados = row?.dados;
      if (typeof dados === "string") { try { dados = JSON.parse(dados); } catch { dados = {}; } }
      const p = dados?.periodo || {};
      if (normDate(p.de) === deN && normDate(p.ate) === ateN) {
        //console.log("[CP/SVC] MATCH via where:", { id: row.Id ?? row.id, registro: row.REGISTRO, vendedor: row.vendedor, dados: row.dados });
        return { id: row.Id ?? row.id, registro: row.REGISTRO, row };
      }
    }
    //console.log("[CP/SVC] with where achou vendedor mas não bateu período");
  }

  //console.log("[CP/SVC] NENHUM MATCH. Suspeita: TBL_COMISSAO ou NOCODB_BASE errados.");
  return null;
}


// Exemplo genérico: atualiza pelo ID da linha da tabela “COMPROVANTES - COMISSÃO”
export async function updateRegistroComissao({ id, vendedor, registro, dados }) {
   if (!id) throw new Error("updateRegistroComissao: id obrigatório");
   const payload = {
    Id: id,
     vendedor: vendedor || "",
     REGISTRO: String(registro || "").trim(),
     dados,
   };
   const urlPatch = `${NOCODB_BASE}/api/v2/tables/${TBL_COMISSAO}/records`;
   return httpJson(urlPatch, {
     method: "PATCH",
     headers: headersJson(),
     body: JSON.stringify(payload),
   });
 }
