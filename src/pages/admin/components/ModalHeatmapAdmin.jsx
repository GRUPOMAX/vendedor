// src/pages/admin/components/ModalHeatmapAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { X, MapPinned, Sun, Moon } from "lucide-react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useTheme } from "../../../state/ThemeContext";
import HeatmapAdmin from "./HeatmapAdmin";

dayjs.extend(customParseFormat);

const DATE_FMTS = [
  "DD/MM/YYYY, HH:mm:ss",
  "DD/MM/YYYY HH:mm:ss",
  "YYYY-MM-DDTHH:mm:ssZ",
  "YYYY-MM-DD",
];
const parseDH = (s) => {
  const d = dayjs(s, DATE_FMTS, true);
  return d.isValid() ? d : null;
};

const norm = (v) => (v || "").toString().trim();
const vendOf = (r) => norm(r.__vendedorNome ?? r.vendedor ?? r.Vendedor ?? "");
const parseLat = (v) => {
  const s = norm(v).replace(",", ".");
  if (!s || s.toLowerCase().includes("não informada")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const parseLng = (v) => {
  const s = norm(v).replace(",", ".");
  if (!s || s.toLowerCase().includes("não informada")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function ModalHeatmapAdmin({
  isOpen,
  onClose,
  data = [],                           // pode vir vazio
  vendedores = [],                     // nomes prontos (opcional)
  initialVendedor = "",                // "" = Todos
  initialDateFrom = "",
  initialDateTo = "",
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  // estado local (permite fallback fetch se data vier vazio)
  const [raw, setRaw] = useState(Array.isArray(data) ? data : []);
  const [vendorNames, setVendorNames] = useState(
    vendedores && vendedores.length ? vendedores : []
  );

  const [dateFrom, setDateFrom] = useState(initialDateFrom || "");
  const [dateTo, setDateTo] = useState(initialDateTo || "");

  // sincroniza quando pai enviar dados
  useEffect(() => {
    if (Array.isArray(data) && data.length) setRaw(data);
  }, [data]);

  // fallback: se abrir modal e ainda não tiver dados, baixa de todos os vendedores
  useEffect(() => {
    if (!isOpen) return;
    if (raw.length > 0) return;

    let alive = true;
    (async () => {
      try {
        const BASE = "https://max.api.email.nexusnerds.com.br";
        const r = await fetch(`${BASE}/api/vendedores`);
        const lista = await r.json();

        const arrays = await Promise.all(
          (lista || []).map(v =>
            fetch(`${BASE}${v.url}`)
              .then(x => (x.ok ? x.json() : []))
              .catch(() => [])
          )
        );

        const flat = arrays.flat();
        if (!alive) return;

        setRaw(flat);
        const names = Array.from(new Set(flat.map(vendOf))).filter(Boolean);
        setVendorNames(names);

        // LOG bruto
        const com = flat.filter(x => parseLat(x.latitude) != null && parseLng(x.longitude) != null).length;
        const sem = flat.length - com;
        const porVendedor = flat.reduce((acc, r) => {
          const k = vendOf(r) || "—";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});


        //console.group("%c[HEATMAP ADMIN] dataset bruto recebido", "color:#22d3ee");
        //console.log("Total:", flat.length, " · Com coords:", com, " · Sem coords:", sem);
        //console.log("Por vendedor:", porVendedor);
        //console.log("Exemplos (primeiros 5):", flat.slice(0, 5));
        //console.groupEnd();
      } catch (e) {
        console.error("[HEATMAP ADMIN] fallback fetch error:", e);
      }
    })();
    return () => { alive = false; };
  }, [isOpen, raw.length]);

  // quando datas iniciais mudarem (abrir modal com outro range), ressincroniza inputs
  useEffect(() => setDateFrom(initialDateFrom || ""), [initialDateFrom]);
  useEffect(() => setDateTo(initialDateTo || ""), [initialDateTo]);

  const filtered = useMemo(() => {
    const df = dateFrom ? dayjs(dateFrom, DATE_FMTS, true) : null;
    const dt = dateTo ? dayjs(dateTo, DATE_FMTS, true).endOf("day") : null;

    const out = raw.filter((r) => {
      const d = parseDH(r.dataHora || r.data || r.createdAt || r.updatedAt);
      if (!d) return false;
      if (df && d.isBefore(df)) return false;
      if (dt && d.isAfter(dt)) return false;
      return true;
    });

    // LOG pós-filtro
    const com = out.filter(x => parseLat(x.latitude) != null && parseLng(x.longitude) != null).length;
    const names = Array.from(new Set(out.map(vendOf))).filter(Boolean);
    //console.group("%c[HEATMAP ADMIN] após filtro de data", "color:#a78bfa");
    //console.log("Range aplicado:", { de: dateFrom, ate: dateTo });
    //console.log("Total filtrado:", out.length, " · Com coords:", com);
    //console.log("Vendedores (filtrado):", names);
    //console.log("Exemplos (primeiros 5):", out.slice(0, 5));
    //console.groupEnd();

    return out;
  }, [raw, dateFrom, dateTo]);

  const heatmapKey = useMemo(
    () => `${dateFrom}_${dateTo}_${initialVendedor}_${filtered.length}`,
    [dateFrom, dateTo, initialVendedor, filtered.length]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-[101] w-[95vw] max-w-6xl h-[86vh] bg-card dark:bg-dark-card border border-border dark:border-dark-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-border dark:border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPinned className="w-5 h-5 opacity-80" />
            <h2 className="text-lg font-semibold">Mapa de calor de vendas</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-background dark:hover:bg-dark-background"
              title="Alternar tema"
            >
              {isDark ? <Sun className="w-5 h-5 text-yellow-300" /> : <Moon className="w-5 h-5 text-zinc-700" />}
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-background dark:hover:bg-dark-background" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filtros de data */}
        <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-end border-b border-border dark:border-dark-border">
          <div>
            <label className="text-xs opacity-80">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-background dark:bg-dark-background border border-border dark:border-dark-border rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs opacity-80">Até</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-background dark:bg-dark-background border border-border dark:border-dark-border rounded-xl px-3 py-2"
            />
          </div>
          <div className="ml-auto text-xs opacity-70">Clique fora do modal para fechar.</div>
        </div>

        {/* Mapa */}
        <div className="flex-1 min-h-0">
          <HeatmapAdmin
            key={heatmapKey}
            data={filtered}
            vendedores={vendorNames}
            initialVendedor={initialVendedor}
          />
        </div>
      </div>
    </div>
  );
}
