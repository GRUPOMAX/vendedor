import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  HelpCircle,
  X,
  Search,
  BadgeInfo,
  BookOpenText,
  Keyboard,
  Info,
  ExternalLink,
} from "lucide-react";
import SemTaxaIXCHelp from "./SemTaxaIXCHelp"; // ajuste o path
import AlteracaoTitularidadeHelp from "./AlteracaoTitularidadeHelp";

/**
 * HelpCenterFabPlus
 * — versão aprimorada com:
 *  - Legendas separadas em 2 blocos (Etiquetas do Dashboard ✚ Status IXC)
 *  - "Significado" claro do impacto de cada etiqueta (comissão / operação)
 *  - Busca em tempo real (⌥ Alt + F) e atalho para abrir (Shift + ?)
 *  - Lembrança da última aba aberta (localStorage)
 *  - Micro‑animações e layout mais compacto/responsivo
 */
export default function HelpCenterFabPlus({ className = "" }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(() => localStorage.getItem("help.tab") || "legendas");
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      // abre com Shift+/? (a tecla de interrogação)
      if ((e.key === "?" || (e.key === "/" && e.shiftKey)) && !open) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      // fecha com ESC
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    localStorage.setItem("help.tab", tab);
  }, [tab]);

  const TABS = [
    { id: "legendas", label: "Legendas" },
    { id: "semtaxa", label: "Sem Taxa (IXC)" },
    { id: "altitular", label: "Alt. Titularidade (IXC)" },
    { id: "atalhos", label: "Atalhos" },
    { id: "faq", label: "FAQ" },
  ];

  // === DADOS === //
  // 1) Etiquetas do Dashboard (comissão e estado de cadastro)
  const etiquetasDashboard = [
    {
      key: "semtaxa",
      pill: "Sem taxa",
      tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
      significado:
        "Cliente classificado como 'Sem taxa'. Comissão: R$ 5,00 fixos (por regra vigente). Requer justificativa registrada no IXC.",
    },
    {
      key: "bloqueado",
      pill: "Bloqueado",
      tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
      significado:
        "Contrato/cliente bloqueado. Se o cliente estiver bloqueado e NÃO tiver taxa paga, a comissão é zerada.",
    },
    {
      key: "pendente",
      pill: "Pendente",
      tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      significado:
        "Há pendências em aberto (ex.: assinatura, documentação ou financeiro). Não altera comissão automaticamente, mas exige ação.",
    },
    {
      key: "emprogresso",
      pill: "Em progresso",
      tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      significado:
        "Processo em andamento (instalação/ativação/validação). Indicador operacional; impacto de comissão depende da taxa.",
    },
    {
      key: "taxapaga",
      pill: "Taxa paga",
      tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      significado:
        "Taxa de ativação quitada. Cliente não é 'Sem taxa'. Comissão integral conforme tabela do perfil do vendedor.",
    },
    {
      key: "solucionado",
      pill: "Solucionado",
      tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      significado:
        "Demanda resolvida/fechada. Usado em resumos e painéis para indicar conclusão sem pendências.",
    },
  ];

  // 2) Status de Atendimento/OS (IXC) – códigos oficiais
  const statusIXC = [
    { code: "A", title: "Aberta", desc: "Atendimento/OS aberta, aguardando triagem.", tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
    { code: "AN", title: "Análise", desc: "Em análise pela equipe responsável.", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
    { code: "EN", title: "Encaminhada", desc: "Encaminhada para outro setor/técnico.", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
    { code: "AS", title: "Assumida", desc: "Técnico/setor assumiu o atendimento.", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    { code: "AG", title: "Agendada", desc: "Visita/agendamento criado.", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    { code: "DS", title: "Deslocamento", desc: "Técnico em deslocamento.", tone: "bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300" },
    { code: "EX", title: "Execução", desc: "Execução do serviço em andamento.", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
    { code: "F", title: "Finalizada", desc: "Atendimento/OS concluída.", tone: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100" },
    { code: "RAG", title: "Aguard. reagend.", desc: "Aguardando reagendamento pelo cliente/central.", tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  ];

  // === BUSCA === //
  const normalize = (s) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const q = normalize(query);

  const etiquetasFiltered = useMemo(() => {
    if (!q) return etiquetasDashboard;
    return etiquetasDashboard.filter((x) => normalize(`${x.pill} ${x.significado}`).includes(q));
  }, [q]);

  const statusIXCFiltered = useMemo(() => {
    if (!q) return statusIXC;
    return statusIXC.filter((x) => normalize(`${x.code} ${x.title} ${x.desc}`).includes(q));
  }, [q]);

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className={
          "fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full shadow-lg " +
          "px-4 py-3 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 focus:outline-none " +
          "focus:ring-2 focus:ring-emerald-400/60 " +
          className
        }
        title="Ajuda / Wiki (Shift + ? )"
      >
        <HelpCircle className="w-5 h-5" />
        Ajuda
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          <div className="absolute bottom-6 right-6 w-[min(980px,calc(100vw-2rem))] max-h-[80vh]">
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden dark:bg-zinc-950 dark:border-zinc-800">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <BookOpenText className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-sm font-semibold">Centro de Ajuda · Wiki interna</h2>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
                  title="Fechar (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 opacity-60" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.altKey && e.key.toLowerCase() === "f") {
                        e.preventDefault();
                        inputRef.current?.focus();
                      }
                    }}
                    placeholder="Buscar nesta ajuda (Alt+F)"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border bg-white border-zinc-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100"
                  />
                </div>

                <nav className="flex gap-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={
                        "px-3 py-2 text-xs rounded-lg border transition " +
                        (tab === t.id
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-200 dark:border-zinc-800")
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>
              </div>

              {/* Body */}
              <div className="p-4 overflow-y-auto" style={{ maxHeight: "60vh" }}>
                {tab === "legendas" && (
                  <section className="space-y-6">
                    {/* Bloco 1: Etiquetas do Dashboard */}
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <BadgeInfo className="w-4 h-4" /> Etiquetas do Dashboard (com comissão)
                      </h3>
                      <p className="text-xs opacity-75 mb-3">O que significam as etiquetas que aparecem nos cards/listas do dashboard e como impactam a comissão.</p>
                      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {etiquetasFiltered.map((it) => (
                          <li key={it.key} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-medium ${it.tone}`}>
                                • {it.pill}
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed opacity-80">{it.significado}</p>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Bloco 2: Status IXC */}
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Info className="w-4 h-4" /> Status de Atendimento/OS (IXC)
                      </h3>
                      <p className="text-xs opacity-75 mb-3">Códigos oficiais usados em chamados/ordens. Servem de referência e não definem por si só o valor de comissão.</p>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {statusIXCFiltered.map((lg) => (
                          <div key={lg.code} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg text-[10px] font-medium ${lg.tone}`}>
                                {lg.code}
                              </span>
                              <span className="text-xs font-medium">{lg.title}</span>
                            </div>
                            <p className="mt-2 text-xs opacity-75 leading-relaxed">{lg.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )}

                {tab === "semtaxa" && (
                  <section className="space-y-3">
                    <SemTaxaIXCHelp
                      images={{
                        "passo-2": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/IMAGEM-1---IXC.jpg", alt: "Menu Cadastros" },
                        ],
                        "passo-3": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/IMAGEM-3---IXC.jpg", alt: "Lista de contratos" },
                        ],
                        "passo-4": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/IMAGEM-4---IXC.jpg", alt: "Aba Taxas de ativação" },
                        ],
                        "passo-5": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/IMAGEM-5---IXC.jpg", alt: "Taxa/Vencimento/Parcelas zerados" },
                        ],
                      }}
                    />
                  </section>
                )}

                {tab === "altitular" && (
                  <section className="space-y-3">
                    <AlteracaoTitularidadeHelp
                      images={{
                        "passo-2": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/ALTERACAO_TITULARIDADE/BUSCAR-CLIENTE-IXC.jpg", alt: "Editar cliente" },
                        ],
                        "passo-3": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/ALTERACAO_TITULARIDADE/BUSCAR-CLIENTE-IXC-3.jpg", alt: "Aba O.S." },
                        ],
                        "passo-4": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/ALTERACAO_TITULARIDADE/BUSCAR-CLIENTE-IXC-4.jpg", alt: "Assunto 14" },
                        ],
                        "passo-5": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/ALTERACAO_TITULARIDADE/BUSCAR-CLIENTE-IXC-4.jpg", alt: "Setor 3 Administrativo" },
                        ],
                        "passo-7": [
                          { src: "https://s3.nexusnerds.com.br/maxfibra/APLICACOES/DASBOARD%20-%20VENDAS%202.%200/ALTERACAO_TITULARIDADE/BUSCAR-CLIENTE-IXC-6.jpg", alt: "Finalizar O.S." },
                        ],
                      }}
                    />
                  </section>
                )}

                {tab === "atalhos" && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Keyboard className="w-4 h-4" /> Atalhos úteis
                    </h3>
                    <ul className="grid sm:grid-cols-2 gap-2">
                      {[
                        { k: "?", desc: "Abrir este centro de ajuda" },
                        { k: "Esc", desc: "Fechar modais/diálogos" },
                        { k: "Alt + F", desc: "Focar barra de busca dentro do Help" },
                      ].map((a, i) => (
                        <li key={i} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                          <div className="text-xs">
                            <span className="font-mono text-[11px] bg-zinc-100 px-1.5 py-0.5 rounded dark:bg-zinc-800">{a.k}</span> – {a.desc}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {tab === "faq" && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <HelpCircle className="w-4 h-4" /> Perguntas frequentes
                    </h3>
                    <div className="space-y-2">
                      {[
                        {
                          q: "Quando marcar 'Sem taxa'?",
                          a: "Quando a operação autorizar formalmente e a justificativa estiver registrada no IXC (atendimento/contrato).",
                        },
                        {
                          q: "'Sem taxa' zera a comissão?",
                          a: "Não. 'Sem taxa' paga R$ 5,00 fixos; bloqueado sem taxa paga zera; ativo com taxa paga recebe a comissão integral pela tabela do perfil.",
                        },
                        {
                          q: "Onde vejo o impacto?",
                          a: "No Relatório de Comissão do período e na Classificação por Vendedor.",
                        },
                      ].map((f, i) => (
                        <details key={i} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                          <summary className="text-xs font-medium cursor-pointer">{f.q}</summary>
                          <p className="mt-2 text-xs opacity-80 leading-relaxed">{f.a}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-zinc-200 text-[11px] opacity-70 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" /> Dica: pressione <b>?</b> para abrir
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Wiki v1.1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
