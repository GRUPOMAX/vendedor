// HeatmapAdmin.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import { useTheme } from "../../../state/ThemeContext";

// utils
const norm  = (v) => (v ?? "").toString().trim();
const keyfy = (v) => norm(v).toLowerCase();

// vendedor em vários formatos
const asVend = (r) =>
  r.__vendedorNome ??
  r.vendedor ??
  r.Vendedor ??
  r.nomeVendedor ??
  r.vendedorNome ??
  r.seller ??
  r.sellerName ??
  "";

// pega latitude/longitude em vários aliases (inclui aninhado)
const pick = (obj, keys) => {
  for (const k of keys) {
    const parts = k.split(".");
    let cur = obj;
    for (const p of parts) cur = cur?.[p];
    if (cur != null) return cur;
  }
  return undefined;
};
const getLat = (r) =>
  pick(r, ["latitude","lat","Latitude","Lat","coords.lat","coordenadas.lat","local.lat"]);
const getLng = (r) =>
  pick(r, ["longitude","lng","Longitude","Lng","coords.lng","coordenadas.lng","local.lng"]);

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
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(φ2 * 180) / Math.PI, (((λ2 * 180) / Math.PI + 540) % 360) - 180];
}

function buildHeatPoints(rows, { vendedorKey, jitterMeters }) {
  return (rows || [])
    .filter((r) => {
      const vend = asVend(r);
      if (vendedorKey && keyfy(vend) !== vendedorKey) return false;
      const lat = parseLat(getLat(r));
      const lng = parseLng(getLng(r));
      return Number.isFinite(lat) && Number.isFinite(lng);
    })
    .map((r) => {
      const lat = parseLat(getLat(r));
      const lng = parseLng(getLng(r));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const [jLat, jLng] = jitterMeters ? jitterPoint(lat, lng, jitterMeters) : [lat, lng];
      return [jLat, jLng, 1];
    })
    .filter(Boolean);
}

// camada heat dinâmica
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

export default function HeatmapAdmin({
  data = [],
  vendedores = [],
  initialVendedor = "",
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [vendedorKey, setVendedorKey] = useState(keyfy(initialVendedor || ""));
  const [radius, setRadius] = useState(28);
  const [blur, setBlur] = useState(22);
  const [jitterMeters, setJitterMeters] = useState(0);

  // opções de vendedor (com "Todos")
  const vendorMap = useMemo(() => {
    // aceita array de strings ou objetos {vendedor/nome/label}
    const fromProp =
      Array.isArray(vendedores) && vendedores.length
        ? vendedores.map((v) =>
            typeof v === "string" ? v : (v.vendedor ?? v.nome ?? v.label ?? "")
          )
        : [];

    const base = (fromProp.length ? fromProp : data.map((r) => norm(asVend(r))))
      .filter(Boolean);

    const map = new Map();
    for (const label of base) {
      const k = keyfy(label);
      if (!map.has(k)) map.set(k, label);
    }
    return map;
  }, [data, vendedores]);

  const vendedorOptions = useMemo(() => {
    const opts = Array.from(vendorMap, ([k, label]) => ({ k, label }));
    return [{ k: "", label: "Todos" }, ...opts];
  }, [vendorMap]);

  useEffect(() => {
    if (vendedorKey === "") return; // "Todos" é válido
    if (!vendorMap.has(vendedorKey) && vendedorOptions.length > 1) {
      setVendedorKey(vendedorOptions[1].k); // 1º vendedor real
    }
  }, [vendedorOptions, vendorMap, vendedorKey]);

  const points = useMemo(
    () => buildHeatPoints(data, { vendedorKey, jitterMeters }),
    [data, vendedorKey, jitterMeters]
  );

  const center = useMemo(() => {
    if (points.length) return [points[0][0], points[0][1]];
    return [-20.387, -40.495]; // fallback ES
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


    useEffect(() => {
    if (!Array.isArray(data)) {
      console.warn("[HEATMAP ADMIN] data não é array:", data);
      return;
    }
    console.group("%c[HEATMAP ADMIN] render", "color:#34d399");
    console.log("Itens recebidos:", data.length);
    console.log("Vendedores no select:", vendedorOptions);
    console.log("vendedorKey selecionado:", vendedorKey, "→", vendorMap.get(vendedorKey) || "Todos");
    console.log("Pontos gerados:", points.length, points.slice(0, 10));
    // mostra 3 registros brutos que viraram ponto
    const first3 = data.filter(r => (r.latitude || r.lat) && (r.longitude || r.lng)).slice(0,3);
    console.log("Exemplos de registros com coord:", first3.map(r => ({
      protocolo: r.protocolo, vendedor: r.__vendedorNome || r.vendedor || r.Vendedor,
      lat: r.latitude, lng: r.longitude, dataHora: r.dataHora
    })));
    console.groupEnd();
  }, [data, vendedorKey, vendedorOptions, points]);

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
        style={{ height: "100%", minHeight: 420 }}
      >
        {/* painel de controles */}
        <div className="absolute z-[500] top-4 left-4 bg-white/85 dark:bg-black/60 backdrop-blur-md p-4 rounded-xl text-black dark:text-white w-[95%] md:w-auto flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-80">Vendedor</label>
            <select
              value={vendedorKey}
              onChange={(e) => setVendedorKey(e.target.value)}
              className="w-full rounded-xl p-2 border text-sm bg-white text-black border-zinc-300 dark:bg-zinc-900 dark:text-white dark:border-zinc-800"
            >
              {vendedorOptions.map(({ k, label }) => (
                <option key={k || "_all"} value={k}>{label}</option>
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

          <div className="hidden md:flex items-center gap-2">
            <label className="text-sm opacity-80">Raio</label>
            <input type="range" min={10} max={60} value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="w-32 accent-green-500" />
            <span className="tabular-nums w-8 text-right">{radius}</span>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <label className="text-sm opacity-80">Blur</label>
            <input type="range" min={10} max={50} value={blur}
              onChange={(e) => setBlur(Number(e.target.value))}
              className="w-28 accent-green-500" />
            <span className="tabular-nums w-8 text-right">{blur}</span>
          </div>

          <div className="text-xs opacity-80 ml-auto">Pontos: <b>{points.length}</b></div>
        </div>

        {/* mapa */}
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
    </div>
  );
}
