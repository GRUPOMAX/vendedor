// src/pages/admin/components/wiki/AlteracaoTitularidadeHelp.jsx
import React, { useMemo, useState } from "react";
import { ListChecks, ExternalLink, Clipboard, CheckCircle2, X } from "lucide-react";

export default function AlteracaoTitularidadeHelp({
  className = "",
  images = {}, // opcional: { "passo-3": [{src:"/img.png", alt:"..."}], ... }
}) {
  const [toast, setToast] = useState(null);
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const copy = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt);
      showToast("Copiado para a área de transferência!");
    } catch {
      showToast("Não foi possível copiar.");
    }
  };

  // inputs p/ montar a descrição
  const [titularAnt, setTitularAnt] = useState("");
  const [cpfAnt, setCpfAnt] = useState("");
  const descricao = useMemo(
    () =>
      `TITULAR ANTERIOR: ${titularAnt || "<nome do antigo titular>"}\nCPF ANTERIOR: ${cpfAnt || "<cpf do antigo titular>"}`,
    [titularAnt, cpfAnt]
  );

  const passos = [
    {
      id: "passo-1",
      titulo: "Acessar o IXC",
      detalhes: [
        "Entrar em https://ixc.maxfibraltda.com.br/adm.php",
        "Busque pelo novo cliente.",
      ],
      link: "https://ixc.maxfibraltda.com.br/adm.php",
    },
    {
      id: "passo-2",
      titulo: "Editar o cadastro do novo cliente",
      detalhes: ["Clique em Editar para abrir o cadastro."],
    },
    {
      id: "passo-3",
      titulo: "Abrir a aba O.S. (Ordens de serviço)",
      detalhes: ["Entrar na aba O.S. e clicar em Nova."],
    },
    {
      id: "passo-4",
      titulo: "Preencher ‘Assunto’",
      detalhes: [
        "Usar o ID 14 ou o nome “Alteração de Titularidade”.",
      ],
      dicas: "Assunto: 14 – Alteração de Titularidade",
    },
    {
      id: "passo-5",
      titulo: "Selecionar o ‘Setor’",
      detalhes: [
        "Usar o ID 3 ou o nome “Administrativo”.",
      ],
      dicas: "Setor: 3 – Administrativo",
    },
    {
      id: "passo-6",
      titulo: "Descrição da O.S.",
      detalhes: [
        "Ao escolher o assunto, o template aparece.",
        "Complete com o titular anterior e CPF (use o gerador abaixo).",
      ],
    },
    {
      id: "passo-7",
      titulo: "Salvar, Finalizar e Mensagem de finalização",
      detalhes: [
        "Clique em Salvar.",
        "Depois em Ações → Finalizar.",
        "Mensagem de finalização: “Alteração Finalizada”.",
      ],
    },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ListChecks className="w-4 h-4" />
          Alteração de Titularidade · Passo a passo (IXC)
        </h3>
        <a
          href="https://ixc.maxfibraltda.com.br/adm.php"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-500"
        >
          Abrir IXC <ExternalLink className="w-3 h-3" />
        </a>
      </header>

      {/* Gerador de descrição */}
      <section className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <div className="text-xs font-semibold mb-2">Descrição (preencha e copie)</div>
        <div className="grid sm:grid-cols-2 gap-2 mb-2">
          <input
            value={titularAnt}
            onChange={(e) => setTitularAnt(e.target.value)}
            placeholder="Titular anterior (ex.: Joaozinho Teste)"
            className="px-3 py-2 rounded-lg border w-full bg-white border-zinc-200 text-sm dark:bg-zinc-950 dark:border-zinc-800"
          />
          <input
            value={cpfAnt}
            onChange={(e) => setCpfAnt(e.target.value)}
            placeholder="CPF anterior (ex.: 123.456.789-00)"
            className="px-3 py-2 rounded-lg border w-full bg-white border-zinc-200 text-sm dark:bg-zinc-950 dark:border-zinc-800"
          />
        </div>

        <textarea
          readOnly
          value={descricao}
          className="w-full min-h-[84px] text-sm rounded-lg border bg-white border-zinc-200 p-2 dark:bg-zinc-950 dark:border-zinc-800"
        />
        <div className="mt-2">
          <button
            onClick={() => copy(descricao)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
          >
            Copiar descrição <Clipboard className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* Checklist */}
      <ol className="space-y-3">
        {passos.map((p, i) => (
          <li key={p.id || i} className="rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="text-xs font-semibold">{i + 1}. {p.titulo}</div>
            <ul className="list-disc ml-5 space-y-1 mt-1">
              {p.detalhes.map((d, j) => (
                <li key={j} className="text-xs opacity-90">{d}</li>
              ))}
            </ul>

            {!!p.dicas && (
              <div className="mt-2 text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-800 inline-block dark:bg-emerald-900/20 dark:text-emerald-200">
                {p.dicas}
              </div>
            )}

            {(images[p.id]?.length || 0) > 0 && (
              <div className="mt-2 grid sm:grid-cols-2 gap-2">
                {images[p.id].map((img, k) => (
                  <figure key={k} className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
                    <img src={img.src} alt={img.alt || p.titulo} className="w-full h-auto block" />
                    {img.alt && <figcaption className="text-[11px] opacity-70 p-1">{img.alt}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg bg-emerald-600 text-white text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="ml-2 opacity-80 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
