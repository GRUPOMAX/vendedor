// Busca fornecedor no serviço público do IXC usando a RAZÃO (Nome de cadastro).
// Faz tentativas com várias capitalizações para contornar igualdade case-sensitive.

const BASE =
  import.meta.env.VITE_IXC_FORNECEDOR_API_BASE ||
  "https://ixc-fornecedor.api.webserver.app.br";

// evita 304 (cache) adicionando carimbo de tempo e desativando cache do fetch
async function getJson(path) {
  const base = BASE.replace(/\/$/, "");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${sep}_=${Date.now()}`;

  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);

  // se o servidor ainda assim responder 304, trata como erro de cache e refaz
  if (r.status === 304) {
    const r2 = await fetch(`${url}&reload=1`, { cache: "reload" });
    const j2 = await r2.json().catch(() => null);
    if (!r2.ok || !j2?.ok) {
      throw new Error(j2?.error || j2?.message || `Fornecedor API (HTTP ${r2.status})`);
    }
    return j2;
  }

  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || j?.message || `Fornecedor API (HTTP ${r.status})`);
  }
  return j;
}

const norm = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();

function toTitleCasePtBR(nome) {
  const min = new Set(["da","de","do","das","dos","e","di","du"]);
  return String(nome || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && min.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function buildCandidatos(nome) {
  const clean = String(nome || "").replace(/\s+/g, " ").trim();
  const tcase = toTitleCasePtBR(clean);
  return Array.from(
    new Set([clean, tcase, clean.toLowerCase(), clean.toUpperCase()])
  ).filter(Boolean);
}

// parser robusto: aceita {rows}, {data.registros}, {data} ou array direto
function parseRegs(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (payload.data && Array.isArray(payload.data.registros)) return payload.data.registros;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

/**
 * fetchFornecedorByNomeCadastro(nomeCadastro)
 * Retorna { id, id_conta, razao, fantasia }
 */
export async function fetchFornecedorByNomeCadastro(nomeCadastro) {
  const candidatos = buildCandidatos(nomeCadastro);
  const alvo = norm(nomeCadastro);

  for (const cand of candidatos) {
    const j = await getJson(`/api/fornecedor?razao=${encodeURIComponent(cand)}`);
    const regs = parseRegs(j);
    if (!regs.length) continue;

    const pick =
      regs.find((r) => norm(r?.razao) === alvo) ||
      regs.find((r) => norm(r?.fantasia) === alvo) ||
      regs[0];

    if (pick?.id) {
      return {
        id: String(pick.id),
        id_conta: String(pick.id_conta || ""),
        razao: pick.razao,
        fantasia: pick.fantasia,
      };
    }
  }

  throw new Error(`Fornecedor não encontrado no IXC para: "${nomeCadastro}".`);
}
