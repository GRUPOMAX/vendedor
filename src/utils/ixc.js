// utils/ixc.js
export function parseTitularAnterior(osOrText) {
  // Aceita objeto de OS (com .mensagem / ._raw.mensagem) OU string direta
  const rawAll = typeof osOrText === "string"
    ? osOrText
    : String(osOrText?.mensagem || osOrText?._raw?.mensagem || "");

  // Normaliza \r e garante que regex não seja gulosa
  const raw = rawAll.replace(/\r/g, "");

  const out = { nome: null, doc: null, obs: rawAll || null };

  // --- Nome ---
  // casa “Antigo cliente: Fulano” OU “Titular anterior: Fulano”
  // usa [^\n\r]+ pra parar no fim da linha e evitar capturar o restante
  let m = raw.match(/(?:Antigo\s+cliente|Titular\s+Anterior)\s*:\s*([^\n\r]+)/i);
  if (m) out.nome = m[1].trim();

  // --- Documento ---
  // aceita “CPF: 000.000.000-00”, “CPF ANTERIOR: ...” ou “CNPJ ...”
  // pega dígitos . - / (sem espaços finais)
  m = raw.match(/\b(?:CPF|CNPJ)(?:\s*Anterior)?\s*:\s*([\d.\-\/]+)/i);
  if (m) out.doc = m[1].trim();

  return out;
}

// Gera o texto padrão para colar nas observações do modal/OS
export function titularAnteriorObsTemplate(nome, doc) {
  return `TITULAR ANTERIOR: ${nome || ""}\nCPF ANTERIOR: ${doc || ""}`;
}
