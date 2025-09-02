// src/services/comissaoService.js
// Suporta dois formatos de comissão:
// 1) Tabela "clássica": várias linhas {Classificacao, Percentual}
// 2) Tabela "JSON único": 1 linha com campo JSON "Valores_Comissão" (ou variações) contendo:
//    { "comissoes": { "Ouro": {"valor":"R$ 25,00"}, ... } }

const BASE  = import.meta.env.VITE_NOCODB_URL;
const TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;

// ============================== AJUSTES AQUI ==============================
// Usa o valor fixo se quiser forçar, sem mexer no seu .env original
const TBL_VENDEDORES = import.meta.env.VITE_NOCODB_TBL_VENDEDORES || 'myyj60ek0dxwpbh';
const TBL_COMISSAO   = import.meta.env.VITE_COMISSAO_TABLE || 'm007s1znd8hpu6r';
// =========================================================================

const COL_JSON_CLIENTES = 'DadosClientesVendedores';

function headers() {
  return { 'Content-Type': 'application/json', 'xc-token': TOKEN };
}

async function jfetch(url) {
  const r = await fetch(url, { headers: headers() });
  const t = await r.text();
  if (!r.ok) throw new Error(`[NocoDB ${r.status}] ${t || r.statusText}`);
  return t ? JSON.parse(t) : null;
}

function moneyToNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function safeJSON(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function normalizeName(s = '') {
  return s
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')        // remove acento
    .replace(/[\u0300-\u036f]/g, '');
}

// === Sem taxa helpers (NOVO) ===
export const VALOR_FIXO_SEM_TAXA = 5;

function normalizar(v) {
  return (v || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isSemTaxa(obj = {}) {
  // aceita tanto "Sem Taxa" quanto "SemTaxa" e também se algum fluxo gravar em "Autorizado"
  return (
    normalizar(obj['Sem Taxa']) === 'sim' ||
    normalizar(obj['SemTaxa']) === 'sim' ||
    normalizar(obj['Autorizado']) === 'sem taxa'
  );
}

function isTransferencia(obj = {}) {
  // "Alterar Titularidade" = "sim" OU qualquer um dos campos de Titular Anterior preenchidos
  const alt = normalizar(obj['Alterar Titularidade']);
  return (
    alt === 'sim' ||
    !!obj['Titular Anterior Nome'] ||
    !!obj['Titular Anterior Documento'] ||
    !!obj['Titular Anterior Obs']
  );
}



// === COMISSÃO (SEM VIEW) ======================================================

export async function carregarTabelaComissao() {
  const url = `${BASE}/api/v2/tables/${TBL_COMISSAO}/records?limit=1000`;
  const json = await jfetch(url);

  const list = json?.list || [];
  if (!list.length) return { kind: 'fixed', map: {} };

  const hasClassic = list.some(row =>
    row.Classificacao != null || row.classificacao != null || row['Classificação'] != null
  );
  if (hasClassic) {
    const map = {};
    for (const row of list) {
      const cls  = row.Classificacao || row.classificacao || row['Classificação'];
      const perc = Number(row.Percentual ?? row.percentual ?? row.taxa ?? 0);
      if (cls) map[String(cls).toLowerCase()] = perc;
    }
    return { kind: 'percent', map };
  }

  const row0 = list[0] || {};
  const blob =
    row0.Valores_Comissão ??
    row0.Valores_Comissao ??
    row0.ValoresComissao ??
    row0.valores_comissao ??
    row0.valoresComissao ??
    row0['Valores_Comissão'] ??
    row0['Valores_Comissao'];

  let obj = typeof blob === 'string' ? safeJSON(blob) : (blob || {});
  if (obj && obj.comissoes) obj = obj.comissoes;

  const mapFixed = {};
  for (const k of Object.keys(obj || {})) {
    const raw = obj[k]?.valor ?? obj[k];
    mapFixed[String(k).toLowerCase()] = moneyToNumber(raw);
  }
  return { kind: 'fixed', map: mapFixed };
}

export async function getComissoes() {
  return await carregarTabelaComissao();
}

// === MAPA DE CLIENTES (por CPF) — SEM VIEW ===================================

export async function carregarMapaClientesDoVendedor(nomeVendedor) {
  const url = `${BASE}/api/v2/tables/${TBL_VENDEDORES}/records?limit=1000`;
  const json = await jfetch(url);
  const linhas = json?.list || [];

  const alvo = normalizeName(nomeVendedor);
  const linha = linhas.find(l => {
    const nomes = [l.Title, l.Vendedor, l.nome, l.Nome, l.vendedor]
      .map(v => normalizeName(v));
    return nomes.includes(alvo) || nomes.some(n => n.includes(alvo));
  });

  if (!linha) {
    console.warn('[MAPA_CLIENTES] Vendedor não encontrado:', alvo);
    return {};
  }

  const blob = linha?.[COL_JSON_CLIENTES];
  const obj = typeof blob === 'string' ? safeJSON(blob) : (blob || {});

  const mapa = {};
    for (const k of Object.keys(obj)) {
      const item = obj[k] || {};
      const rawCpf = item.cpf || item.CPF || item.documento || k; // usa a key se o campo não existir
      const cpf = rawCpf.replace(/\D/g, '');
      if (cpf.length >= 10) mapa[cpf] = item;
    }


  return mapa;
}

function formatBRL(n) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}



export function calcularComissaoCliente({ cpf, cliente, classificacao, tabela }) {
  if (!cliente) return 0;

  // 🔁 Transferência não gera comissão
  if (isTransferencia(cliente)) return 0;

  const clsKey = (classificacao || '').toString().toLowerCase();
  const valorComissao = Number(tabela?.map?.[clsKey] ?? 0);

  const pagouTaxa = normalizar(cliente?.['Pagou Taxa']);
  const bloqueado = normalizar(cliente?.['Bloqueado']);
  const ativado   = normalizar(cliente?.['Ativado']);
  const desistiu  = normalizar(cliente?.['Desistiu']);

  if (bloqueado === 'sim' || desistiu === 'sim') return 0;

  // Sem taxa (por flags ou autorizado)
  if (isSemTaxa(cliente)) return VALOR_FIXO_SEM_TAXA;

  // Tabela fixa/valor direto
  if (ativado === 'sim' && pagouTaxa === 'sim') return valorComissao;

  // (opcional) manter exceção "ativado e não pagou" = 5
  // return (ativado === 'sim' && pagouTaxa !== 'sim') ? VALOR_FIXO_SEM_TAXA : 0;

  return 0;
}


// ===============================================================
// REGRAS AVANÇADAS (usadas no AdminDashboard / Modal Relatório)
// ===============================================================

// normalizador simples (sem acento, minúsculo)
const norm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function buildCtx({ venda, cliente, classificacao }) {
  const n = (v) => norm(v);

  const alt = n(cliente?.["Alterar Titularidade"]);
  const antNome = cliente?.["Titular Anterior Nome"];
  const antDoc  = cliente?.["Titular Anterior Documento"];
  const antObs  = (cliente?.["Titular Anterior Obs"] || "").toString();
  const ehTransfer = alt === "sim" || !!antNome || !!antDoc || /transfer|titularidade/i.test(n(antObs));

  const pagouTaxa = n(cliente?.["Pagou Taxa"]) === "sim" || cliente?.PagouTaxa === true;
  const semTaxa   = n(cliente?.["Sem Taxa"]) === "sim" || cliente?.SemTaxa === true || !pagouTaxa;

  const bloqueado =
    cliente?.Bloqueado === true ||
    n(cliente?.Bloqueado) === "sim" ||
    n(cliente?.status) === "bloqueado" ||
    n(cliente?.["Status Cliente"]) === "bloqueado";

  const ativado = n(cliente?.Ativado) === "sim" || cliente?.Ativado === true;
  const clienteAtivoFinal = !!(ativado && !bloqueado);

  let motivo = (cliente?.motivo || cliente?.["Motivo"] || "").toString();
  if (!motivo && ehTransfer) motivo = "transferencia";

  return {
    semTaxa,
    bloqueado,
    clienteAtivo: clienteAtivoFinal,
    motivo,
    classificacao: (classificacao || "").toLowerCase(),
    base: 0,
  };
}

// Avalia condicional "when"
function evalWhen(when = {}, ctx = {}) {
  const like = (a, b) =>
    (a || "").toString().toLowerCase().includes((b || "").toString().toLowerCase());

  for (const [field, cond] of Object.entries(when)) {
    const val = ctx[field];
    if (Array.isArray(cond)) {
      if (!cond.includes(val)) return false;
      continue;
    }
    if (cond && typeof cond === "object") {
      if ("ne" in cond && val === cond.ne) return false;
      if ("nin" in cond && Array.isArray(cond.nin) && cond.nin.includes(val)) return false;
      if ("like" in cond && !like(val, cond.like)) return false;
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

export function calcularComissaoPorRegras(regras = [], ctx = {}) {
  const ordered = (regras || [])
    .filter((r) => r?.ATIVO !== false)
    .sort((a, b) => (a?.PRIORIDADE ?? 999) - (b?.PRIORIDADE ?? 999));

  let base = Number(ctx.base || 0);
  let total = 0;

  for (const r of ordered) {
    const rule = typeof r?.REGRA === "string" ? JSON.parse(r.REGRA || "{}") : (r?.REGRA || {});
    if (!evalWhen(rule.when, ctx)) continue;

    const calc = rule.calc || {};
    switch (calc.type) {
      case "fixo": {
        const vCent =
          calc.base === "classificacao"
            ? Number(ctx.valorClassificacaoCentavos || 0)
            : Number(calc.valorCentavos || 0);
        total += vCent / 100;
        break;
      }
      case "percentual": {
        const p = Number(calc.percentual || 0) / 100;
        total += base * p;
        break;
      }
      case "ajuste": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base += v;
        break;
      }
      case "minimo": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base = Math.max(base, v);
        break;
      }
      case "maximo": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base = Math.min(base, v);
        break;
      }
      default:
        break;
    }
    if (rule.stop) break;
  }

  return Number(total.toFixed(2));
}
