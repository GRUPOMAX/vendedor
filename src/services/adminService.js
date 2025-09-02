// src/services/adminService.js

const BASE = import.meta.env.VITE_MAX_API_BASE || "https://max.api.email.nexusnerds.com.br";

// ---------------- utils ----------------
const norm  = (v = "") => String(v || "").trim();
const lower = (v = "") => norm(v).toLowerCase();

// Parse robusto: aceita "YYYY-MM-DD[ HH:mm:ss]" e "DD/MM/YYYY[ HH:mm:ss]"
function parseDateSafe(s) {
  if (!s) return null;
  const str = String(s).trim();

  // 1) ISO/nativo primeiro
  const d0 = new Date(str);
  if (!Number.isNaN(+d0)) return d0;

  // 2) DD/MM/YYYY [HH:mm[:ss]]
  //    ex.: 17/08/2025 14:23:05
  const m = str.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (m) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = m;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss),
      0
    ); // LOCAL
    return Number.isNaN(+d) ? null : d;
  }

  // 3) YYYY-MM-DD [HH:mm[:ss]] (sem timezone)
  const n = str.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (n) {
    const [, yyyy, mm, dd, hh = "00", mi = "00", ss = "00"] = n;
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss),
      0
    ); // LOCAL
    return Number.isNaN(+d) ? null : d;
  }

  return null;
}

function localStartOfDay(ymd /* "YYYY-MM-DD" */) {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function localEndOfDay(ymd /* "YYYY-MM-DD" */) {
  const [y, m, d] = (ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

// ---------------- fetchers ----------------
export async function fetchListaVendedores() {
  const r = await fetch(`${BASE}/api/vendedores`);
  if (!r.ok) throw new Error("Falha ao listar vendedores");
  return r.json();
}

export async function fetchHistoricoVendedor(urlRelativa) {
  const r = await fetch(`${BASE}${urlRelativa}`);
  if (!r.ok) throw new Error("Falha ao carregar histórico do vendedor");
  return r.json();
}

export async function fetchTodasAsVendas() {
  const lista = await fetchListaVendedores();
  const arr = await Promise.allSettled(
    (lista || []).map((v) =>
      fetchHistoricoVendedor(v.url).then((vendas) =>
        (vendas || []).map((x) => ({ ...x, __vendedorNome: v.vendedor }))
      )
    )
  );
  return arr.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
}

// ---------------- filtro ----------------
export function filtrarVendasPorPeriodoEVendedor(
  vendas,
  { de, ate, vendedorNome }
) {
  const d0 = de ? +localStartOfDay(de) : null;
  const d1 = ate ? +localEndOfDay(ate) : null;
  const vendKey = lower(vendedorNome || "");

  return (vendas || []).filter((v) => {
    const dt = parseDateSafe(v.dataHora || v.data || v.createdAt);
    if (!dt) return false;

    const t = +dt;
    if (d0 && t < d0) return false;
    if (d1 && t > d1) return false;

    if (vendKey && vendKey !== "todos") {
      const nm = norm(v.__vendedorNome || v.vendedor || v.vendedorNome);
      if (lower(nm) !== vendKey) return false;
    }
    return true;
  });
}
