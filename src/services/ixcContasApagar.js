// Serviço: cria registro em Contas a Pagar
// Usa o domínio público informado ou o .env (VITE_IXC_CONTAS_APAGAR_API_BASE)

const BASE =
  import.meta.env.VITE_IXC_CONTAS_APAGAR_API_BASE ||
  "https://ixc-contas-apagar.api.webserver.app.br";

async function postJson(path, body) {
  const url = `${BASE.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    console.warn("[IXC] resposta não é JSON válido:", text);
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg = data?.error || data?.message || text || `Erro HTTP ${res.status}`;
    throw new Error(`[IXC POST] ${msg}`);
  }

  return data;
}

/**
 * Cria um contas a pagar no IXC com JSON padrão
 * @param {object} payload
 */
export async function createContaPagar(payload) {
  console.log("[createContaPagar] Enviando:", payload);
  return await postJson("/contas-apagar", payload);
}
