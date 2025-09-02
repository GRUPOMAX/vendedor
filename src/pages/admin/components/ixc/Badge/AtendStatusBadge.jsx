// components/ixc/Badge/AtendStatusBadge.jsx
import React from "react";

const TONE = {
  N: "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-300",
  P: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300",
  EP:"bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300",
  S: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300",
  C: "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300",
  NA: "bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-800/30 dark:border-zinc-700 dark:text-zinc-300",
};

const SHORT = { N: "Novo", P: "Pendente", EP: "Em prog.", S: "Solucionado", C: "Cancelado", NA: "Não ativo" };

export default function AtendStatusBadge({ code, label }) {
  if (!code) return null;
  const tone = TONE[code] || "bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-800/30 dark:border-zinc-700 dark:text-zinc-300";
  const text = label || SHORT[code] || code;

  return (
    <span
      title={label || text}
      className={`inline-flex h-6 items-center gap-1.5 px-2 rounded-full border text-[11px] leading-none whitespace-nowrap ${tone}`}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "currentColor", opacity: 0.85 }} />
      <span className="truncate max-w-[92px]">{text}</span>
    </span>
  );
}
