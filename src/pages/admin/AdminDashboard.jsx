import { useMemo, useState, useEffect } from "react";
import { useAdminDashboard } from "./hooks/useAdminDashboard";
import KpiCard from "./components/KpiCard";
import BarSimple from "./components/BarSimple";
import PieSimple from "./components/PieSimple";
import { getPrecoPlano } from "../../services/planosService"; // ajuste o path conforme necessário
import RankingVendedores from "./components/RankingVendedores";
import { useTheme, useUI  } from "../../state/ThemeContext";
import ModalHeatmapAdmin from "./components/ModalHeatmapAdmin";
import { MapPinned } from "lucide-react";
import ProbabilidadeDoDiaSlider from "./ProbabilidadeDoDiaSlider";
import { fetchTodasAsVendas } from "../../services/adminService"; // ajuste o path
import { onDev } from "../../dev/commandBus";
import ModalRelatorioComissaoAdmin from "./components/ModalRelatorioComissaoAdmin";
import AlertAposHorario from "./components/AlertAposHorario";
import HelpCenterFab from "./components/wiki/HelpCenterFab";
import MonthlyCloseBanner from "./components/MonthlyCloseBanner";
import { AnaliseMensalButton } from "./components/relatorios/AnaliseMensalModal";
import ConfigButton from "./components/config/ConfigButton";
import useCadastroVendedores from "./hooks/useConfigVendedores";
import useComissoes from "./hooks/useComissoes";
import ClassificacaoTable from "./components/ClassificacaoTable"; 
import { buildCtx, calcularComissaoPorRegras } from "../../services/comissaoService";
import { listRegras as listRegrasComissao } from "../../services/regras/nocodbRegrasComissao";
import { welcomeLog } from '../../utils/welcomeLog';
import { useAuth } from '../../state/auth'; // ajuste o caminho do seu projeto

import dayjs from "../../utils/dayjs"; // ajuste o path se já houver import

const dateMs = (r) => {
  let s = r?.dataHora ?? r?.data ?? r?.createdAt ?? r?.Data ?? null;
  if (!s) return 0;
  s = String(s)
    .replace(/\bat[eé]s?\b/gi, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const formats = [
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD HH:mm",
    "YYYY-MM-DD",
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY HH:mm",
    "DD/MM/YYYY",
    "DD-MM-YYYY HH:mm:ss",
    "DD-MM-YYYY HH:mm",
    "DD-MM-YYYY",
  ];

  const m = dayjs(s, formats, true);
  if (m.isValid()) return m.valueOf();
  const n = new Date(s).getTime();
  return Number.isFinite(n) ? n : 0;
};



function toISOStartLocal(d) {
  const m = dayjs(String(d), ["YYYY-MM-DD","DD/MM/YYYY","DD-MM-YYYY"], true);
  const base = m.isValid() ? m : dayjs(d);
  return base.startOf("day").format("YYYY-MM-DD[T]HH:mm:ss"); // sem Z
}
function endOfDayLocal(d) {
  const m = dayjs(String(d), ["YYYY-MM-DD","DD/MM/YYYY","DD-MM-YYYY"], true);
  const base = m.isValid() ? m : dayjs(d);
  return base.endOf("day").format("YYYY-MM-DD[T]HH:mm:ss"); // sem Z
}


// Converte "R$ 160,00" -> 160
const moneyToNumber = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (!v) return 0;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const asNumber = (v) => moneyToNumber(v);


// ------ Helpers para regras / status / CPF ------
const guessCPF = (r) =>
  String(r?.cpf || r?.CPF || r?.cpf_cliente || r?.cpfCliente || r?.documento || r?.doc || "")
    .replace(/\D/g, "");

const norm = (s) =>
  (s || "")
    .toString()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();



const isTransferencia = (cliente) => {
  const alter = norm(cliente?.["Alterar Titularidade"]);
  return (
    alter === "sim" ||
    !!cliente?.["Titular Anterior Nome"] ||
    !!cliente?.["Titular Anterior Documento"] ||
    !!cliente?.["Titular Anterior Obs"]
  );
};


const getValorClassificacaoCentavos = (tabela, classificacao) => {
  const key = (classificacao || "").toLowerCase();
  let v = tabela?.map?.[key];
  if (v != null) return v >= 100 ? Math.round(+v) : Math.round(+v * 100);

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const entry = tabela?.comissoes?.[classificacao] ?? tabela?.comissoes?.[cap(key)] ?? tabela?.comissoes?.[key];
  const raw = entry?.valor ?? entry;
  if (typeof raw === "string") {
    const n = Number(String(raw).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return Math.round((Number.isFinite(n) ? n : 0) * 100);
  }
  if (typeof raw === "number") return raw >= 100 ? Math.round(raw) : Math.round(raw * 100);
  return 0;
};





export default function AdminDashboard() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const { theme, toggleTheme } = useTheme();
  const UI = useUI();
  const [de, setDe] = useState(first.toISOString().slice(0, 10));
  const [ate, setAte] = useState(today.toISOString().slice(0, 10));
  const [vend, setVend] = useState("Todos");
  const [showDbg, setShowDbg] = useState(false);
  const [heatOpen, setHeatOpen] = useState(false);
  const [todasAsVendasBrutas, setTodasAsVendasBrutas] = useState([]);
  const [listaDeVendedores, setListaDeVendedores] = useState([]);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  const { lista: comissoes, loading: loadingCom, error: errCom, saveLista } = useComissoes();
  const [statusVersion, setStatusVersion] = useState(0);
  const { user } = useAuth?.() || { user: null };


  const [todasAsVendas, setTodasAsVendas] = useState([]);
  const [regras, setRegras] = useState([]);

    useEffect(() => {
      const off1 = onDev("status:clientes:updated",  () => setStatusVersion(v => v + 1));
      const off2 = onDev("status:clientes:bulkUpdated", () => setStatusVersion(v => v + 1));
      return () => { off1 && off1(); off2 && off2(); };
    }, []);

      useEffect(() => {
        welcomeLog({
          role: "ADMIN",
          name: user?.nome || user?.name || "",
          email: user?.email || "",
        });
      }, [user]);




  // transforma a lista de comissões (NocoDB) em um mapa em centavos
const tabelaPct = useMemo(() => {
  // comissoes: [{ classificacao: 'Ouro', valor: 'R$ 5,00' }, ...]
  const map = {};
  const comissoesObj = {};

  (comissoes || []).forEach((row) => {
    const key = String(row.classificacao || row.Classificacao || row.nome || "").trim().toLowerCase();
    const raw = row.valor ?? row.Valor ?? row.preco ?? row.Preco ?? 0;
    const n = Number(String(raw).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    const cent = Math.round((Number.isFinite(n) ? n : 0) * 100);

    if (key) {
      map[key] = cent;                       // ex.: map['ouro'] = 500
      comissoesObj[row.classificacao || row.Classificacao || key] = { valor: n }; // só pra manter compat
    }
  });

  return Object.keys(map).length ? { map, comissoes: comissoesObj } : null;
}, [comissoes]);

  /*
  console.log("[DBG regras]", regras);
  console.log("[DBG tabelaPct]", tabelaPct);
  */
  // recarrega do NocoDB (ou de onde vier)
  const refreshRegras = async () => {
    try {
      const r = await listRegrasComissao();
      setRegras(Array.isArray(r) ? r : []);
    } catch (e) {
      console.warn("[ADM] refreshRegras falhou", e);
      setRegras([]);
    }
  };

  // canal cross-aba e mesma aba (mais confiável que só localStorage) 
const regrasBC = 
  typeof BroadcastChannel !== "undefined" 
    ? new BroadcastChannel("regras:comissao") 
    : null;

// 🔄 regras em tempo real: commandBus + storage (entre abas)
useEffect(() => {
  // 1) evento interno (mesma aba)
  const off = onDev("regras:comissao:changed", async (payload = {}) => {
    // se vier a lista já pronta, aplica direto; senão, refaz o fetch
    if (Array.isArray(payload.lista)) {
      setRegras(payload.lista);
    } else {
      await refreshRegras();
    }
  });

    // 1.1) BroadcastChannel (mesma aba/SPA e entre abas) 
  const onBC = (e) => { 
    const d = e?.data; 
    if (d?.type === "regras:comissao:changed" && Array.isArray(d.lista)) { 
      setRegras(d.lista); 
    } 
  }; 
  regrasBC?.addEventListener?.("message", onBC);

  // 2) sincronização entre abas / janelas
  const onStorage = async (e) => {
    if (e.key === "regras:comissao:lista" && e.newValue) {
      try {
        setRegras(JSON.parse(e.newValue));
      } catch {}
    }
    if (e.key === "regras:comissao:ping") {
      await refreshRegras();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    off && off();
    regrasBC?.removeEventListener?.("message", onBC); 
    window.removeEventListener("storage", onStorage);
  };
}, []);



  useEffect(() => {
    (async () => {
      try {
        const r = await listRegrasComissao();
        setRegras(Array.isArray(r) ? r : []);
      } catch (e) {
        console.warn("[ADM] regras falharam", e);
        setRegras([]);
      }
    })();
  }, []);

  const [loadingAll, setLoadingAll] = useState(false);


    // helper que aplica o range (mantendo seu formato YYYY-MM-DD)
  const applyPrevMonthRange = (deISO, ateISO) => {
    setDe(deISO);
    setAte(ateISO);
  };





    // escuta "debug:vendas" vindo do DevConsole
 useEffect(() => {
    const off = onDev("debug:vendas", ({ visible }) => setShowDbg(!!visible));
    return off;
  }, []);


  
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingAll(true);
        const all = await fetchTodasAsVendas();
        if (alive) setTodasAsVendas(all || []);
      } finally {
        if (alive) setLoadingAll(false);
      }
    })();
    return () => { alive = false; };
  }, []);



  /*useEffect(() => {
    console.log("[ADM] Filtros (UI):", { de, ate, vend });
    console.log("[ADM] Filtros (ISO p/ hook):", {
      deISO: toISOStartLocal(de),
      ateISO: endOfDayLocal(ate),
    });
    
  }, [de, ate, vend]);*/


  const {
    loading,
    err,
    vendedores = [],
    totalComissao = 0,
    receitaPorPlano = [],
    clientesPorTaxa = [],
    participacaoPorVendedor = [],
    classificacaoPorVendedor = [],
    vendasFiltradas = [],
    vendasQualificadas = [],
    filtroExtremos = { min: null, max: null },
    vendedorEmailSelecionado = "", // novo
    tabelaPrecos: precosPlanos,
    statusByVendedorCpf,
    vendas,
  } = useAdminDashboard({
    de: toISOStartLocal(de),
    ate: endOfDayLocal(ate),
    vendedorNome: vend,
    version: statusVersion,
  });



    const statusByVendCpfNorm = useMemo(() => {
      const src = statusByVendedorCpf || {};
      const out = {};
      for (const vendKey of Object.keys(src)) {
        // mesma normalização usada no restante do código
        out[norm(vendKey)] = src[vendKey] || {};
      }
      return out;
    }, [statusByVendedorCpf]);


  useEffect(() => {
    if (loading) return;

    const vendedoresNomes = (vendedores || []).map((v) => v.vendedor);
    const vendedoresDistintosTabela = new Set(
      (classificacaoPorVendedor || []).map((x) => x.vendedor)
    );

    const somaComissaoTabela = (classificacaoPorVendedor || []).reduce(
      (acc, x) => acc + asNumber(x.total || x.Comissao || x["Comissão"] || 0),
      0
    );
    const somaVendasTabela = (classificacaoPorVendedor || []).reduce(
      (acc, x) => acc + asNumber(x.vendas || 0),
      0
    );
    const somaPlanosSerie = (receitaPorPlano || []).reduce(
      (acc, x) => acc + asNumber(x.value || 0),
      0
    );

    /*console.log("[ADM] Hook retorno:");
    console.log("  loading:", loading, "err:", err || "—");
    console.log("  vendedores:", vendedoresNomes.length, vendedoresNomes);
    console.log("  vendedores(distintos na tabela):", [...vendedoresDistintosTabela]);
    console.log("  KPIs:", {
      totalComissao,
      somaComissaoTabela,
      somaVendasTabela,
      somaPlanosSerie,
    });
    console.log("  séries:", {
      receitaPorPlanoLen: receitaPorPlano.length,
      clientesPorTaxaLen: clientesPorTaxa.length,
      participacaoPorVendedorLen: participacaoPorVendedor.length,
      classificacaoPorVendedorLen: classificacaoPorVendedor.length,
    });
    console.log("  amostras:", {
      receitaPorPlano: receitaPorPlano.slice(0, 3),
      clientesPorTaxa: clientesPorTaxa.slice(0, 3),
      participacaoPorVendedor: participacaoPorVendedor.slice(0, 3),
      classificacaoPorVendedor: classificacaoPorVendedor.slice(0, 3),
    });*/
  }, [
    loading,
    err,
    vendedores,
    totalComissao,
    receitaPorPlano,
    clientesPorTaxa,
    participacaoPorVendedor,
    classificacaoPorVendedor,
  ]);

  // junta todos os mapas de clientes em um só (cpf -> status/flags)
const mapaClientesGlobal = useMemo(() => {
  const out = {};
  const src = statusByVendedorCpf || {};
  Object.keys(src).forEach((vend) => {
    const m = src[vend] || {};
    Object.keys(m).forEach((cpf) => { if (!out[cpf]) out[cpf] = m[cpf]; });
  });
  return out;
}, [statusByVendedorCpf]);

// linhas mínimas p/ ClassificacaoTable (ela recalcula vendas/total)
 const tabelaClassificacaoRows = useMemo( 
   () => classificacaoPorVendedor || [], 
   [classificacaoPorVendedor] 
 );


// Tabela pronta: calcula o total de comissão por vendedor aplicando as REGRAS.
const tabelaClassificacao = useMemo(() => {
  const base = (classificacaoPorVendedor || []).map((x) => ({
    vendedor: x.vendedor,
    cls: x.cls || x.Classificação || x.classificacao || x.Classificacao || "—",
    vendas: moneyToNumber(x.vendas || 0),
    total: moneyToNumber(x.total ?? x["Comissão (R$)"] ?? x.Comissao ?? x.comissao ?? 0),
  }));

  // Fallback: enquanto regras/tabelaPct não chegam, mostre o que já veio do hook
  if (!(Array.isArray(regras) && regras.length) || !tabelaPct) {
    console.warn("[tabelaClassificacao] Fallback ativado: regras ou tabelaPct não carregaram", { regras, tabelaPct });
    return base;
  }

  const baseVendas = vendasFiltradas || [];

  return base.map((row) => {
    const alvo = norm(row.vendedor);

    // Vendas daquele vendedor no período (já filtradas pelo hook)
    const regsVend = baseVendas.filter((v) => {
      const nm = v.__vendedorNome || v.vendedor || v.Vendedor || "";
      return norm(nm) === alvo;
    });

    // ✅ DEDUP por CPF (pega a MAIS RECENTE) — igual ao VendedorDashboard
    const byCpf = new Map(); // cpf -> { v, ts }
    for (const v of regsVend) {
      const cpf = guessCPF(v);
      if (!cpf) continue;
      const ts = dateMs(v);
      const cur = byCpf.get(cpf);
      if (!cur || ts > cur.ts) byCpf.set(cpf, { v, ts });
    }
    const regsVendUnique = Array.from(byCpf.values())
      .map((x) => x.v)
      .sort((a, b) => dateMs(b) - dateMs(a));

    /*console.log(`[DEBUG] Vendas filtradas p/ ${alvo}: ${regsVend.length} | únicas (por CPF): ${regsVendUnique.length}`);*/

    // ✅ Soma com REGRAS sem alterar o contexto (NÃO forçar clienteAtivo)
    let subtotal = 0;
    const vendasValidas = [];

    for (const venda of regsVendUnique) {
      const cpf = guessCPF(venda);
      if (!cpf) {
        console.warn(`[DEBUG] Venda sem CPF válida para ${alvo}, ignorando`, venda);
        continue;
      }

      // usa primeiro o mapa do próprio vendedor; se faltar, cai no global
      const perVendMap = statusByVendCpfNorm[alvo] || {};   // 'alvo' já é o vendedor normalizado nessa memo
      const cliente = perVendMap[cpf] || mapaClientesGlobal[cpf] || {};
      const ctx = buildCtx({ venda, cliente, classificacao: row.cls });
      ctx.valorClassificacaoCentavos = getValorClassificacaoCentavos(tabelaPct, row.cls);

      const val = calcularComissaoPorRegras(regras, ctx);

      if (Number.isFinite(val)) {
        subtotal += val;
        vendasValidas.push({
          cpf,
          comissao: val,
          data: venda.dataHora ?? venda.data ?? venda.createdAt ?? venda.Data,
          clienteAtivo: ctx.clienteAtivo,
          semTaxa: ctx.semTaxa,
          isTransferencia: isTransferencia(cliente),
        });
      }

      /*console.log(`[DEBUG] Venda de ${alvo}, CPF ${cpf}, Comissão: ${val}, Subtotal: ${subtotal.toFixed(2)}`, {
        ctx,
        clienteStatus: cliente,
      });*/
    }


    // Loga status do mapaClientesGlobal pra investigar
    /*console.log(`[DEBUG] mapaClientesGlobal para ${alvo}`, Object.keys(mapaClientesGlobal).filter(cpf => regsVend.some(v => guessCPF(v) === cpf)).map(cpf => ({
      cpf,
      status: mapaClientesGlobal[cpf],
    })));*/

    return { ...row, total: Number(subtotal.toFixed(2)), vendas: vendasValidas.length };
  });
}, [classificacaoPorVendedor, vendasFiltradas, regras, tabelaPct, mapaClientesGlobal]);





// Mapa de classificação por vendedor (usa a mesma origem da ClassificacaoTable)
const clsByVend = useMemo(() => {
  const map = {};
  for (const x of (classificacaoPorVendedor || [])) {
    const vend = (x.vendedor || "").toString().trim().toLowerCase();
    const cls  = x.cls || x.Classificação || x.classificacao || x.Classificacao || "—";
    map[vend] = cls;
  }
  return map;
}, [classificacaoPorVendedor]);

// Comissão por venda usando as REGRAS + tabela de valores por classificação
const calcComissaoPorVenda = (venda) => {
  try {
    if (!regras || !tabelaPct) return 0;

    const vendedorKey = (venda.__vendedorNome || venda.vendedor || venda.Vendedor || "")
      .toString().trim().toLowerCase();
    const cls = clsByVend[vendedorKey] || "—";

    // mesmo helper que você já usa na tabela
    const valorClassifCent = getValorClassificacaoCentavos(tabelaPct, cls);

    const cpf = guessCPF(venda);
    const vendKey = (venda.__vendedorNome || venda.vendedor || venda.Vendedor || "")
      .toString().trim().toLowerCase();
    const cliente =
      (statusByVendCpfNorm[vendKey]?.[cpf])   // preferir o mapa do vendedor da venda
      || mapaClientesGlobal?.[cpf]            // fallback global
      || {};


    const ctx = buildCtx({ venda, cliente, classificacao: cls });
    ctx.valorClassificacaoCentavos = valorClassifCent;

    const val = calcularComissaoPorRegras(regras, ctx);
    return Number.isFinite(val) ? Number(val.toFixed(2)) : 0;
  } catch {
    return 0;
  }
};

// Status textual da venda (o modal usa para mostrar/filtrar)
const getStatusVenda = (v) => (v?.status || v?.Status || "").toString();


useEffect(() => {
  /*
  console.log("[DBG regras]", regras);
  console.log("[DBG tabelaPct]", tabelaPct);
  console.log("[DBG classifPorVendedor (raw)]", (classificacaoPorVendedor || []).slice(0,3));
  console.log("[DBG vendasFiltradas (raw)]", (vendasFiltradas || []).slice(0,5));
  console.log("[DBG statusByVendedorCpf keys]", Object.keys(statusByVendedorCpf || {}).length);
  console.log("[DBG tabelaClassificacao]", (tabelaClassificacao || []).slice(0,3));
  */

  // soma do que veio cru do hook (pra comparar com a tabela calculada)
  const somaHook = (classificacaoPorVendedor || []).reduce(
    (acc, r) => acc + (
      Number(
        String(
          r.total ?? r["Comissão (R$)"] ?? r.Comissao ?? r.comissao ?? 0
        ).replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".")
      ) || 0
    ), 0);
  //console.log("[DBG soma hook]", somaHook);
}, [
  tabelaClassificacao,
  regras,
  tabelaPct,
  classificacaoPorVendedor,
  vendasFiltradas,
  statusByVendedorCpf
]);



const totalComissaoKpi = useMemo(() => {
  return (tabelaClassificacao || []).reduce((acc, r) => acc + moneyToNumber(r.total), 0);
}, [tabelaClassificacao]);

const totalPeriodo = useMemo(() => totalComissaoKpi, [totalComissaoKpi]);




const kpis = useMemo(() => {
  const total = asNumber(totalPeriodo);

  const receitaTotalPeriodo = (vendasQualificadas || []).reduce((acc, venda) => {
    const plano = venda.plano || venda.Plano;
    const preco = getPrecoPlano(plano, precosPlanos || {});
    //console.log("[KPI] venda:", plano, "→ preço:", preco);
    return acc + asNumber(preco);
  }, 0);

    // Contagem por vendas no período (independe de qualificação)
    const qtdVend = new Set(
    (vendasFiltradas || []).map((x) => x.__vendedorNome || x.vendedor)
    ).size;
    const qtdPlanos = new Set(
    (vendasFiltradas || []).map((x) => x.plano || x.Plano)
    ).size;


  return [
    { title: "Comissão a pagar (período)", value: `R$ ${total.toFixed(2)}` },
    { title: "Receita estimada (período)", value: `R$ ${receitaTotalPeriodo.toFixed(2)}` },
    { title: "Vendedores no filtro", value: qtdVend },
    { title: "Planos no filtro", value: qtdPlanos },
  ];
}, [totalPeriodo, vendasQualificadas, vendasFiltradas, precosPlanos]);

const vendasParaMapa = useMemo(
() => (vendas || []).map((v) => ({
...v,
vendedor: v.vendedor ?? v.__vendedorNome ?? v.Vendedor ?? "",
})),
[vendas]
);




  return (
  <div className="max-w-7xl mx-auto p-4">
    {/* Header */}
    <header className="mb-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Admin · Dashboard</h1>
        {/*<div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="text-xs px-2 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            title={`Tema atual: ${theme}`}
          >
            Tema: {theme === "dark" ? "Escuro" : "Claro"}
          </button>
        </div>*/}
      </div>
      {/* filete com gradiente emerald */}
      <div className="h-[2px] w-full rounded-full mt-2" style={{ background: UI.primaryGrad }} />
      <AlertAposHorario horaLimite={15} minutoLimite={30} preAvisoMinutos={10} className="mt-4" ></AlertAposHorario>
      <MonthlyCloseBanner
          force                // remova em produção
          onApplyRange={(d,a) => { setDe(d); setAte(a); }}
          onAccess={() => setRelatorioOpen(true)}
          accentGradient={UI?.primaryGrad}   // casa com seu ThemeContext
      />


    </header>

    {/* Painel de debug */}
    {showDbg && (
      <div className="mb-3 text-xs rounded-xl border p-3 bg-white border-zinc-200 dark:bg-zinc-950/40 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <strong className="opacity-80">
            <span className="text-emerald-600 dark:text-emerald-400">DEBUG</span>
          </strong>
          <button
            className="opacity-70 hover:opacity-100 underline"
            onClick={() => setShowDbg(false)}
          >
            esconder
          </button>
        </div>
        <div className="mt-2 grid sm:grid-cols-2 gap-2">
          <div>
            <div>De: {de} → ISO {toISOStart(de)}</div>
            <div>Até: {ate} → ISO {endOfDay(ate)}</div>
            <div>Vendedor: {vend}</div>
            {vend !== "Todos" && vendedorEmailSelecionado && (
              <div>Email: {vendedorEmailSelecionado}</div>
            )}
          </div>
          <div>
            <div>Vendedores carregados: {vendedores.length}</div>
            <div>Planos (série): {receitaPorPlano.length}</div>
            <div>Vendedores na tabela: {classificacaoPorVendedor.length}</div>
          </div>
        </div>
      </div>
    )}


    {/* Filtros — tudo em 1 linha */}
    <div
      className="flex items-end gap-2 md:gap-3 mb-4
                flex-nowrap overflow-x-auto whitespace-nowrap"
    >
      {/* De */}
      <div className="flex flex-col shrink-0 space-y-1">
        <label className="text-xs opacity-75">De</label>
        <input
          type="date"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          className="px-3 py-2 rounded-xl border w-[180px]
                    bg-white border-zinc-200 text-zinc-900
                    focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
                    dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Até */}
      <div className="flex flex-col shrink-0 space-y-1">
        <label className="text-xs opacity-75">Até</label>
        <input
          type="date"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="px-3 py-2 rounded-xl border w-[180px]
                    bg-white border-zinc-200 text-zinc-900
                    focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
                    dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Vendedor */}
      <div className="flex flex-col shrink-0 space-y-1 min-w-[220px]">
        <label className="text-xs opacity-75">Vendedor</label>
        <select
          value={vend}
          onChange={(e) => setVend(e.target.value)}
          className="px-3 py-2 rounded-xl border w-full
                    bg-white border-zinc-200 text-zinc-900
                    focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500
                    dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
        >
          {(vendedores || [{ vendedor: "Todos" }]).map((v) => (
            <option key={v.vendedor} value={v.vendedor}>
              {v.vendedor}
            </option>
          ))}
        </select>
      </div>

      {/* Ações (3 botões) */}
      <div className="flex flex-col shrink-0 space-y-1">
        {/* label fantasma só pra alinhar a altura */}
        <label className="text-xs opacity-0 select-none">Ações</label>

        <div className="flex flex-nowrap items-center gap-2">
          {/* Heatmap */}
          <button
            onClick={() => setHeatOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 px-3 h-10 rounded-xl border
                      bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50
                      dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900"
            title="Abrir mapa de calor"
          >
            <MapPinned className="w-4 h-4" />
            Heatmap
          </button>

          {/* Análise Mensal */}
          <AnaliseMensalButton
            className="shrink-0 inline-flex items-center gap-2 px-3 h-10 rounded-xl border
                      bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50
                      dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900"
            vendas={todasAsVendas.length ? todasAsVendas : (vendas || [])}
            de={de}
            ate={ate}
            statusByVendedorCpf={statusByVendedorCpf}
          >
            Análise Mensal
          </AnaliseMensalButton>

          {/* Configurações */}
          <ConfigButton
            className="shrink-0 inline-flex items-center gap-2 px-3 h-10 rounded-xl border
                      bg-white border-zinc-200 text-zinc-900 hover:bg-zinc-50
                      dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-900"
            vendedores={vendedores}
            comissoes={comissoes}
            onCreateVendedor={(payload)=> console.log("criar", payload)}
            onUpdateVendedor={(vend, patch)=> console.log("atualizar", vend, patch)}
            onDeleteVendedor={(vend)=> console.log("remover", vend)}
            onSaveComissoes={saveLista}
          >
            Configurações
          </ConfigButton>
        </div>
      </div>
    </div>


    {/* Estados */}
    {err && <div className="text-sm text-red-600 dark:text-red-400 mb-3">Erro: {err}</div>}
    {loading && (
      <div className="text-sm opacity-70 mb-3 animate-pulse">
        Carregando dados…
      </div>
    )}

    {/* KPIs */}
    <div className="grid sm:grid-cols-3 gap-3 mb-4">
        {kpis.map((k, i) => (
            <div
                key={i}
                onClick={() => i === 0 && setRelatorioOpen(true)}
                className={i === 0 ? "cursor-pointer" : ""}
                title={i === 0 ? "Abrir relatório de comissão (período)" : undefined}
                >
            <KpiCard {...k} />
            </div>
    ))}
    </div>

    {/* Grids */}
    <div className="grid lg:grid-cols-2 gap-4">
      <div>
        <div className="mb-2 font-medium">Receita estimada por plano</div>
        <BarSimple data={receitaPorPlano} format="currency" yDomain={[0, "auto"]} />

        {!loading && receitaPorPlano.length === 0 && (
          <div className="text-xs opacity-60 mt-2">Sem dados no período.</div>
        )}
      </div>

      <div>
        <div className="mb-2 font-medium">Clientes por status de taxa</div>
        <PieSimple data={clientesPorTaxa} />
        {!loading && clientesPorTaxa.length === 0 && (
          <div className="text-xs opacity-60 mt-2">Sem dados no período.</div>
        )}
      </div>

      <div>
        <div className="mb-2 font-medium">Ranking de vendedores (por comissão)</div>
         <RankingVendedores 
          rows={tabelaClassificacao} 
            limit={10}
          />

      </div>

      <div>
        <div className="mb-2 font-medium">Classificação por vendedor</div>
        <ClassificacaoTable
          rows={tabelaClassificacao}   // ou rows={classificacaoPorVendedor}
          vendas={todasAsVendas.length ? todasAsVendas : (vendas || [])}
          de={de}
          ate={ate}
          statusMap={mapaClientesGlobal}
          statusByVendCpf={statusByVendCpfNorm}
          regras={regras}              // 👈 agora vai
          tabelaPct={tabelaPct}        // 👈 agora vai
        />


        {!loading && classificacaoPorVendedor.length === 0 && (
          <div className="text-xs opacity-60 mt-2">Sem dados no período.</div>
        )}

        <ProbabilidadeDoDiaSlider
        vendas={todasAsVendas.length ? todasAsVendas : vendasFiltradas}
        className="mt-4"
        />
      </div>


    </div>

      <ModalHeatmapAdmin
          isOpen={heatOpen}
          onClose={() => setHeatOpen(false)}
          data={todasAsVendasBrutas}                                     // TODAS as vendas
          vendedores={listaDeVendedores.map(v => v.vendedor)}            // nomes p/ combo
          initialVendedor={(vend ?? "Todos") === "Todos" ? "" : vend}    // "" = Todos
          initialDateFrom={de ?? filtros?.dateFrom ?? ""}                // ajuste se seus estados tiverem outro nome
          initialDateTo={ate ?? filtros?.dateTo ?? ""}
        />

        
          
          <ModalRelatorioComissaoAdmin
            isOpen={relatorioOpen}
            onClose={() => setRelatorioOpen(false)}
            de={de}
            ate={ate}
            resumo={tabelaClassificacaoRows}
            vendas={vendasFiltradas}
            statusMap={mapaClientesGlobal}
            statusByVendCpf={statusByVendCpfNorm}
            filenameBase="relatorio-comissao"
            // 👇 novo
            calcComissao={calcComissaoPorVenda}
            getStatus={getStatusVenda}
          />




        <HelpCenterFab />
  </div>
);

}
