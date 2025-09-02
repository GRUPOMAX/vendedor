// components/ClienteMapaModal.jsx
import React, { useEffect, useRef } from "react";
import { X as XIcon, MapPinned } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, useMap, Circle, Tooltip as RLTooltip } from "react-leaflet";
import { useTheme } from "../../../state/ThemeContext";

function ResizeInvalidator() {
  const map = useMap();
  useEffect(() => { setTimeout(() => map.invalidateSize(), 60); }, [map]);
  return null;
}

export default function ClienteMapaModal({ open, onClose, lat, lng, nome, endereco = {} }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const center = [lat, lng];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 top-10 mx-auto w-[95vw] max-w-4xl h-[70vh]
                      rounded-2xl border bg-white border-zinc-200 shadow-2xl
                      dark:bg-zinc-950 dark:border-zinc-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPinned className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold">Localização do cliente</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Fechar">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Info compacta */}
        <div className="px-4 py-2 text-sm border-b border-zinc-200 dark:border-zinc-800">
          <div className="font-medium">{nome || "—"}</div>
          <div className="opacity-70">
            {[endereco.rua, endereco.numero, endereco.bairro, endereco.cidade].filter(Boolean).join(", ") || "—"}
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1 min-h-0">
          <MapContainer center={center} zoom={16} style={{ height: "100%", width: "100%" }}>
            <ResizeInvalidator />
            <TileLayer
              url={
                isDark
                  ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              }
            />
            {/* Marcador sem depender de ícone externo (usa Circle) */}
            <Circle center={center} radius={18} pathOptions={{ color: "#10b981", fillOpacity: 0.8 }}>
              <RLTooltip permanent direction="top" offset={[0, -8]}>
                {nome || "Cliente"}
              </RLTooltip>
            </Circle>
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
