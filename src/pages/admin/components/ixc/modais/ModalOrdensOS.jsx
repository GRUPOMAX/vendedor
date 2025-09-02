import React, { useEffect, useState, useMemo, useCallback } from "react";
import { X as XIcon } from "lucide-react";
import { fetchOrdensByTicketId, fetchOrdensStatusCatalog, fetchAssuntoById } from "@/services/ixcOrdens";
import { fetchFuncionarioNomeById } from "@/services/ixcFuncionarios";

const STATUS_TONE = {
  A: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  AN:"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  EN:"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  AS:"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  AG:"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  DS:"bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  EX:"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  F: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  RAG:"bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function Chip({ code, label }) {
  const tone = STATUS_TONE[code] || "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300";
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 px-2 rounded-full text-[11px] ${tone}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor:"currentColor", opacity:.85 }} />
      {label || code}
    </span>
  );
}

function Line({ k, v }) {
  if (!v && v !== 0) return null;
  return (
    <div className="text-xs text-zinc-600 dark:text-zinc-300">
      <span className="opacity-70">{k}:</span> <span className="font-medium break-all">{v}</span>
    </div>
  );
}

export default function ModalOrdensOS({ open, onClose, ticketId, ticketTitulo }) {
  const [loading, setLoading] = useState(false);
  const [ordens, setOrdens] = useState([]);
  const [cat, setCat] = useState({});
  const [detalhe, setDetalhe] = useState(null); // guarda a OS selecionada
  const [assuntoMap, setAssuntoMap] = useState({}); // { [id_assunto]: "Nome do assunto" }
  const [techMap, setTechMap] = useState({}); // { [id]: "PrimeiroNome" }



  // carregar nome do técnico
  const ensureTechName = useCallback(async (id) => {
    const key = String(id || "").trim();
      if (!key || techMap[key]) return;
      const data = await fetchFuncionarioNomeById(key);
      setTechMap((m) => ({ ...m, [key]: data?.primeiroNome || key }));
    }, [techMap]);

          // carregar nome do assunto
    const ensureAssuntoName = useCallback(async (id) => {
        const key = String(id || "").trim();
        if (!key || key === "0" || assuntoMap[key]) return;
            try {
                const res = await fetchAssuntoById(key);
                setAssuntoMap((m) => ({ ...m, [key]: res?.assunto || `#${key}` }));
            } catch {
        setAssuntoMap((m) => ({ ...m, [key]: `#${key}` }));
        }
    }, [assuntoMap]);

    // quando carregar/atualizar a lista de ordens:
        useEffect(() => {
        const ids = Array.from(new Set((ordens || [])
            .map(o => String(o?.id_tecnico || "").trim())
            .filter(Boolean)));
        ids.forEach((id) => { void ensureTechName(id); });

        const assuntoIds = Array.from(new Set((ordens || [])
        .map(o => String(o?.id_assunto || "").trim())
        .filter(Boolean)));
        assuntoIds.forEach((id) => { void ensureAssuntoName(id); });
            }, [ordens, ensureTechName, ensureAssuntoName]);







  useEffect(() => {
    if (!open || !ticketId) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [catalog, items] = await Promise.all([
          fetchOrdensStatusCatalog(),
          fetchOrdensByTicketId(ticketId),
        ]);
        if (!alive) return;
        setCat(catalog || {});
        setOrdens(items || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, ticketId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl rounded-2xl border bg-white border-zinc-200 shadow-2xl dark:bg-zinc-900 dark:border-zinc-700">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
          <div className="font-semibold">
            Ordens de Serviço • <span className="opacity-80">{ticketTitulo || ticketId}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Fechar">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-4 max-h-[70vh] overflow-auto">
          {loading && <div className="text-sm opacity-70">Carregando…</div>}
          {!loading && ordens.length === 0 && (
            <div className="text-sm opacity-70">Nenhuma OS encontrada para este atendimento.</div>
          )}

          <div className="space-y-3">
            {ordens.map((os) => {
              const code = os?.status;
              const label = cat?.[code] || code || "—";
              const proto = os?.protocolo;
              const quando = os?.ultima_atualizacao || os?.data_fechamento || os?.data_inicio || os?.data_abertura;
              const endereco = os?.endereco?.texto || os?._raw?.endereco || "";
              return (
                <div key={os.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-950/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        Protocolo {proto || os.id} • <span className="opacity-70">{label}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span>ID: <b className="tabular-nums">{os.id}</b></span>
                        {quando && <span>Atualizado: {new Date(quando).toLocaleString("pt-BR")}</span>}
                        {os?.id_tecnico && (
                            <span>
                                Técnico:{" "}
                                <b>{techMap[String(os.id_tecnico)] ?? String(os.id_tecnico)}</b>
                            </span>
                            )}
                        {os?.valor_total_comissao && <span>Comissão: R$ {Number(os.valor_total_comissao).toFixed(2)}</span>}
                      </div>
                    </div>
                     <div className="flex items-center gap-2">
                        {os?.id_assunto && (
                            <span className="inline-flex h-6 items-center px-2 rounded-full text-[11px]
                                            border bg-zinc-50 border-zinc-200
                                            dark:bg-zinc-800/30 dark:border-zinc-700">
                            {assuntoMap[String(os.id_assunto)] ?? `#${os.id_assunto}`}
                            </span>
                        )}
                        <Chip code={code} label={label} />
                        </div>

                  </div>

                  {endereco && <div className="mt-2 text-xs opacity-80">📍 {endereco}</div>}

                  {/* Resumo mensagens */}
                  {(os?.mensagem || os?.mensagem_resposta) && (
                    <div className="mt-2 grid sm:grid-cols-2 gap-2">
                      {os?.mensagem && (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                          <div className="text-[11px] opacity-60 mb-1">Mensagem</div>
                          <div className="text-sm whitespace-pre-wrap">{os.mensagem}</div>
                        </div>
                      )}
                      {os?.mensagem_resposta && (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2">
                          <div className="text-[11px] opacity-60 mb-1">Resposta</div>
                          <div className="text-sm whitespace-pre-wrap">{os.mensagem_resposta}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => setDetalhe(os)}
                      className="px-3 py-1.5 rounded-xl border text-sm bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      title="Ver detalhes completos"
                    >
                      Detalhes
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl border text-sm bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900">
            Fechar
          </button>
        </div>
      </div>

      {/* Modal de Detalhes da OS */}
      {detalhe && (
        <div className="fixed inset-0 z-[1700] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-2xl border bg-white border-zinc-200 shadow-2xl dark:bg-zinc-900 dark:border-zinc-700">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <div className="font-semibold">
                Detalhes da OS • <span className="opacity-80">Protocolo {detalhe.protocolo || detalhe.id}</span>
              </div>
              <button onClick={() => setDetalhe(null)} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Fechar">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[70vh] overflow-auto space-y-2">
            <div className="flex items-center gap-2">
            <Chip code={detalhe.status} label={cat?.[detalhe.status] || detalhe.status} />
                {detalhe?.id_assunto && (
                <span className="inline-flex h-6 items-center px-2 rounded-full text-[11px]
                                border bg-zinc-50 border-zinc-200
                                dark:bg-zinc-800/30 dark:border-zinc-700">
                    {assuntoMap[String(detalhe.id_assunto)] ?? `#${detalhe.id_assunto}`}
                </span>
                )}
            </div>
            <Line k="Assunto" v={assuntoMap[String(detalhe.id_assunto)] ?? detalhe.id_assunto} />


              <Line k="ID" v={detalhe.id} />
              <Line k="Ticket" v={detalhe.id_ticket} />
              <Line k="Cliente" v={detalhe.id_cliente} />
              <Line k="Contrato" v={detalhe.id_contrato_kit} />
              <Line k="Técnico" v={techMap[String(detalhe.id_tecnico)] ?? detalhe.id_tecnico} />
              <Line k="Login" v={detalhe.id_login} />
              <Line k="Abertura" v={detalhe.data_abertura} />
              <Line k="Início" v={detalhe.data_inicio} />
              <Line k="Final" v={detalhe.data_final} />
              <Line k="Fechamento" v={detalhe.data_fechamento} />
              <Line k="Agenda" v={detalhe.data_agenda} />
              <Line k="Agenda final" v={detalhe.data_agenda_final} />
              <Line k="Última atualização" v={detalhe.ultima_atualizacao} />
              <Line k="Endereço" v={detalhe?.endereco?.texto || detalhe?._raw?.endereco} />
              <Line k="Mensagem" v={detalhe.mensagem} />
              <Line k="Resposta" v={detalhe.mensagem_resposta} />
              <Line k="Comissão total" v={detalhe.valor_total_comissao ? `R$ ${Number(detalhe.valor_total_comissao).toFixed(2)}` : ""} />
            </div>

            <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end">
              <button onClick={() => setDetalhe(null)} className="px-3 py-1.5 rounded-xl border text-sm bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
