import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/state/auth';
import { listarVendedores } from '../services/vendedoresService';
import {
  carregarTabelaComissao,
  carregarMapaClientesDoVendedor
} from '../services/comissaoService';
import { calcularComissaoCliente } from '../utils/calculoComissao';
import { startOfMonth, today } from '../utils/date';
import { downloadCSV } from '../utils/csv';
import EditarStatusClienteModal from '../../src/components/vendedor/EditarStatusClienteModal';
import VendedorXPBar from '../components/vendedor/VendedorXPBar';

import StatusIcon from '../../src/components/vendedor/StatusIcon';
import FichasModal from '../components/vendedor/FichasModal';
import StatusLegendDock from '../components/vendedor/StatusLegendDock';
import { MapPinned, LineChart as LineChartIcon, ArrowLeftRight, Settings } from "lucide-react";

import HeatmapModal from "../components/vendedor/HeatmapModal";
import ChartModal from "../components/vendedor/ChartModal.jsx";
import VendedorProbabilidadePanel from '../components/vendedor/probabilidade/VendedorProbabilidadePanel.jsx';
import { onDev } from "../dev/commandBus"; // ajuste o path

import VendedorConfigModal from '../components/vendedor/VendedorConfigModal.jsx';
import { listRegras as listRegrasComissao } from '../services/regras/nocodbRegrasComissao';
import { useTheme } from "../state/ThemeContext"; // ADICIONE
import { useNavigate } from "react-router-dom";   // se já não tiver

import { welcomeLog } from '../utils/welcomeLog';


import dayjs from '../utils/dayjs';

// Adicione esta função no topo do arquivo (como no admin)
const dateMs = (r) => {
  let s = r?.dataHora ?? r?.data ?? r?.createdAt ?? r?.Data ?? null;
  if (!s) return 0;

  // normalizações comuns nos teus dados:
  // - remove vírgulas entre data e hora
  // - remove "às" / "As" etc.
  // - trim
  s = String(s)
    .replace(/\bat[eé]s?\b/gi, " ")   // "às 16:52:39" -> " 16:52:39"
    .replace(/,/g, " ")               // "06/08/2025, 16:52:39" -> "06/08/2025 16:52:39"
    .replace(/\s+/g, " ")
    .trim();

  // tente uma lista ampla de formatos (todas as variantes que já vimos)
  const formats = [
    // ISO / variantes
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DD HH:mm",
    "YYYY-MM-DD",

    // BR com barra
    "DD/MM/YYYY HH:mm:ss",
    "DD/MM/YYYY HH:mm",
    "DD/MM/YYYY",

    // BR com hífen
    "DD-MM-YYYY HH:mm:ss",
    "DD-MM-YYYY HH:mm",
    "DD-MM-YYYY",
  ];

  const m = dayjs(s, formats, true);
  if (m.isValid()) return m.valueOf();

  // fallback: tenta Date nativo (última cartada)
  const n = new Date(s).getTime();
  return Number.isFinite(n) ? n : 0;
};

// Hook: detecta mobile via matchMedia
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    // estado inicial (caso)
    handler(mql);
    // listeners modernos e fallback
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [breakpoint]);

  return isMobile;
}


// (mantive caso você use em outro ponto)
const NOCODB_BASE = import.meta.env.VITE_NOCODB_URL || 'https://nocodb.nexusnerds.com.br';
const NOCODB_TOKEN = import.meta.env.VITE_NOCODB_SUPERTOKEN || import.meta.env.VITE_NOCODB_TOKEN;
const VENDEDOR_TABLE = import.meta.env.VITE_VENDEDOR_TABLE || 'mo4wnahtbw2mog2';
const VENDEDOR_VIEW = import.meta.env.VITE_VENDEDOR_VIEW || '';

function moneyToNumber(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function guessValor(r) {
  if (typeof r === 'number') return r;
  if (!r) return 0;

  const planosFixos = {
    gold: 99.9,
    prata: 79.9,
    bronze: 59.9
  };
  const plano = (r.plano || '').toLowerCase();
  if (planosFixos[plano]) return planosFixos[plano];

  const s = String(r.valor || r.valorTotal || r.preco || r.price || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function guessCPF(r) {
  return String(
    r.cpf || r.CPF || r.cpf_cliente || r.cpfCliente || r.documento || r.doc || ''
  ).replace(/\D/g, '');
}

function parseDataHora(s) {
  // tenta vários formatos que você já usa
  const d = dayjs(s, ['DD/MM/YYYY, HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DDTHH:mm:ssZ'], true);
  return d.isValid() ? d : null;
}



function extrairVendedorKey({ nome, email, vendedoresJson }) {
  const nomeLc = (nome || '').toLowerCase().trim();
  const emailLc = (email || '').toLowerCase().trim();

  for (const [key, v] of Object.entries(vendedoresJson || {})) {
    const nomeV = (v.nome || '').toLowerCase().trim();
    const emailV = (v.email || '').toLowerCase().trim();
    if (emailV === emailLc || nomeV === nomeLc) {
      return key;
    }
  }
  return null;
}


function formatBRL(n) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function fetchClassificacaoDoVendedor({ email, nome }) {
  const params = new URLSearchParams();
  params.set('limit', '1');
  params.set('fields', 'Vendedor');

  const url = `${NOCODB_BASE}/api/v2/tables/${VENDEDOR_TABLE}/records?${params.toString()}`;
  let res = await fetch(url, { headers: { 'xc-token': NOCODB_TOKEN } });

  if (!res.ok) {
    console.warn('[VENDEDOR] falhou', res.status, await res.text());
    return null;
  }

  const json = await res.json();
  const row = json?.list?.[0];
  if (!row || row.Vendedor == null) return null;

  let blob = row.Vendedor;
  if (typeof blob === 'string') {
    try {
      blob = JSON.parse(blob);
    } catch {
      return null;
    }
  }

  const vendedores = Object.values(blob || {});
  const emailLc = (email || '').toLowerCase().trim();
  const nomeLc = (nome || '').toLowerCase().trim();

  const item =
    vendedores.find(v => (v.email || '').toLowerCase().trim() === emailLc) ||
    vendedores.find(v => (v.nome || '').toLowerCase().trim() === nomeLc);

  const vendedorKey = extrairVendedorKey({ nome, email, vendedoresJson: blob });
  const classificacao = item?.['Classificação'] ?? item?.Classificacao ?? null;

  return {
    classificacao,
    vendedorKey
  };
}

// --- monta o contexto de avaliação das regras a partir dos dados atuais
function buildCtx({ venda, cliente, classificacao, clienteAtivo = true }) {
  const norm = (v) =>
    (v || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Sinais de transfer├¬ncia
const alt = norm(cliente?.["Alterar Titularidade"]);
const antNome = cliente?.["Titular Anterior Nome"];
const antDoc  = cliente?.["Titular Anterior Documento"];
const antObs  = (cliente?.["Titular Anterior Obs"] || "").toString();
const ehTransfer =
  alt === "sim" || !!antNome || !!antDoc ||
  /transfer|titularidade/i.test(norm(antObs));

  // Pagou taxa -> semTaxa
  const pagouTaxa = norm(cliente?.["Pagou Taxa"]) === "sim" || cliente?.PagouTaxa === true;
  const semTaxa   = (norm(cliente?.["Sem Taxa"]) === "sim") || (cliente?.SemTaxa === true) || (!pagouTaxa);

  const bloqueado = (cliente?.Bloqueado === true) ||
    norm(cliente?.Bloqueado) === "sim" ||
    norm(cliente?.status) === "bloqueado" ||
    norm(cliente?.["Status Cliente"]) === "bloqueado";

  const ativado   = norm(cliente?.Ativado) === "sim" || cliente?.Ativado === true;
  const clienteAtivoFinal = !!(ativado && !bloqueado);

let motivo = (cliente?.motivo || cliente?.["Motivo"] || "").toString();
if (!motivo && ehTransfer) motivo = "transferencia"; // <- padroniza

  const base = guessValor(venda);

  return {
    semTaxa,
    bloqueado,
    clienteAtivo: clienteAtivoFinal,
    motivo,                              // ­ƒæê agora ÔÇ£transferenciaÔÇØ quando for o caso
    classificacao: (classificacao || "").toLowerCase(),
    valorVenda: base,
    base,
  };
}




// --- avalia o "when" da regra contra o contexto
function evalWhen(when = {}, ctx = {}) {
  const like = (a, b) =>
    (a || "").toString().toLowerCase().includes((b || "").toString().toLowerCase());

  for (const [field, cond] of Object.entries(when)) {
    const val = ctx[field];

    if (Array.isArray(cond)) {
      // "=" múltiplos
      if (!cond.includes(val)) return false;
      continue;
    }

    if (cond && typeof cond === "object") {
      if ("ne" in cond && val === cond.ne) return false;
      if ("nin" in cond && Array.isArray(cond.nin) && cond.nin.includes(val)) return false;
      if ("like" in cond && !like(val, cond.like)) return false;
      continue;
    }

    // "=" simples
    if (val !== cond) return false;
  }
  return true;
}

// --- motor de cálculo baseado nas regras
function calcularComissaoPorRegras(regras = [], ctx) {
  // ordena por PRIORIDADE (menor primeiro) e ignora inativas
  const ordered = (regras || [])
    .filter((r) => r?.ATIVO !== false)
    .sort((a, b) => (a?.PRIORIDADE ?? 999) - (b?.PRIORIDADE ?? 999));

  let base = Number(ctx.base || 0);
  let total = 0;

  for (const r of ordered) {
    const rule = typeof r?.REGRA === "string" ? JSON.parse(r.REGRA || "{}") : (r?.REGRA || {});
    if (!evalWhen(rule.when, ctx)) continue;

    const calc = rule.calc || {};
    switch (calc.type) {
      case "fixo": { 
       const vCent = 
         calc.base === "classificacao" 
           ? Number(ctx.valorClassificacaoCentavos || 0) 
           : Number(calc.valorCentavos || 0); 
       total += vCent / 100; 
       break; 
     }
      case "percentual": {
        const p = Number(calc.percentual || 0) / 100;
        total += base * p;
        break;
      }
      case "ajuste": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base += v; // ajusta a base para próximas regras
        break;
      }
      case "minimo": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base = Math.max(base, v);
        break;
      }
      case "maximo": {
        const v = Number(calc.valorCentavos || 0) / 100;
        base = Math.min(base, v);
        break;
      }
      default:
        // ignora tipos desconhecidos
        break;
    }

    if (rule.stop) break; // respeita o stop do seu editor
  }

  // por padrão retorno a soma dos fixos/percentuais; se quiser “base final”, use base
  return Number((total).toFixed(2));
}

// ADD: se este import não existir no arquivo, adicione no topo:
// import { useTheme } from "../state/ThemeContext"; // (se preferir, passamos por props; ver uso abaixo)

function PageHeader({
  title = "Vendas Dashboard 2.0",
  role = "Vendedor",
  userName = "",
  onToggleTheme,
  onSignOut,
  theme = "dark",
}) {
  return (
    // mobile-only
    <header className="sm:hidden px-4 pb-2">
      <div className="flex items-center justify-between gap-3">
        {/* bloco de textos */}
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-text/80 dark:text-dark-text/80 leading-none">
            {title}
          </div>
          <h1 className="text-base font-semibold text-text dark:text-dark-text leading-tight mt-1 truncate">
            <span className="font-semibold">{role}</span>
            <span className="mx-1">·</span>
            <span className="font-normal no-underline decoration-0 truncate align-middle whitespace-nowrap">
              {userName || "—"}
            </span>
          </h1>
        </div>

        {/* ações (só mobile) */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={onToggleTheme}
            type="button"
            className="px-3 py-1.5 rounded-xl border border-border dark:border-dark-border bg-card dark:bg-dark-card text-text dark:text-dark-text"
            title="Alternar tema"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            onClick={onSignOut}
            type="button"
            className="px-3 py-1.5 rounded-xl border border-border dark:border-dark-border bg-card dark:bg-dark-card text-text dark:text-dark-text"
            title="Sair"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}







export default function VendedorDashboard() {
  const { user } = useAuth();

  const { signOut } = useAuth();              // para sair
  const { theme, toggleTheme } = useTheme();  // para alternar tema




  const [filtros, setFiltros] = useState({ dateFrom: startOfMonth(), dateTo: today() });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [classificacao, setClassificacao] = useState(null);
  const [pctComissao, setPctComissao] = useState(0);
  const [comissaoTotal, setComissaoTotal] = useState(0);
  const [mapaClientes, setMapaClientes] = useState({});
  const [vendedorKey, setVendedorKey] = useState(null);
  const [isHeatmapOpen, setIsHeatmapOpen] = useState(false);
  const [registros, setRegistros] = useState([]);
  const [registrosRaw, setRegistrosRaw] = useState([]); // TODOS os registros (sem filtro)
  const [tabelaPct, setTabelaPct] = useState(null); // <- NOVO
  const [openCfg, setOpenCfg] = useState(false);

  const isMobile = useIsMobile();              // <= 768px
  const desktopOnly = !isMobile;               // atalho

  const urlInfo = useMemo(() => ({ base: 'https://max.api.email.nexusnerds.com.br', path: null }), []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState(null);
  const openModal = (venda) => { setVendaSelecionada(venda); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setVendaSelecionada(null); };


  const [isFichasOpen, setIsFichasOpen] = useState(false);
  const [isChartOpen, setIsChartOpen] = useState(false);

  const [fichasCPF, setFichasCPF] = useState(null);
  const [fichasNome, setFichasNome] = useState('');
  const [fichasLista, setFichasLista] = useState([]);
  const [regras, setRegras] = useState([]);
  

  const navigate = useNavigate();

  async function handleSignOutMobile() {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
}

  useEffect(() => {
    welcomeLog({
      role: "Vendedor",
      name: user?.nome || user?.name || "",
      email: user?.email || "",
    });
  }, [user]);

// gates de abertura (só abrem no desktop)
  const openHeatmap = useCallback(() => {
    if (!isMobile) setIsHeatmapOpen(true);
  }, [isMobile]);

  const openChart = useCallback(() => {
    if (!isMobile) setIsChartOpen(true);
  }, [isMobile]);


  const vendasParaGrafico = useMemo(() => {
  return (registros || []).map(r => ({
    data: r.dataHora,
    valor: guessValor(r),
    vendedor: user?.name || ''
  }));
}, [registros, user?.name]);

  // open/close
  const openFichas = (cpf, nome, lista) => {
    setFichasCPF(cpf);
    setFichasNome(nome);
    setFichasLista(lista);
    setIsFichasOpen(true);
  };
  const closeFichas = () => {
    setIsFichasOpen(false);
    setFichasCPF(null);
    setFichasNome('');
    setFichasLista([]);
  };


const vendasDoMesAtual = useMemo(() => {
  const inicio = dayjs().startOf('month').valueOf();
  const fim    = dayjs().endOf('month').valueOf();
  return registros.filter((r) => {
    const ts = dateMs(r);
    return Number.isFinite(ts) && ts >= inicio && ts <= fim;
  });
}, [registros]);


// Agrupa todas as vendas por CPF, escolhe a mais recente para exibir (com dedup rigorosa como no admin)
const { linhasTabela, fichasPorCPF } = useMemo(() => {
  const mapa = new Map(); // cpf -> { principal, lista[] }
  for (const r of registros) { // Use 'registros' filtrados por data
    const cpf = guessCPF(r);
    const atual = mapa.get(cpf);
    const ts = dateMs(r); // Use dateMs para timestamp preciso
    if (!atual) {
      mapa.set(cpf, { 
        principal: r, 
        lista: [r] 
      });
      //console.log(`[DEBUG VEND] Mantendo venda única para CPF ${cpf} (data: ${ts})`);
    } else {
      atual.lista.push(r);
      const tsPrincipal = dateMs(atual.principal);
      if (Number.isFinite(ts) && (ts > tsPrincipal || !Number.isFinite(tsPrincipal))) {
        atual.principal = r;
        //console.log(`[DEBUG VEND] Atualizando principal para CPF ${cpf} (nova data: ${ts} > ${tsPrincipal})`);
      } else {
        //console.log(`[DEBUG VEND] Excluindo duplicata para CPF ${cpf} (data: ${ts} <= ${tsPrincipal})`);
      }
    }
  }

  // Gera array ordenado pela data do principal (desc)
  const linhas = Array.from(mapa.values())
    .map(v => v.principal)
    .sort((a, b) => dateMs(b) - dateMs(a)); // Ordena por data descendente

  // cpf -> lista (todas as fichas)
  const lookup = {};
  for (const [cpf, v] of mapa.entries()) lookup[cpf] = v.lista;

  //console.log(`[DEBUG VEND] Total linhasTabela: ${linhas.length} (deveria ser 8 para Isaque)`);
  return { linhasTabela: linhas, fichasPorCPF: lookup };
}, [registros]);




useEffect(() => {
  const calcular = () => {
    // ⚠️ Só calcula quando a TABELA de comissão existir e tivermos as linhas deduplicadas.
    // 'regras' pode ser [] (engine lida com isso e cai no fallback por cliente).
    if (!tabelaPct || !Array.isArray(linhasTabela)) {
      //console.log("[DEBUG VEND] Aguardando insumos (não zerando):", {
        //tabelaPctLoaded: !!tabelaPct,
        //linhasOk: Array.isArray(linhasTabela),
      //});
      return; // ❌ não zera durante o carregamento
    }

    const total = calcularComissaoTotal(
      linhasTabela,
      mapaClientes || {},
      classificacao,
      tabelaPct,
      Array.isArray(regras) ? regras : []   // garante array
    );

    /*console.log(
      `[DEBUG VEND] Comissão total calculada: R$ ${total.toFixed(2)} (vendas deduplicadas: ${linhasTabela.length})`,
      linhasTabela.map(r => ({
        cpf: guessCPF(r),
        data: r.dataHora,
        comissao: calcularComissaoPorRegras(
          Array.isArray(regras) ? regras : [],
          (() => {
            const cpf = guessCPF(r);
            const ctx = buildCtx({ venda: r, cliente: (mapaClientes || {})[cpf] || {}, classificacao });
            ctx.valorClassificacaoCentavos = getValorClassificacaoCentavos(tabelaPct, classificacao);
            return ctx;
          })()
        )
      }))
    );*/

    setComissaoTotal(total);
  };
  calcular();
}, [linhasTabela, mapaClientes, classificacao, tabelaPct, regras]);


function calcularComissaoTotal(vendas, mapa, classificacao, tabela, regras) {
  if (!Array.isArray(vendas) || !tabela) {
    console.warn("[DEBUG VEND] Entrada inválida em calcularComissaoTotal", { vendasOk: Array.isArray(vendas), tabelaOk: !!tabela });
    return 0;
  }

  const listaRegras = Array.isArray(regras) ? regras : [];
  let total = 0;

  for (const r of vendas) {
    const cpf = guessCPF(r);
    const cliente = (mapa && mapa[cpf]) ? mapa[cpf] : {};
    const transferencia = isTransferencia(cliente);

    // Monta ctx com valorClassificacaoCentavos explícito
    const ctx = buildCtx({ venda: r, cliente, classificacao });
    ctx.valorClassificacaoCentavos = getValorClassificacaoCentavos(tabela, classificacao) || 0;

    let valor = 0;
    if (listaRegras.length > 0) {
      // ✅ Usa engine de regras (NocoDB)
      valor = calcularComissaoPorRegras(listaRegras, ctx);
    } else {
      // ✅ Fallback antigo (considera transferência = zero)
      valor = transferencia
        ? 0
        : calcularComissaoCliente({ cpf, cliente, classificacao, tabela });
    }

    /*console.log(`[DEBUG VEND] Venda CPF ${cpf}, Comissão: ${valor}, Subtotal: ${total + valor}`, {
      data: r.dataHora,
      transferencia,
      ctx,
      valorClassificacaoCentavos: ctx.valorClassificacaoCentavos,
    });*/

    total += (Number.isFinite(valor) ? valor : 0);
  }

  return Number(total.toFixed(2));
}



function getValorClassificacaoCentavos(tabela, classificacao) {
  const keyLc = (classificacao || "").toLowerCase();

  // 1) se vier de um "map" já normalizado
  let v = tabela?.map?.[keyLc];
  if (v != null) {
    // se o service tiver guardado em REAIS (25), converte; se já for 2500, mantém
    return v >= 100 ? Math.round(Number(v)) : Math.round(Number(v) * 100);
  }

  // 2) fallback para estrutura "comissoes": { Ouro: { valor: "R$ 25,00" } }
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const entry =
    tabela?.comissoes?.[classificacao] ??
    tabela?.comissoes?.[cap(keyLc)] ??
    tabela?.comissoes?.[keyLc];

  const raw = entry?.valor ?? entry; // pode ser "R$ 25,00" ou 25
  if (typeof raw === "string") {
    // usa seu helper existente para pegar em REAIS e converte para centavos
    const reais = moneyToNumber(raw);      // -> 25
    return Math.round(reais * 100);        // -> 2500
  }
  if (typeof raw === "number") {
    return raw >= 100 ? Math.round(raw) : Math.round(raw * 100);
  }
  return 0;
}




  const fetchData = async () => {
    try {
      setLoading(true);
      setErro(null);

      const lst = await listarVendedores();
      const item = lst.find((x) => (x.vendedor || '').toLowerCase() === (user?.name || '').toLowerCase());
      if (!item) throw new Error('Vendedor não encontrado no catálogo público.');
      const url = `${urlInfo.base}${item.url}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao carregar as vendas do vendedor.');
      const data = await res.json();
      setRegistrosRaw(data);

      const df = dayjs(filtros.dateFrom, 'YYYY-MM-DD').startOf('day').valueOf();
      const dt = dayjs(filtros.dateTo,   'YYYY-MM-DD').endOf('day').valueOf();

      let invalid = 0, outOfRange = 0;
      const filtered = data.filter((r) => {
        const ts = dateMs(r);
        if (!Number.isFinite(ts) || ts === 0) { invalid++; return false; }
        if (ts < df || ts > dt) { outOfRange++; return false; }
        return true;
      });
      //console.log("[DEBUG VEND][Filtro] total:", data.length, "| ok:", filtered.length, "| invalid:", invalid, "| foraPeriodo:", outOfRange);




      setRegistros(filtered);

    const meta = await fetchClassificacaoDoVendedor({ email: user?.email, nome: user?.name });
    setClassificacao(meta?.classificacao || null);
    setVendedorKey(meta?.vendedorKey || null);

    const percentuais = await carregarTabelaComissao(); // mantém, pq você usa a tabela p/ outras coisas 
    const regrasDb = await listRegrasComissao();        // 👈 pega as regras da tela de Config 
    setRegras(regrasDb);     

    // mantém o que você já faz:
    const taxa = Number(percentuais?.map?.[(meta?.classificacao || '').toLowerCase()] ?? 0);
    setPctComissao(taxa);
    setTabelaPct(percentuais);

    const mapa = await carregarMapaClientesDoVendedor(user?.name || '');
    setMapaClientes(mapa);

    // 🔁 calcula após mapa carregado
    //calcularComissaoTotal(filtered, mapa, meta?.classificacao || null, percentuais);


    } catch (e) {
      setErro(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };


  function isTransferencia(cliente) {
  const norm = (v) => (v || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const alter = norm(cliente?.['Alterar Titularidade']);
  // considera SIM ou qualquer dado preenchido de titular anterior
  return alter === 'sim'
    || !!cliente?.['Titular Anterior Nome']
    || !!cliente?.['Titular Anterior Documento']
    || !!cliente?.['Titular Anterior Obs'];
}


  useEffect(() => {
    fetchData();
  }, [user, filtros.dateFrom, filtros.dateTo, urlInfo]);

  const totais = useMemo(() => ({
  vendas: linhasTabela.length,           // << em vez de registros.length
  receita: comissaoTotal
}), [linhasTabela.length, comissaoTotal]);



  function handleExport() {
    if (!registros.length) return;
    downloadCSV(
      `vendedor_${user?.name}_${filtros.dateFrom}_a_${filtros.dateTo}.csv`,
      registros
    );
  }

    return (
    <div className="space-y-6">
        <PageHeader
            role="Vendedor"
            userName={user?.name}
            theme={theme}
            onToggleTheme={toggleTheme}
            onSignOut={handleSignOutMobile}
          />




          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-end">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-text dark:text-dark-text">De</label>
              <input
                type="date"
                value={filtros.dateFrom}
                onChange={(e) => setFiltros((s) => ({ ...s, dateFrom: e.target.value }))}
                className="w-full bg-card dark:bg-dark-card border border-border dark:border-dark-border rounded-xl px-3 py-2 text-text dark:text-dark-text"
              />
            </div>

            <div className="flex-1 min-w-[160px]">
              <label className="text-xs text-text dark:text-dark-text">Até</label>
              <input
                type="date"
                value={filtros.dateTo}
                onChange={(e) => setFiltros((s) => ({ ...s, dateTo: e.target.value }))}
                className="w-full bg-card dark:bg-dark-card border border-border dark:border-dark-border rounded-xl px-3 py-2 text-text dark:text-dark-text"
              />
            </div>

            <div className="flex gap-3 sm:ml-auto">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 bg-background dark:bg-dark-card text-text dark:text-dark-text rounded-xl px-4 py-2 font-medium hover:opacity-90"
                title="Exportar CSV"
              >
                Exportar CSV
              </button>

              {/* Desktop-only: Mapa de Calor */}
              {desktopOnly && (
                <button
                  onClick={openHeatmap}
                  className="inline-flex items-center gap-2 bg-card dark:bg-dark-card border border-border dark:border-dark-border text-text dark:text-dark-text rounded-xl px-4 py-2 hover:opacity-90"
                  title="Abrir mapa de calor"
                >
                  <MapPinned className="w-4 h-4" />
                  <span className="hidden sm:inline">Mapa de calor</span>
                </button>
              )}

              {/* Desktop-only: Gráfico/Análise */}
              {desktopOnly && (
                <button
                  onClick={openChart}
                  className="inline-flex items-center gap-2 bg-card dark:bg-dark-card border border-border dark:border-dark-border text-text dark:text-dark-text rounded-xl px-4 py-2 hover:opacity-90"
                  title="Abrir análise de desempenho"
                >
                  <LineChartIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Gráfico dinâmico</span>
                </button>
              )}

              {/* Sempre disponível */}
              <button
                onClick={() => setOpenCfg(true)}
                className="inline-flex items-center gap-2 bg-card dark:bg-dark-card border border-border dark:border-dark-border text-text dark:text-dark-text rounded-xl px-4 py-2 hover:opacity-90"
                title="Configurações do vendedor"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Configurações</span>
              </button>
            </div>
          </div>


          <VendedorXPBar
              key={vendasDoMesAtual.map(v => v.protocolo).join('-') + '_' + Object.entries(mapaClientes).map(([cpf, c]) => cpf + '-' + (c?.Autorizado || '')).join('|')}
              vendedorKey={vendedorKey}
              vendedorNome={user.name}
              registros={vendasDoMesAtual}
              mapaClientes={mapaClientes}
              autoUpdate={true}
        />
        <VendedorConfigModal
          open={openCfg}
          onClose={() => setOpenCfg(false)}
          defaultNome={user?.name || ""}
          vendedorNome={user?.name || ""}   // 🔒 trava no logado
        />
                





      {loading ? (
        <div className="animate-pulse text-text dark:text-dark-text">Carregando…</div>
      ) : erro ? (
        <div className="text-red-400">Erro: {erro}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card label="Minhas Vendas" value={totais.vendas} />
            <Card label="Receita Estimada" value={formatBRL(totais.receita)} />
            <Card label="Classificação" value={classificacao || '—'} />
            <Card label="Comissão no Período" value={formatBRL(comissaoTotal)} />
          </div>

          

          <div className="rounded-2xl border border-border dark:border-dark-border overflow-x-auto sm:overflow-visible">
            <table className="w-full text-sm text-text dark:text-dark-text">
                <thead className="bg-card dark:bg-dark-card">
                  <tr>
                    {/* escondidos no mobile */}
                    <Th>Data/Hora</Th>
                    <Th>Protocolo</Th>

                    {/* visíveis no mobile */}
                    <Th showOnMobile>Nome</Th>

                    {/* escondidos no mobile */}
                    <Th>Plano</Th>
                    <Th>Cidade</Th>
                    <Th>Bairro</Th>

                    {/* visíveis no mobile */}
                    <Th showOnMobile className="text-right">Comissão</Th>
                    <Th showOnMobile className="text-right w-[96px]">Ações</Th>
                  </tr>
                </thead>

                <tbody>
                  {linhasTabela.map((r, i) => {
                    const cpf = guessCPF(r);
                    const cliente = mapaClientes?.[cpf];
                    const fichas = fichasPorCPF[cpf] || [];
                    const qtd = fichas.length;

                    const transferencia = isTransferencia(cliente);

                    const ctx = buildCtx({ venda: r, cliente, classificacao, clienteAtivo: true });
                    ctx.valorClassificacaoCentavos = getValorClassificacaoCentavos(tabelaPct, classificacao);

                    const comissaoLinha = (Array.isArray(regras) && regras.length)
                      ? calcularComissaoPorRegras(regras, ctx)
                      : (transferencia ? 0 : calcularComissaoCliente({ cpf, cliente, classificacao, tabela: tabelaPct }));

                    return (
                      <tr
                        key={i}
                        className="odd:bg-background dark:odd:bg-dark-background even:bg-card dark:even:bg-dark-card"
                      >
                        {/* escondidos no mobile */}
                        <Td>{r.dataHora}</Td>
                        <Td>{r.protocolo}</Td>

                        {/* visível no mobile (NOME + ícones) */}
                        <Td showOnMobile className="max-w-[280px]">
                          <div className="flex items-center gap-2 truncate">
                            {transferencia ? (
                              <ArrowLeftRight
                                className="w-4 h-4 text-indigo-500 shrink-0"
                                title="Alteração de Titularidade"
                                aria-label="Alteração de Titularidade"
                              />
                            ) : (
                              <StatusIcon cliente={cliente} />
                            )}
                            <span className="truncate">{r.nome}</span>

                            {/* botão de fichas (mantido nos dois modos) */}
                            <button
                              onClick={() => openFichas(cpf, r.nome, fichas)}
                              className="ml-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-border dark:border-dark-border hover:bg-card dark:hover:bg-dark-card shrink-0"
                              title={`Ver fichas deste CPF (${qtd})`}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
                                <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
                              </svg>
                              <span>{qtd}</span>
                            </button>
                          </div>
                        </Td>

                        {/* escondidos no mobile */}
                        <Td>{r.plano}</Td>
                        <Td>{r.cidade}</Td>
                        <Td>{r.bairro}</Td>

                        {/* visível no mobile (COMISSÃO) */}
                        <Td showOnMobile className="text-right whitespace-nowrap">
                          {formatBRL(comissaoLinha)}
                        </Td>

                        {/* visível no mobile (AÇÕES) */}
                          <Td showOnMobile className="text-right whitespace-nowrap w-[96px]">
                            <button
                              onClick={() => openModal(r)}
                              className="px-3 py-1.5 rounded-lg border border-border dark:border-dark-border hover:bg-card dark:hover:bg-dark-card text-text dark:text-dark-text"
                              title="Editar status deste CPF"
                            >
                              Editar
                            </button>
                          </Td>

                      </tr>
                    );
                  })}
                </tbody>


            </table>
          </div>


            {/* Dock lateral recolhível da legenda (desktop) */}
            {desktopOnly && (
              <StatusLegendDock
                registros={linhasTabela}
                mapaClientes={mapaClientes}
                initialOpen={false}
              />
            )}



          <EditarStatusClienteModal
            isOpen={isModalOpen}
            onClose={closeModal}
            venda={vendaSelecionada}
            vendedorNome={user?.name || ''}
            onSaved={fetchData}
          />

          <FichasModal
            isOpen={isFichasOpen}
            onClose={closeFichas}
            nome={fichasNome}
            fichas={fichasLista}
            onEditar={(venda) => {
              closeFichas();
              openModal(venda);
            }}
          />

          <HeatmapModal
            isOpen={desktopOnly && isHeatmapOpen}
            onClose={() => setIsHeatmapOpen(false)}
            data={registrosRaw}
            initialVendedor={user?.name || ""}
            initialDateFrom={filtros.dateFrom}
            initialDateTo={filtros.dateTo}
          />

          <ChartModal
            isOpen={desktopOnly && isChartOpen}
            onClose={() => setIsChartOpen(false)}
            title={`Probabilidade: ${user?.name || 'Vendedor'}`}
            maxWidthClass="max-w-[1200px]"
          >
            <VendedorProbabilidadePanel
              titulo={`Probabilidade: ${user?.name || 'Vendedor'}`}
              vendedorNome={user?.name || ''}
              vendedorEmail={user?.email || ''}
              dateFrom={filtros.dateFrom}
              dateTo={filtros.dateTo}
              classificacao={classificacao || "medio"}
              cor="emerald"
            />
          </ChartModal>










        </>
      )}
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="rounded-2xl border border-border dark:border-dark-border p-4 bg-card dark:bg-dark-card">
      <div className="text-text dark:text-dark-text text-xs uppercase">{label}</div>
      <div className="text-2xl font-semibold mt-1 text-text dark:text-dark-text">{value}</div>
    </div>
  );
}

// Helpers de célula com controle de visibilidade no mobile
const Th = ({ children, showOnMobile = false, className = "" }) => (
  <th
    className={[
      "text-left font-medium p-3 text-text dark:text-dark-text align-middle",
      showOnMobile ? "table-cell" : "hidden sm:table-cell",
      className,
    ].join(" ")}
  >
    {children}
  </th>
);

const Td = ({ children, showOnMobile = false, className = "" }) => (
  <td
    className={[
      "p-3 text-text dark:text-dark-text align-middle",
      showOnMobile ? "table-cell" : "hidden sm:table-cell",
      className,
    ].join(" ")}
  >
    {children}
  </td>
);

