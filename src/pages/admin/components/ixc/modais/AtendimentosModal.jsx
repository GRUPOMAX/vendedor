import React, { useEffect, useState, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { fetchStatusCatalog, fetchAtendimentosByClienteId } from "@/services/ixcAtendimentos";
import ModalOrdensOS from "./ModalOrdensOS";
import { fetchOrdensByTicketId, fetchOrdensStatusCatalog } from "@/services/ixcOrdens";
import { fetchFuncionarioNomeById } from "@/services/ixcFuncionarios";

const TONE = {
  N:  "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  P:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  EP: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  S:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  C:  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};




const stripAccents = (s="") =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

const isInstalacao = (a={}) => {
  const t = stripAccents(a?.titulo || a?.assunto || "");
  // se vier id_assunto no atendimento e você souber o código de instalação,
  // dá pra incluir aqui também (ex.: a?.id_assunto === "1")
  return t.includes("instal"); // pega instalação, instalar, etc.
};

// perto do topo do arquivo
const LABEL_SO_INSTALACAO = "S\u00F3 Instala\u00E7\u00E3o"; // "Só Instalação"
const LABEL_MOSTRAR_TODOS = "Mostrar todos";

// helpers
const pick = (o, ...ks) => ks.reduce((v, k) => (v != null ? v : o?.[k]), undefined);
const getIdTicket = (a) => pick(a, "id_ticket", "ticketId", "id");

function StatusChip({ code, label }) {
  const tone = TONE[code] || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300";
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 px-2 rounded-full text-[11px] ${tone}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "currentColor", opacity: .85 }} />
      {label || code}
    </span>
  );
}

/** Card de cada atendimento — pode carregar o resumo de OS do ticket */
function AtendCard({ a, catalog, getResumoOS, onVerOrdens }) {
  const code        = a?.su_status;
  const label       = catalog?.[code] || code || "—";
  const titulo      = a?.titulo || a?.assunto || "Sem título";
  const proto       = a?.protocolo || a?.id || "";
  const quando      = a?.ultima_atualizacao || a?.criado_em || a?.data || "";
  const responsavel = a?.responsavel || a?.tecnico || "";
  const ticketId    = getIdTicket(a);

  // pede pra preparar o resumo das OS deste ticket
  useEffect(() => {
    if (ticketId) getResumoOS(ticketId);
  }, [ticketId, getResumoOS]);

  const osResumo = getResumoOS(ticketId); // pode devolver cache já carregado

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-950/40">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{titulo}</div>
          <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
            {proto && <span>Protocolo: <b className="tabular-nums">{proto}</b></span>}
            {quando && <span>Atualizado: {new Date(quando).toLocaleString("pt-BR")}</span>}
            {responsavel && <span>Resp.: {responsavel}</span>}
          </div>
        </div>
        <StatusChip code={code} label={label} />
      </div>

      {/* labels / tags, se vierem */}
      {Array.isArray(a?.labels) && a.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {a.labels.map((l, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full border bg-zinc-50 border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700">
              {l?.name || l}
            </span>
          ))}
        </div>
      )}

      {/* descrição se existir */}
      {a?.descricao && (
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
          {String(a.descricao).slice(0, 600)}
          {String(a.descricao).length > 600 ? "…" : ""}
        </p>
      )}

      {/* resumo das OS + botão */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="opacity-70">Ordens:</span>
        <b>{osResumo?.count ?? 0}</b>
        {osResumo?.lastLabel && (
          <span className="opacity-70">• Último status: <b>{osResumo.lastLabel}</b></span>
        )}
        <button
          onClick={() => onVerOrdens({ ticketId, titulo })}
          className="ml-auto px-2 py-1 rounded-lg border text-xs bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900"
          disabled={!ticketId}
          title="Ver ordens deste atendimento"
        >
          Ver ordens
        </button>
      </div>
    </div>
  );
}

export default function AtendimentosModal({ open, onClose, clienteId, clienteNome }) {
  const [loading, setLoading] = useState(false);
  const [itens, setItens] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [ordensCache, setOrdensCache] = useState({}); // { [ticketId]: { items, lastLabel, count } }
  const [openOS, setOpenOS] = useState({ open: false, ticketId: null, titulo: null });
  const [onlyInstalacao, setOnlyInstalacao] = useState(true); // abre filtrado



  // carrega atendimentos
  useEffect(() => {
    if (!open || !clienteId) return;
    let alive = true;
    (async () => {
      try {itensMostrados 
        setLoading(true);
        const [cat, list] = await Promise.all([
          fetchStatusCatalog(),
          fetchAtendimentosByClienteId(clienteId),
        ]);
        if (!alive) return;
        setCatalog(cat || {});
        setItens(list || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, clienteId]);

  const itensMostrados = React.useMemo(() => {
    if (!Array.isArray(itens)) return [];
    return onlyInstalacao ? itens.filter(isInstalacao) : itens;
  }, [itens, onlyInstalacao]);

  // função memoizada para obter/preparar resumo de OS (e também devolver do cache)
  const getResumoOS = useCallback((ticketId) => {
    if (!ticketId) return null;

    // se já temos no cache, apenas devolve o objeto
    const cached = ordensCache[ticketId];
    if (cached) return { count: cached.items?.length ?? 0, lastLabel: cached.lastLabel };

    // dispara carregamento async (fire-and-forget)
    (async () => {
      try {
        const [cat, items] = await Promise.all([
          fetchOrdensStatusCatalog(),
          fetchOrdensByTicketId(ticketId, { rp: 10, labels: 0 }),
        ]);
        const sorted = [...(items || [])].sort(
          (a, b) =>
            new Date(b.ultima_atualizacao || b.data_fechamento || b.data_inicio || b.data_abertura || 0) -
            new Date(a.ultima_atualizacao || a.data_fechamento || a.data_inicio || a.data_abertura || 0)
        );
        const last = sorted[0];
        setOrdensCache((m) => ({
          ...m,
          [ticketId]: {
            items: items || [],
            lastLabel: last ? (cat?.[last.status] || last.status || "—") : null,
          },
        }));
      } catch {
        // silencioso
      }
    })();

    // enquanto carrega, retorna nulo (ou um esqueleto)
    return null;
  }, [ordensCache]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-white border-zinc-200 shadow-2xl dark:bg-zinc-900 dark:border-zinc-700">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <div className="font-semibold">
            Atendimentos • <span className="opacity-80">{clienteNome || clienteId}</span>
          </div>
         <div className="flex items-center gap-2">

            <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Fechar">
              <XIcon className="w-5 h-5" />
            </button>
         </div>

          
        </div>

        <div className="p-4 max-h-[70vh] overflow-auto">
          {loading && <div className="text-sm opacity-70">Carregando…</div>}
          {!loading && itensMostrados.length === 0 && (
           <div className="text-sm opacity-70">
             {onlyInstalacao ? "Nenhum atendimento de instala├º├úo encontrado." : "Nenhum atendimento encontrado."}
           </div>
           )}


          <div className="space-y-3">
            {itensMostrados.map((a) => (
              <AtendCard
                key={`${a?.protocolo || a?.id || Math.random()}`}
                a={a}
                catalog={catalog}
                getResumoOS={getResumoOS}
                onVerOrdens={({ ticketId, titulo }) => setOpenOS({ open: true, ticketId, titulo })}
              />
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-700 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl border text-sm bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900">
            Fechar
          </button>
        </div>
      </div>

      {/* Modal com as ordens do ticket */}
      <ModalOrdensOS
        open={openOS.open}
        onClose={() => setOpenOS({ open: false, ticketId: null, titulo: null })}
        ticketId={openOS.ticketId}
        ticketTitulo={openOS.titulo}
      />
    </div>
  );
}
