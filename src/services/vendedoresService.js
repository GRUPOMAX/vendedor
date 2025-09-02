export async function listarVendedores() {
  const res = await fetch("https://max.api.email.nexusnerds.com.br/api/vendedores");
  if (!res.ok) throw new Error("Falha ao buscar vendedores");
  return res.json();
}
