import { useEffect, useMemo, useState } from "react";
import {
  fetchTodasAsVendas,
  fetchListaVendedores,
  filtrarVendasPorPeriodoEVendedor,
} from "../../../services/adminService";
import { comissaoEstimativaPorVenda } from "../../../services/comissaoAdmin";
import { carregarMapaClientesDoVendedor, getComissoes} from "../../../services/comissaoService";import { fetchPlanosValores, getPrecoPlano } from "../../../services/planosService";
import { calcularComissaoCliente } from "../../../utils/calculoComissao"
import dayjs from "../../../utils/dayjs"; // OU o caminho certo



const norm = (v) => (v || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();


const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const guessCPF = (v) =>
  onlyDigits(v?.cpf || v?.CPF || v?.documento || v?.cpfCliente || v?.cpf_cliente);

function isTransferencia(status = {}) {
  const toN = (v) =>
    (v || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const alt = toN(status["Alterar Titularidade"]);
  return (
    alt === "sim" ||
    !!status["Titular Anterior Nome"] ||
    !!status["Titular Anterior Documento"] ||
    !!status["Titular Anterior Obs"]
  );
}


// parser de data robusto (DD/MM/YYYY e YYYY-MM-DD, com/sem hora)
const FMT = [
  "DD/MM/YYYY HH:mm:ss",
  "DD/MM/YYYY HH:mm",
  "DD/MM/YYYY",
  "YYYY-MM-DD HH:mm:ss",
  "YYYY-MM-DD HH:mm",
  "YYYY-MM-DD",
];

function parseAnyDate(s) {
  if (!s) return null;
  const raw = String(s).replace(",", "").trim();
  const d = dayjs(raw, FMT, true); // strict parse
  return d.isValid() ? d : null;
}


export function useAdminDashboard({ de, ate, vendedorNome, version = 0 }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [vendas, setVendas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [statusByVendedorCpf, setStatusByVendedorCpf] = useState({});
  const [precosPlanos, setPrecosPlanos] = useState({}); // ⬅ preços dos planos (NocoDB)
  const [tabelaComissoes, setTabelaComissoes] = useState({ kind: 'fixed', map: {} });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");
        setLoading(true);

        // Lista de vendedores + todas as vendas
        const [lst, all, tblCom] = await Promise.all([
          fetchListaVendedores(),
          fetchTodasAsVendas(),
          getComissoes(),
        ]);
        if (!alive) return;

                // Adiciona __vendedorNome para facilitar normalização nos agrupamentos
        const vendasComNome = all.map((v) => ({
        ...v,
        __vendedorNome: v.vendedor || v.vendedorNome || "—",
        }));

          const maps = await Promise.allSettled(
          (lst || []).map(async (v) => {
          try {
          const mapa = await carregarMapaClientesDoVendedor(v.vendedor);
          return { ok: true, vendedorLista: v.vendedor, mapa: mapa || {} };
          } catch (e) {
          return { ok: false, vendedorLista: v.vendedor, mapa: {} };
          }
          })
          );
          const byVend = {};
          for (const r of maps) {
          const { vendedorLista, mapa } = r.value || {};
          const keyA = norm(vendedorLista || "");
          const keyB = norm((mapa && mapa.__vendedor) || vendedorLista || "");
          // sempre cria as chaves, mesmo se mapa vier vazio
          if (keyA) byVend[keyA] = mapa || {};
          if (keyB && keyB !== keyA) byVend[keyB] = mapa || {};
          }
            // ADICIONE AQUI, no final da função que carrega status:
            for (const v of lst || []) {
              const k = norm(v.vendedor || v.nome || "");
              if (k && !byVend[k]) byVend[k] = {};
            }

        // Normaliza vendedores com campo e-mail
        const vendRows = (lst || []).map((r) => ({
          vendedor: r.vendedor || r.nome || r.name || r.Vendedor || "—",
          email:
            r.email ||
            r.Email ||
            r["E-mail"] ||
            r["e_mail"] ||
            r.mail ||
            "",
        }));

        // Carrega preços dos planos (tabela única no NocoDB)
        const tabelaPrecos = await fetchPlanosValores();
        if (!alive) return;

        setStatusByVendedorCpf(byVend);
        setVendas(vendasComNome);
        setVendedores([{ vendedor: "Todos", email: "" }, ...vendRows]);
        //console.log("[PLANOS] tabelaPrecos size:", Object.keys(tabelaPrecos || {}).length);
        //console.log("[PLANOS] tabelaPrecos sample:", Object.entries(tabelaPrecos || {}).slice(0, 5));
        setPrecosPlanos(tabelaPrecos);
        setTabelaComissoes(tblCom || { kind: 'fixed', map: {} });
        //console.log("[COMISSOES] kind:", tblCom?.kind, "map keys:", Object.keys(tblCom?.map || {}));
      } catch (e) {
        setErr(e.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [de, ate, vendedorNome, version]);

    // helper: zera a hora (compara somente por data)
    function atStartOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
    }

    const vendasFiltradas = useMemo(() => {
    // de/ate podem vir em ISO; sempre converte para Date e zera hora

    const d1 = dayjs(de).startOf("day");
    const d2 = dayjs(ate).endOf("day");


    return vendas.filter((v) => {
    const parsed = parseAnyDate(v.dataHora || v.data || v.createdAt);
    if (!parsed) return false;
    const dv = dayjs(parsed).startOf("day");
    const matchPeriodo = dv.isSameOrAfter(d1) && dv.isSameOrBefore(d2);
    const vendNome = v.__vendedorNome || v.vendedor || v.vendedorNome;
      const matchVend =
        vendedorNome === "Todos" ||
        norm(v.__vendedorNome || v.vendedor || v.vendedorNome) === norm(vendedorNome);

    return matchPeriodo && matchVend;
    });
    }, [vendas, de, ate, vendedorNome]);
    
    // Helper para pegar status consistente (chave normalizada)
      function getStatusDeVenda(v) {
          const vendKey = norm(v.__vendedorNome || v.vendedor || v.vendedorNome || "—");
          const cpf = guessCPF(v);
          // 1) tenta no vendedor
          const direto = statusByVendedorCpf[vendKey]?.[cpf];
          if (direto) return direto;
          // 2) fallback: procura em todos os mapas por CPF
          for (const mapa of Object.values(statusByVendedorCpf || {})) {
          if (mapa && mapa[cpf]) return mapa[cpf];
          }
          return {};
          }


    // Regra de qualificação (usa as mesmas bandeiras que você já usa nas comissões)
    function vendaQualifica(status) {
      if (isTransferencia(status)) return false; // 🔁 transferência não qualifica

      const low = (s) => String(s || "").trim().toLowerCase();
      const pagou     = status?.pagouTaxa === true || low(status?.["Pagou Taxa"]) === "sim";
      const semTaxa   = status?.semTaxa   === true || low(status?.["SemTaxa"] || status?.["Sem Taxa"]) === "sim";
      const bloqueado = status?.bloqueado === true || low(status?.["Bloqueado"]) === "sim";
      const ativado   = status?.ativado   === true || low(status?.["Ativado"]) === "sim";
      const desistiu  = status?.desistiu  === true || low(status?.["Desistiu"]) === "sim";

      if (desistiu) return false;
      if (semTaxa) return true;               // sem taxa qualifica (comissão = 5)
      if (bloqueado && !pagou) return false;  // bloqueado + não pagou => não qualifica
      return ativado && pagou;                // principal: ativo + pagou taxa
    }


    // Vendas qualificadas do período
    const vendasQualificadas = useMemo(
    () => vendasFiltradas.filter((v) => vendaQualifica(getStatusDeVenda(v))),
    [vendasFiltradas, statusByVendedorCpf]
    );


    const totalComissao = useMemo(
      () =>
        vendasFiltradas.reduce((acc, v) => {
          const status = getStatusDeVenda(v); // usa o helper centralizado
          return acc + comissaoEstimativaPorVenda(v, status);
        }, 0),
      [vendasFiltradas, statusByVendedorCpf]
    );

  // Receita estimada por plano baseada no preço do plano (NocoDB), não na comissão
      const receitaPorPlano = useMemo(() => {
      // SOMENTE vendas qualificadas contam para receita estimada
      const map = new Map();
      for (const v of vendasQualificadas) {
            const plano = v.plano || v.Plano || "Indefinido";
            const valorPlano = getPrecoPlano(plano, precosPlanos) || 0;
            map.set(plano, (map.get(plano) || 0) + valorPlano);
          }
          return [...map.entries()].map(([name, value]) => ({ name, value }));
      }, [vendasQualificadas, precosPlanos]);

  useEffect(() => {
  if (!Object.keys(precosPlanos).length) return;
  const map = new Map();
   for (const v of vendasQualificadas) {
    const plano = v.plano || v.Plano || "Indefinido";
    const valorPlano = getPrecoPlano(plano, precosPlanos) || 0;
    map.set(plano, (map.get(plano) || 0) + valorPlano);
  }
  const preview = [...map.entries()].map(([name, value]) => ({ name, value })).slice(0, 3);
  //console.log("[ADM] receitaPorPlano (preview)", preview);
}, [precosPlanos, vendasQualificadas]);



  

const clientesPorTaxa = useMemo(() => {
  // agregamos por CPF: se em algum momento "pagou", fica pagou; senão, se "sem taxa", fica sem; senão outros
  const porCpf = new Map();

  const getCpf = (v) =>
    String(
      v?.cpf || v?.CPF || v?.documento || v?.cpfCliente || v?.cpf_cliente || ""
    ).replace(/\D/g, "");

  const lower = (s) => String(s || "").trim().toLowerCase();

  for (const v of vendasFiltradas || []) {
    const cpf = getCpf(v);
    if (!cpf) continue;

    const status = getStatusDeVenda(v); // 👈 traga pra cima
    if (isTransferencia(status)) {
      // Transferência não entra em "Pagou" nem "Sem Taxa"
      const atual = porCpf.get(cpf) || "outros";
      porCpf.set(cpf, atual);
      continue;
    }

    const isPagou   = lower(status?.["Pagou Taxa"]) === "sim";
    const isSemTaxa = lower(status?.["Sem Taxa"]) === "sim" || lower(status?.["SemTaxa"]) === "sim";

    const atual = porCpf.get(cpf) || "outros";
    let proximo = atual;

    if (isPagou) proximo = "pagou";
    else if (isSemTaxa && atual !== "pagou") proximo = "sem";

    porCpf.set(cpf, proximo);
  }


  

  let pagou = 0, sem = 0, outros = 0;
  for (const st of porCpf.values()) {
    if (st === "pagou") pagou++;
    else if (st === "sem") sem++;
    else outros++;
  }

  return [
    { name: "Pagou Taxa", value: pagou },
    { name: "Sem Taxa",   value: sem },
    { name: "Pendente",     value: outros },
  ];
}, [vendasFiltradas, statusByVendedorCpf]);



  const participacaoPorVendedor = useMemo(() => {
    const map = new Map();
    for (const v of vendasFiltradas) {
      const vend = norm(v.__vendedorNome || v.vendedor || v.vendedorNome || "—");
      const val = comissaoEstimativaPorVenda(v, getStatusDeVenda(v)); // idem
      map.set(vend, (map.get(vend) || 0) + val);
    }
    const arr = [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value > 0);
    const total = arr.reduce((a, b) => a + b.value, 0) || 1;
    return arr.map((x) => ({ ...x, pct: +(100 * x.value / total).toFixed(2) }));
  }, [vendasFiltradas, statusByVendedorCpf]);


      const classificacaoPorVendedor = useMemo(() => {
            if (!vendasFiltradas.length) return [];
            

            const grupos = {};
            for (const v of vendasFiltradas) {
            const k = norm(v.__vendedorNome || v.vendedor || v.vendedorNome || "—");
            (grupos[k] ||= []).push(v);
            }

            const normalizar = (x) =>
            (x || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            const rows = [];
            for (const [vendKey, arr] of Object.entries(grupos)) {
            const statusMap = statusByVendedorCpf[vendKey] || {};
            const exemploStatus = Object.values(statusMap)[0] || {};
            const cls =
            exemploStatus.Classificação ||
            exemploStatus.classificacao ||
            exemploStatus.Classificacao ||
            "Ouro";

            let total = 0;
            let vendasQ = 0;

            for (const venda of arr) {
            const cpf = (venda.cpf || venda.CPF || venda.documento || venda.cpfCliente || venda.cpf_cliente || "")
            .toString()
            .replace(/\D/g, "");
            const cliente = statusMap[cpf];
            if (!cliente) continue;

                        // 👇 pular vendas de Alteração de Titularidade
            if (isTransferencia(cliente)) continue;
            // flags do cliente
            const pagouTaxa = normalizar(cliente["Pagou Taxa"]);
            const bloqueado = normalizar(cliente["Bloqueado"]);
            const ativado   = normalizar(cliente["Ativado"]);
            const desistiu  = normalizar(cliente["Desistiu"]);

            // bloqueado/desistiu => nada
            if (bloqueado === "sim" || desistiu === "sim") continue;

            // SEM TAXA sempre 5 (segue sua função)
            const isSemTaxa =
                normalizar(cliente["Sem Taxa"]) === "sim" ||
                normalizar(cliente["SemTaxa"]) === "sim" ||
                normalizar(cliente["Autorizado"]) === "sem taxa";

              if (isSemTaxa) {
                total += 5;
                vendasQ += 1;
                continue;
              }


            if (tabelaComissoes?.kind === "fixed") {
            // usa exatamente sua função
            const c = Number(
            calcularComissaoCliente({
            cpf,
            cliente,
            classificacao: cls,
            tabela: tabelaComissoes,
            })
            ) || 0;
            if (c > 0) vendasQ += 1;
            total += c;
            } else {
            // kind === 'percent' -> mesma lógica, mas aplica % no valor da venda
            const perc = Number(tabelaComissoes?.map?.[normalizar(cls)] ?? 0);
            const base = Number(venda.valor_total ?? venda.valorTotal ?? venda.total ?? venda.valor ?? 0) || 0;

            if (ativado === "sim" && pagouTaxa === "sim") {
            const c = base * (perc / 100);
            if (c > 0) vendasQ += 1;
            total += c;
            } else if (ativado === "sim" && pagouTaxa !== "sim") {
            total += 5;     // mesma exceção da sua função
            vendasQ += 1;
            }
            }
            }

            const any = arr[0] || {};
            rows.push({
            vendedor: any.__vendedorNome || any.vendedor || "—",
            cls,
            vendas: vendasQ,
            total: Number(total.toFixed(2)),
            });
            }
            return rows;
            }, [vendasFiltradas, statusByVendedorCpf, tabelaComissoes]);






const filtroExtremos = useMemo(() => {
  if (!vendasFiltradas.length) return { min: null, max: null };

  const datasValidas = vendasFiltradas
    .map((v) => parseAnyDate(v.dataHora || v.data || v.createdAt))
    .filter((d) => d?.isValid?.());

  if (!datasValidas.length) return { min: null, max: null };

  const timestamps = datasValidas.map((d) => d.valueOf());
  const min = dayjs(Math.min(...timestamps));
  const max = dayjs(Math.max(...timestamps));

  return { min, max };
}, [vendasFiltradas]);

  const vendedorEmailSelecionado =
    (vendedores || []).find((v) => v.vendedor === vendedorNome)?.email || "";

   return {
     loading,
     err,
     vendedores,
     vendedorEmailSelecionado, // ⬅ disponível na tela
     totalComissao,
     receitaPorPlano,
     clientesPorTaxa,
     participacaoPorVendedor,
     classificacaoPorVendedor,
      vendasFiltradas,
      vendasQualificadas,     // ⬅ novo: expõe para a tela contar vendedores/planos
     // DEBUG:
     filtroExtremos,
tabelaPrecos: precosPlanos, // ⬅ exporta a tabela de preços (NocoDB)
statusByVendedorCpf,
   };
}
