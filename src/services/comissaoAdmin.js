const VALOR_FIXO_SEM_TAXA = 5;
const TABELA_COMISSAO = { 
  Lenda: 55, 
  Mestre: 45, 
  Diamante: 35, 
  Ouro: 25, 
  Prata: 15, 
  Bronze: 10 
};

function isTransferenciaCliente(c) {
  const norm = (v) =>
    (v || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const alter = norm(c?.["Alterar Titularidade"]);
  return (
    alter === "sim" ||
    !!c?.["Titular Anterior Nome"] ||
    !!c?.["Titular Anterior Documento"] ||
    !!c?.["Titular Anterior Obs"]
  );
}

export function comissaoEstimativaPorVenda(venda, statusFromMap) {
  const low = (s) => String(s || "").trim().toLowerCase();

  const pagouTaxa =
    statusFromMap?.pagouTaxa === true ||
    low(statusFromMap?.["Pagou Taxa"]) === "sim";

  const bloqueado =
    statusFromMap?.bloqueado === true ||
    low(statusFromMap?.["Bloqueado"]) === "sim";

  // aceitar várias formas de "sem taxa"
  const semTaxa =
    statusFromMap?.semTaxa === true ||
    low(statusFromMap?.["SemTaxa"]) === "sim" ||
    low(statusFromMap?.["Sem Taxa"]) === "sim" ||
    low(statusFromMap?.Autorizado) === "sem taxa";

  // 🔁 Nova regra: se for transferência, comissão = 0
  if (isTransferenciaCliente(statusFromMap)) return 0;

  if (bloqueado && !pagouTaxa) return 0;
  if (semTaxa) return VALOR_FIXO_SEM_TAXA; // <- R$ 5,00
  if (!pagouTaxa) return 0;

  const cls =
    statusFromMap?.Classificação ||
    statusFromMap?.classificacao ||
    venda.classificacao ||
    "Ouro";

  return Number(TABELA_COMISSAO[cls] ?? 0);
}
