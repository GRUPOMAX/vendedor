const API_BASE =
  import.meta.env.VITE_API_MAX_BASE ||
  "https://api.maxfibraltda.nexusnerds.com.br"; // domínio correto

export async function localizarVenda(protocolo) {
  const url = new URL(`${API_BASE}/api/vendas/localizar`);
  url.searchParams.set("protocolo", String(protocolo || "").trim());
  const resp = await fetch(url.toString());

  let bodyText = "";
  try { bodyText = await resp.text(); } catch {}

  let json;
  try { json = bodyText ? JSON.parse(bodyText) : null; } catch {}

  if (!resp.ok) {
    const errMsg = json?.error || bodyText || `Erro ${resp.status}`;
    throw new Error(errMsg); // <-- agora a mensagem vem limpa
  }
  return json || {};
}


export async function transferirVendaBasico({ protocolo, to }) {
  if (!protocolo) throw new Error("Protocolo é obrigatório.");
  if (!to?.nome || !to?.email) throw new Error("Informe nome e e-mail do vendedor destino.");

  const resp = await fetch(`${API_BASE}/api/vendas/transferir-basico`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ protocolo: String(protocolo).trim(), to }),
  });

  // <-- melhora a captura do JSON de erro para exibir mensagem amigável
  let bodyText = "";
  try { bodyText = await resp.text(); } catch {}
  try { if (bodyText && bodyText.startsWith("{")) bodyText = JSON.parse(bodyText).error || bodyText; } catch {}

  if (!resp.ok) {
    throw new Error(`Falha ao transferir (${resp.status}): ${bodyText || "sem detalhe"}`);
  }
  try { return bodyText ? JSON.parse(bodyText) : { ok: true }; } catch { return { ok: true }; }
}
