// src/services/ixcContasApagarStatus.js
export async function fetchContaPagarStatus(registro) {
  const r = await fetch(`https://ixc-contas-apagar.api.webserver.app.br/contas-apagar/${registro}`);
  if (!r.ok) throw new Error("Falha ao consultar status do registro");
  const j = await r.json();
  return {
    id: j.id || registro,
    status: j.status || j.item?.status,              // ex.: "C"
    status_label: j.status_label || j.item?.status_label, // ex.: "Cancelado"
  };
}
