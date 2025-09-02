import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { useTheme } from "../../state/ThemeContext";

const norm = (v) => (v || "").toString().trim();
const keyfy = (v) => norm(v).toLowerCase();

function parseLat(v) {
  const s = norm(v).replace(",", ".");
  if (!s || s.toLowerCase().includes("não informada")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseLng(v) {
  const s = norm(v).replace(",", ".");
  if (!s || s.toLowerCase().includes("não informada")) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function jitterPoint(lat, lng, radiusMeters = 120) {
  const R = 6371000;
  const dist = Math.random() * radiusMeters;
  const brg = Math.random() * Math.PI * 2;
  const δ = dist / R;
  const θ = brg;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;

  const φ2 =
    Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );

  return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
}

function buildHeatPoints(rows, { vendedorKey, jitterMeters }) {
  return rows
    .filter((r) => {
      if (vendedorKey && keyfy(r.vendedor) !== vendedorKey) return false;
      const lat = parseLat(r.latitude);
      const lng = parseLng(r.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng);
    })
    .map((r) => {
      const lat = parseLat(r.latitude);
      const lng = parseLng(r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const [jLat, jLng] = jitterMeters ? jitterPoint(lat, lng, jitterMeters) : [lat, lng];
      return [jLat, jLng, 1];
    })
    .filter(Boolean);
}

function HeatLayer({ points, radius, blur, maxZoom, gradient }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (points?.length) {
      layerRef.current = L.heatLayer(points, { radius, blur, maxZoom, gradient }).addTo(map);
      try {
        const latlngs = points.map(([lat, lng]) => L.latLng(lat, lng));
        map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
      } catch {}
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, radius, blur, maxZoom, gradient]);

  return null;
}

export default function VendedorHeatmap({
  data = [],                 // << já vem filtrado por data
  vendedores = [],
  initialVendedor = "",
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [vendedorKey, setVendedorKey] = useState(keyfy(initialVendedor));
  const [radius, setRadius] = useState(28);
  const [blur, setBlur] = useState(22);
  const [jitterMeters, setJitterMeters] = useState(0);

  // opções de vendedor baseadas no dataset recebido
  const vendorMap = useMemo(() => {
    const base = (vendedores.length ? vendedores : data.map((r) => norm(r.vendedor))).filter(Boolean);
    const map = new Map(); // key -> label
    for (const label of base) {
      const k = keyfy(label);
      if (!map.has(k)) map.set(k, label);
    }
    return map;
  }, [data, vendedores]);

  const vendedorOptions = useMemo(
    () => Array.from(vendorMap, ([k, label]) => ({ k, label })),
    [vendorMap]
  );

  useEffect(() => {
    if (vendedorOptions.length === 0) return;
    if (!vendorMap.has(vendedorKey)) setVendedorKey(vendedorOptions[0].k);
  }, [vendedorOptions, vendorMap, vendedorKey]);

  const points = useMemo(() => {
    const pts = buildHeatPoints(data, { vendedorKey, jitterMeters });
    return pts;
  }, [data, vendedorKey, jitterMeters]);

  const center = useMemo(() => {
    if (points.length) return [points[0][0], points[0][1]];
    return [-20.387, -40.495];
  }, [points]);

  const gradient = useMemo(
    () => ({ 0.2: "#4ade80", 0.4: "#22c55e", 0.6: "#f59e0b", 0.8: "#ef4444", 1.0: "#991b1b" }),
    []
  );

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden border border-zinc-800"
        style={{ height: "500px", width: "100%" }}
      >
        <div className="absolute z-[500] top-4 left-4 bg-white/80 dark:bg-black/70 backdrop-blur-md p-4 rounded-xl text-black dark:text-white w-[95%] md:w-auto flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Vendedor</label>
            <select
              value={vendedorKey}
              onChange={(e) => setVendedorKey(e.target.value)}
              className="w-full rounded-xl p-2 border text-sm bg-white text-black border-zinc-300 dark:bg-zinc-900 dark:text-white dark:border-zinc-800"
            >
              {vendedorOptions.map(({ k, label }) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Sigilo (m)</label>
            <select
              value={jitterMeters}
              onChange={(e) => setJitterMeters(Number(e.target.value))}
              className="w-full rounded-xl p-2 border text-sm bg-white text-black border-zinc-300 dark:bg-zinc-900 dark:text-white dark:border-zinc-800"
            >
              {[0, 10, 20].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <MapContainer
          center={center}
          zoom={12}
          zoomControl={false}   // << remove os botões +/-
          style={{ height: "100%", width: "100%" }}
          whenCreated={(map) => {
            mapRef.current = map;
            setTimeout(() => map.invalidateSize(), 40);
          }}
        >
          <TileLayer
            url={
              isDark
                ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            }
            
          />
          <HeatLayer points={points} radius={radius} blur={blur} maxZoom={17} gradient={gradient} />
        </MapContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-80 w-24">Raio</span>
          <input
            type="range"
            min={10}
            max={60}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-green-500"
            />
          <span className="tabular-nums w-8 text-right">{radius}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-80 w-24">Blur</span>
          <input
            type="range"
            min={10}
            max={50}
            value={blur}
            onChange={(e) => setBlur(Number(e.target.value))}
            className="w-full accent-green-500"
            />
          <span className="tabular-nums w-8 text-right">{blur}</span>
        </label>
      </div>

      <div className="text-sm opacity-80 flex items-center justify-between">
        <div>
          Pontos no mapa: <b>{points.length}</b>
          {vendedorKey && <> · Vendedor: <b>{vendorMap.get(vendedorKey) || ""}</b></>}
        </div>
        <div className="opacity-60">
          * Cada venda gera 1 ponto; a intensidade reflete concentração espacial.
        </div>
      </div>
    </div>
  );
}
