// Usa as envs que você já tem
const NOCODB_URL = import.meta.env.VITE_NOCODB_URL;
const NOCODB_TOKEN = import.meta.env.VITE_NOCODB_TOKEN;
// ajuste os IDs da base/tabela/view conforme seu projeto
const BASE_ID  = import.meta.env.VITE_NOCODB_BASE || "baseId";
const TABLE_ID = import.meta.env.VITE_NOCODB_TBL_VENDAS || "tblVendas";
// se tiver view: VITE_NOCODB_VIEW_VENDAS

const headers = {
  "accept": "application/json",
  "content-type": "application/json",
  "xc-token": NOCODB_TOKEN,
};

export async function fetchVendaById(id) {
  const url = `${NOCODB_URL}/api/v2/tables/${TABLE_ID}/records/${id}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`NocoDB fetchVendaById ${id} failed: ${r.status}`);
  const data = await r.json();
  return data; // espera { id, status, updated_at, ... }
}

/**
 * Observa mudanças no registro via polling.
 * - intervalMs: 5000 por padrão
 * - onChange(novoRegistro, prev): dispara quando updated_at/versão mudar
 * Retorna uma função stop() para encerrar o watch.
 */
export function watchVendaChanges(id, onChange, { intervalMs = 5000 } = {}) {
  let timer = null;
  let stopped = false;
  let lastVersion = null; // pode usar updated_at ou um hash do objeto

  const tick = async () => {
    if (stopped) return;
    try {
      const novo = await fetchVendaById(id);
      const version = novo.updated_at || novo.__updatedAt || JSON.stringify([novo.status, novo.valor, novo.observacao]); // fallback
      if (lastVersion && version !== lastVersion) {
        onChange(novo);
      }
      lastVersion = version;
    } catch (e) {
      // evita spam de erro; opcional: backoff
      console.warn("[watchVendaChanges] erro:", e.message);
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };

  // primeiro disparo
  tick();

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
