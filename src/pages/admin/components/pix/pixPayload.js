// src/components/pix/pixPayload.js

// utils
const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const stripSpaces = (s) => String(s || "").replace(/\s+/g, "");

// Heurística: se veio com pontuação típica de CPF, tratamos como CPF (não telefone)
const looksLikeCpfFormatted = (s) =>
  /^\s*\d{3}\.\d{3}\.\d{3}-\d{2}\s*$/.test(String(s || ""));

export function normalizePixKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  // e‑mail
  if (s.includes("@")) return s.toLowerCase();

  // EVP (UUID) — com/sem hífens
  const uuidLike = s.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(uuidLike)) return s.toLowerCase();

  const d = onlyDigits(s);

  // 13 dígitos começando por 55 → telefone BR sem '+'
  if (d.length === 13 && d.startsWith("55")) return `+${d}`;

  // 11 dígitos (ambíguo entre CPF e telefone):
  // - Se veio com máscara de CPF (000.000.000-00) → CPF (somente dígitos)
  // - Caso contrário → assumimos TELEFONE (E.164)
  if (d.length === 11) {
    if (looksLikeCpfFormatted(s)) return d; // CPF
    return `+55${d}`; // TELEFONE
  }

  // 14 dígitos → CNPJ
  if (d.length === 14) return d;

  // Se já veio em E.164 com '+'
  if (/^\+55\d{11}$/.test(stripSpaces(s))) return stripSpaces(s);

  // fallback
  return stripSpaces(s);
}

// CRC16-CCITT (0x1021) usado no PIX
function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Gera payload EMVCo do PIX (estático com valor).
 */
export function buildPixPayload({
  chave,
  valor,
  nome = "MAX FIBRA",
  cidade = "VIANA",
  txid = "COMISSAO",
}) {
  const v2 = (Number(valor || 0)).toFixed(2);
  const chaveClean = normalizePixKey(chave);

  // TLV helper
  const tlv = (id, raw) => {
    const val = String(raw);
    const len = val.length.toString().padStart(2, "0");
    return `${id}${len}${val}`;
  };

  // 00: Payload Format Indicator (01)
  const id00 = tlv("00", "01");

  // 01: Point of Initiation Method (12 = estático)
  const id01 = tlv("01", "12");

  // 26: Merchant Account Information (BR.GOV.BCB.PIX)
  const gui = tlv("00", "BR.GOV.BCB.PIX");
  const chavePix = tlv("01", chaveClean);
  const id26 = tlv("26", `${gui}${chavePix}`);

  // 52: MCC (0000), 53: Currency (986 = BRL)
  const id52 = tlv("52", "0000");
  const id53 = tlv("53", "986");

  // 54: Transaction Amount
  const id54 = tlv("54", v2);

  // 58: Country Code
  const id58 = tlv("58", "BR");

  // 59: Merchant Name (≤25)
  const nomeLimpo = String(nome || "").toUpperCase().slice(0, 25);
  const id59 = tlv("59", nomeLimpo || "RECEBEDOR");

  // 60: Merchant City (≤15)
  const cidadeLimpa = String(cidade || "").toUpperCase().slice(0, 15);
  const id60 = tlv("60", cidadeLimpa || "CIDADE");

  // 62: Additional Data Field Template (TXID em 05)
  const id62 = tlv("62", tlv("05", String(txid).slice(0, 25)));

  // 63: CRC (calcula sobre payload + "6304")
  const semCRC = `${id00}${id01}${id26}${id52}${id53}${id54}${id58}${id59}${id60}${id62}63` + "04";
  const crc = crc16(semCRC);
  return `${semCRC}${crc}`;
}
