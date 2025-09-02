import { useMemo, useState } from "react";
import { X, MapPinned, Sun, Moon } from "lucide-react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useTheme } from "../../state/ThemeContext";
import VendedorHeatmap from "./VendedorHeatmap";

dayjs.extend(customParseFormat);

const DATE_FMTS = ['DD/MM/YYYY, HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DDTHH:mm:ssZ', 'YYYY-MM-DD'];
const parseDH = (s) => {
  const d = dayjs(s, DATE_FMTS, true);
  return d.isValid() ? d : null;
};

export default function HeatmapModal({
  isOpen,
  onClose,
  data = [],
  initialVendedor = "",
  initialDateFrom = "",
  initialDateTo = "",
}) {
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);

    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";


  const filteredData = useMemo(() => {
    const df = dateFrom ? dayjs(dateFrom, DATE_FMTS, true) : null;
    const dt = dateTo ? dayjs(dateTo, DATE_FMTS, true).endOf("day") : null;

    return data.filter((r) => {
      const d = parseDH(r.dataHora || r.data || r.createdAt || r.updatedAt);
      if (!d) return false;
      if (df && d.isBefore(df)) return false;
      if (dt && d.isAfter(dt)) return false;
      return true;
    });
  }, [data, dateFrom, dateTo]);

  const heatmapKey = useMemo(
    () => `${dateFrom}_${dateTo}_${initialVendedor}`,
    [dateFrom, dateTo, initialVendedor]
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
            <h2 className="text-lg font-semibold">Mapa de calor - Vendas</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-background dark:hover:bg-dark-background"
              title="Alternar tema"
            >
              {isDark ? (
                <Sun className="w-5 h-5 text-yellow-300" />
              ) : (
                <Moon className="w-5 h-5 text-zinc-700" />
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-background dark:hover:bg-dark-background"
              aria-label="Fechar"
            >
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

          <div className="ml-auto text-xs opacity-70">
            Clique fora do modal para fechar.
          </div>
        </div>

        {/* Conteúdo: Heatmap */}
        <div className="flex-1 min-h-0">
          <VendedorHeatmap
            key={heatmapKey}
            data={filteredData}
            initialVendedor={initialVendedor}
          />
        </div>
      </div>
    </div>
  );
}
