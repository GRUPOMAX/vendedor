import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, CheckCircle2, Clipboard, RefreshCw, X } from "lucide-react";


/**
 * SemTaxaIXCHelp
 *
 * Componente de ajuda passo a passo: "Como preparar o IXC para o cliente ficar SEM TAXA (Ação Central)".
 * - Lista numerada com checkboxes (persistidas em localStorage)
 * - Link rápido para o IXC + botão de copiar URL
 * - Campo para observações internas (persistidas no navegador)
 * - Suporta imagens por passo via props (opcional)
 *
 * Props opcionais:
 *   - className?: string
 *   - images?: Record<string, { src: string; alt?: string }[]> // ex.: images["passo-4"] = [{src:"/img/p4.png"}]
 *   - onProgressChange?: (pct:number) => void
 */
export default function SemTaxaIXCHelp({ className = "", images = {}, onProgressChange }) {
  const STORAGE_KEY = "wiki_sem_taxa_ixc_v1";
  const OBS_KEY = "wiki_sem_taxa_ixc_obs_v1";

  // definição dos passos (baseado no teu roteiro + prints)
  const steps = useMemo(() => (
    [
      {
        id: "passo-1",
        title: "Acessar o IXC (painel do provedor)",
        details: [
          "Entrar em https://ixc.maxfibraltda.com.br/adm.php",
          "Logar com usuário autorizado a editar CONTRATOS.",
        ],
        link: "https://ixc.maxfibraltda.com.br/adm.php",
      },
      {
        id: "passo-2",
        title: "Abrir o menu do sistema → Cadastros → Contratos",
        details: [
          "No menu lateral, localizar 'Cadastros'.",
          "Entrar em 'Contratos'.",
        ],
      },
      {
        id: "passo-3",
        title: "Selecionar o contrato desejado e clicar em Editar",
        details: [
          "Use a busca por Cliente/ID se necessário.",
          "Abra o registro do contrato e clique em 'Editar'.",
        ],
      },
      {
        id: "passo-4",
        title: "Ir para a aba 'Taxas de ativação' e clicar em 'Adicionar'",
        details: [
          "Localize a aba 'Taxas de ativação' no topo do formulário de contrato.",
          "Clique em 'Adicionar' para criar/ajustar a taxa.",
        ],
      },
      {
        id: "passo-5",
        title: "Zerar campos: Taxa de ativação, Vencimento e Parcelas",
        details: [
          "Taxa de ativação = 0",
          "Vencimento = 'Sem taxa' / 0",
          "Número de parcelas = 0",
          "Conferir se 'Tipo de documento' e 'Produto' estão corretos, caso o formulário exija.",
        ],
      },
      {
        id: "passo-6",
        title: "Salvar",
        details: [
          "Salvar as alterações e validar se o contrato refletiu 'Sem taxa'.",
          "Se houver título anterior, seguir tua política (cancelar/estornar/ajustar).",
        ],
      },
    ]
  ), []);

  const [done, setDone] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [obs, setObs] = useState(() => localStorage.getItem(OBS_KEY) || "");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(done)); } catch {}
    const total = steps.length;
    const finished = Object.values(done).filter(Boolean).length;
    onProgressChange?.(Math.round((finished / total) * 100));
  }, [done, steps.length]);

  useEffect(() => { try { localStorage.setItem(OBS_KEY, obs || ""); } catch {} }, [obs]);

  const toggle = (id) => setDone((d) => ({ ...d, [id]: !d[id] }));
  const reset = () => setDone({});

  const pct = useMemo(() => {
    const total = steps.length;
    const finished = Object.values(done).filter(Boolean).length;
    return Math.round((finished / total) * 100);
  }, [done, steps.length]);

    const copy = async (txt) => {
            try {
            await navigator.clipboard.writeText(txt);
                setToast("Link copiado com sucesso!");
                setTimeout(() => setToast(null), 3000);
                } catch {
            setToast("Erro ao copiar link.");
            setTimeout(() => setToast(null), 3000);
            }
    };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Como preparar no IXC: Cliente <span className="text-emerald-600">SEM TAXA</span></h3>
          <p className="text-xs opacity-70">Roteiro operacional para ação central. Progresso: <b>{pct}%</b></p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://ixc.maxfibraltda.com.br/adm.php"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-500"
          >
            Abrir IXC <ExternalLink className="w-3 h-3"/>
          </a>
          <button
            onClick={() => copy("https://ixc.maxfibraltda.com.br/adm.php")}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
            title="Copiar URL do IXC"
          >
            Copiar URL <Clipboard className="w-3 h-3"/>
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
            title="Reiniciar checklist"
          >
            Resetar <RefreshCw className="w-3 h-3"/>
          </button>
        </div>
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {steps.map((s, idx) => (
          <li key={s.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-start gap-3">
              <button
                onClick={() => toggle(s.id)}
                className={`mt-0.5 shrink-0 rounded-full border w-5 h-5 flex items-center justify-center ${done[s.id] ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-300 dark:border-zinc-700"}`}
                aria-label={done[s.id] ? "Desmarcar" : "Marcar concluído"}
              >
                {done[s.id] && <CheckCircle2 className="w-4 h-4"/>}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">
                  {idx + 1}. {s.title}
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noreferrer" className="ml-2 underline opacity-80 hover:opacity-100">
                      abrir <ExternalLink className="inline w-3 h-3"/>
                    </a>
                  )}
                </div>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  {s.details.map((d, i) => (
                    <li key={i} className="text-xs opacity-90 leading-relaxed">{d}</li>
                  ))}
                </ul>

                {/* Bloco de imagens do passo (opcional) */}
                {(images[s.id]?.length || 0) > 0 && (
                  <div className="mt-2 grid sm:grid-cols-2 gap-2">
                    {images[s.id].map((img, i) => (
                      <figure key={i} className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.src} alt={img.alt || s.title} className="w-full h-auto block" />
                        {img.alt && <figcaption className="text-[11px] opacity-70 p-1">{img.alt}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Observações internas */}
      <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="text-xs font-semibold mb-2">Observações internas</div>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Ex.: protocolo da central, operador, motivo e evidências"
          className="w-full min-h-[80px] text-sm rounded-lg border bg-white border-zinc-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
        />
        <div className="mt-2 text-[11px] opacity-70">
          Dica: para auditoria, anexe prints no atendimento/contrato no IXC.
        </div>
      </div>

      {/* Nota de regra de comissão (contexto do teu projeto) */}
      <div className="rounded-lg bg-emerald-50 text-emerald-800 text-xs p-3 dark:bg-emerald-900/20 dark:text-emerald-200">
        Regras atuais (Vendas Dashboard 2.0): cliente <b>bloqueado e sem taxa paga</b> → comissão <b>zerada</b>; cliente <b>ativo com taxa paga</b> → comissão <b>integral</b>; marcado como <b>sem taxa</b> → <b>R$ 5,00</b> fixos.
      </div>

      {/* Toast bonito */}
            {toast && (
            <div className="fixed bottom-6 right-6 z-50 animate-fadeIn">
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg bg-emerald-600 text-white text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>{toast}</span>
                <button
                    onClick={() => setToast(null)}
                    className="ml-2 opacity-80 hover:opacity-100"
                >
                    <X className="w-4 h-4" />
                </button>
                </div>
            </div>
            )}

    </div>
  );
}
