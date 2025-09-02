import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2, X, ArrowRight } from "lucide-react";

// util: YYYY-MM-DD
const toISODate = (d) => {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd.toISOString().slice(0, 10);
};

// BR: DD/MM/AAAA
const fmtBR = (d) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(d));

// primeiro/último dia do mês anterior
function prevMonthRange(today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start, end };
}

export default function MonthlyCloseModal({
  onApplyRange,                 // (deISO, ateISO) => void
  onAccess,                     // opcional: abrir relatório
  storageKeyPrefix = "monthly_close_",
  className = "",
  force = false,
  openOnMount = true,
  accentGradient,
}) {
  const [open, setOpen] = useState(false);
  const [neverShow, setNeverShow] = useState(false);
  const btnPrimaryRef = useRef(null);

  const today = useMemo(() => new Date(), []);
  const showWindow = today.getDate() <= 10;          // <= dia 10
  const { start, end } = useMemo(() => prevMonthRange(today), [today]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
    return fmt.format(start);
  }, [start]);

  // chaves de storage
  const monthKey = useMemo(
    () => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
    [today]
  );
  const dismissTodayKey = useMemo(() => `${storageKeyPrefix}dismiss_${toISODate(today)}`, [today, storageKeyPrefix]);
  const neverKey = useMemo(() => `${storageKeyPrefix}never_${monthKey}`, [storageKeyPrefix, monthKey]);



  // abrir só até dia 10, respeitando "nunca mostrar"
  useEffect(() => {
    if (!openOnMount) return;
    if (!(showWindow || force)) return;                     // passou do dia 10
    const never = localStorage.getItem(neverKey) === "1";
    setNeverShow(never);
    if (never) return;

    const dismissedToday = localStorage.getItem(dismissTodayKey) === "1";
    if (!dismissedToday) setOpen(true);
  }, [openOnMount, showWindow, force, neverKey, dismissTodayKey]);

  // foco + ESC + bloquear scroll
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => btnPrimaryRef.current?.focus(), 30);

    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "Enter") handleAccess();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleAccess = () => {
    const deISO  = toISODate(start);
    const ateISO = toISODate(end);
    onApplyRange?.(deISO, ateISO);
    onAccess?.();
    setOpen(false);
  };

  const handleDismissToday = () => {
    localStorage.setItem(dismissTodayKey, "1");
    setOpen(false);
  };

  const toggleNever = (e) => {
    const v = e.target.checked;
    setNeverShow(v);
    if (v) localStorage.setItem(neverKey, "1");
    else   localStorage.removeItem(neverKey);
  };

  if (!open) return null;

  const grad = accentGradient || "linear-gradient(90deg, rgba(16,185,129,1) 0%, rgba(59,130,246,1) 100%)";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog" aria-labelledby="mc-title">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-[fadeIn_.12s_ease]" />
      <div
        className={`relative mx-4 w-full max-w-xl rounded-3xl border bg-white/95 border-zinc-200 text-zinc-900 shadow-[0_20px_60px_-10px_rgba(0,0,0,.35)]
                    dark:bg-zinc-950/95 dark:border-zinc-800 dark:text-zinc-100 ${className}
                    animate-[popIn_.18s_cubic-bezier(.18,.9,.28,1.2)] overflow-hidden`}
      >
        <div className="h-1.5 w-full" style={{ background: grad }} />
        <div className="flex items-center gap-3 px-5 pt-5">
          <div className="relative">
            <div className="absolute inset-0 blur-xl opacity-40" style={{ background: grad, borderRadius: 14 }} />
            <div className="relative inline-flex items-center justify-center rounded-2xl p-2.5 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200
                            dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
          </div>
          <h2 id="mc-title" className="text-[18px] font-semibold tracking-tight">Fechamento mensal concluído</h2>
          <button
            onClick={() => setOpen(false)}
            className="ml-auto inline-flex items-center justify-center rounded-lg p-2 opacity-70 hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-5">
          <p className="text-sm leading-relaxed opacity-90">
            O relatório de{" "}
            <span className="inline-flex items-center rounded-md px-2 py-0.5 text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200
                              dark:bg-emerald-900/30 dark:text-emerald-100 dark:ring-emerald-800">
              {monthLabel}
            </span>{" "}
            está pronto. Clique em <em className="font-medium">Acessar relatório</em> para aplicar:
          </p>

          {/* chips de período (pt-BR) */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs opacity-70">Período</span>
            <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs bg-zinc-100 ring-1 ring-zinc-200
                             dark:bg-zinc-900 dark:ring-zinc-800">
              <span className="opacity-60">de</span> {fmtBR(start)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs bg-zinc-100 ring-1 ring-zinc-200
                             dark:bg-zinc-900 dark:ring-zinc-800">
              <span className="opacity-60">até</span> {fmtBR(end)}
            </span>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-2">
            <button
              ref={btnPrimaryRef}
              onClick={handleAccess}
              className="inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl text-white shadow-sm hover:shadow-md active:scale-[.99]
                         focus:outline-none focus:ring-2 focus:ring-emerald-400/60 dark:focus:ring-emerald-500/60"
              style={{ background: grad }}
            >
              Acessar relatório
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={handleDismissToday}
              className="inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-50
                         dark:border-zinc-800 dark:hover:bg-zinc-900"
              title="Não mostrar novamente hoje"
            >
              Não mostrar hoje
            </button>
          </div>

          {/* preferências */}
          <div className="mt-3">
            <label className="inline-flex items-center gap-2 text-sm opacity-80 select-none cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-zinc-300 dark:border-zinc-700"
                checked={neverShow}
                onChange={toggleNever}
              />
              Não mostrar mais neste mês
            </label>
            <p className="mt-2 text-[12px] opacity-60">
              Dica: você pode abrir este fechamento depois em <span className="font-medium">Relatório de comissão</span>.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes popIn { from { transform: translateY(8px) scale(.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
