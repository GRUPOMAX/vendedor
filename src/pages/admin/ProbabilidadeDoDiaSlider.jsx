// src/components/admin/ProbabilidadeDoDiaSlider.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

/* ===== utils ===== */
const norm = (v) => (v ?? "").toString().trim();
const onlyDate = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const fmtISO = (d) => { const x = onlyDate(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const fmtBR = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(d));
const get = (o, ...ks) => { for (const k of ks){ const v = o?.[k]; if (v != null) return v; } };

function parseAnyDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(+raw)) return raw;
  const s = String(raw).trim();
  const d0 = new Date(s);
  if (!isNaN(+d0)) return d0;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [_, dd, MM, yyyy, hh="00", mm="00", ss="00"] = m;
    return new Date(+yyyy, +MM-1, +dd, +hh, +mm, +ss);
  }
  return null;
}

// qtd de ocorrências do weekday entre duas datas (inclusive)
function countWeekdayBetween(start, end, targetW) {
  if (!start || !end) return 0;
  const a = onlyDate(start), b = onlyDate(end);
  if (+a > +b) return 0;
  let n = 0;
  for (let t = +a; t <= +b; t += 86400000) if (new Date(t).getDay() === targetW) n++;
  return n;
}

/* ===== barra de % ===== */
function BarPct({ pct = 0, hint }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative h-8 w-full rounded-xl overflow-hidden bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500/20">
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(16,185,129,0.25) 0 8px, rgba(16,185,129,0) 8px 16px)",
          backgroundSize: "32px 32px",
        }}
        animate={{ backgroundPositionX: ["0px", "32px"] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      />
      <motion.div
        className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-400/80 to-emerald-600/90"
        initial={{ width: 0 }}
        animate={{ width: `${p}%` }}
        transition={{ type: "spring", stiffness: 220, damping: 26, mass: 0.7 }}
      />
      <motion.div
        className="relative z-10 flex h-full items-center justify-center text-sm font-medium text-emerald-900 dark:text-emerald-100"
        key={Math.round(p)}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {p.toFixed(0)}%
      </motion.div>
      {hint ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] opacity-70 z-10 text-emerald-900 dark:text-emerald-100">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

const PT_WEEKDAYS = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

/* ===== core de cálculo (pode ser reutilizado em testes) ===== */
function buildSlides({ vendas, weekday, ordenar, mapVendedor, minOcorrencias }) {
  const w = Number.isInteger(weekday) ? weekday : new Date().getDay();

  // normaliza -> { vendedor, dateOnly }
  const regs = (vendas || [])
    .map((r) => {
      const vendedorRaw = norm(get(r,"__vendedorNome","vendedor","Vendedor","seller","vendedorNome","VendedorNome")) || "—";
      const vendedor = mapVendedor ? mapVendedor(vendedorRaw) : vendedorRaw;
      const raw = get(r,"dataHora","data","createdAt","Data");
      const d = parseAnyDate(raw);
      if (!d) return null;
      return { vendedor, date: onlyDate(d) };
    })
    .filter(Boolean)
    .sort((a,b) => +a.date - +b.date);

  const byVend = new Map();
  for (const r of regs) {
    if (!byVend.has(r.vendedor)) byVend.set(r.vendedor, []);
    byVend.get(r.vendedor).push(r.date);
  }

  const slides = [];
  for (const [vend, dates] of byVend) {
    if (!dates.length) continue;
    const minD = dates[0], maxD = dates[dates.length-1];

    // set de dias (evita contar mais de 1 venda no mesmo dia)
    const soldSet = new Set();
    for (const d of dates) if (d.getDay() === w) soldSet.add(fmtISO(d));

    const denom = countWeekdayBetween(minD, maxD, w);
    if ((minOcorrencias ?? 0) > 0 && denom < minOcorrencias) continue; // filtra amostra pequena

    const hits  = soldSet.size;
    const prob  = denom > 0 ? hits / denom : 0;

    slides.push({
      vendedor: vend,
      probPct: prob * 100,
      hint: `${hits}/${denom}`,
      periodo: { de: minD, ate: maxD },
    });
  }

  // ordenação estável
  slides.sort((a,b) => {
    if (ordenar === "asc") return a.probPct - b.probPct || a.vendedor.localeCompare(b.vendedor, "pt-BR");
    if (ordenar === "nome") return a.vendedor.localeCompare(b.vendedor, "pt-BR");
    return b.probPct - a.probPct || a.vendedor.localeCompare(b.vendedor, "pt-BR");
  });

  return { slides, weekdayLabel: PT_WEEKDAYS[w] };
}

/* ===== componente principal ===== */
export default function ProbabilidadeDoDiaSlider({
  vendas = [],
  titulo = "Probabilidade de venda hoje",
  weekday = new Date().getDay(),     // usa o dia atual
  autoMs = 4000,                     // tempo por slide (null/0 = sem autoplay)
  className = "",
  ordenar = "desc",                  // "desc" | "asc" | "nome"
  minOcorrencias = 4,                // amostra mínima de ocorrências do weekday no período
  mapVendedor,                       // fn opcional (nome -> nome normalizado)
}) {
  const { slides, weekdayLabel } = useMemo(
    () => buildSlides({ vendas, weekday, ordenar, mapVendedor, minOcorrencias }),
    [vendas, weekday, ordenar, mapVendedor, minOcorrencias]
  );

  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => { setIdx(0); }, [vendas, weekday, ordenar]);

  // autoplay
  useEffect(() => {
    if (!slides.length || !autoMs || paused) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), autoMs);
    return () => clearInterval(t);
  }, [slides.length, autoMs, paused]);

  // teclado
  const goPrev = useCallback(() => setIdx(i => (i - 1 + slides.length) % slides.length), [slides.length]);
  const goNext = useCallback(() => setIdx(i => (i + 1) % slides.length), [slides.length]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [goPrev, goNext]);

  const slide = slides[idx];

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 min-h-[220px] outline-none ${className}`}
      aria-roledescription="carousel"
      aria-live="polite"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">{titulo}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs opacity-70">Hoje: {weekdayLabel}</span>
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Próximo">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {slides.length === 0 ? (
        <div className="h-28 grid place-items-center text-sm opacity-70">Sem dados suficientes</div>
      ) : (
        <div className="relative pt-2 pb-1">
          <div className="mb-2 flex items-center gap-2">
            <div className="text-sm opacity-70">Vendedor</div>
            <div className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
              Período: {fmtBR(slide.periodo.de)} — {fmtBR(slide.periodo.ate)}
            </div>
          </div>

          <motion.div
            key={`${slide.vendedor}-${weekday}-${idx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: .25 }}
          >
            <div className="mb-3 text-xl font-semibold">{slide.vendedor}</div>
            <BarPct pct={slide.probPct} hint={slide.hint} />
          </motion.div>

          <div className="mt-3 flex items-center justify-between text-xs opacity-70">
            <span>dias com ≥1 venda / ocorrências no período</span>
            <span>{idx + 1} / {slides.length}</span>
          </div>

          <div className="mt-2 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-1.5 w-3 rounded-full transition-all ${i === idx ? "bg-emerald-500 w-4" : "bg-zinc-400/40"}`}
                aria-label={`Ir para slide ${i+1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
