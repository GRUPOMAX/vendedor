import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, Download } from "lucide-react";

let fetchContaPagarStatus;
try { ({ fetchContaPagarStatus } = require("@/services/ixcContasApagarStatus")); } catch {}

const API_BASE = import.meta.env.VITE_IXC_CONTAS_APAGAR_API_BASE;

function parseFromObs(obs = "") {
  const vendedor = obs.split(" - Vendedor: ")[1]?.split(" - Valor:")[0] || "Não especificado";
  const periodo  = obs.split("Comissão de ")[1]?.split(" - Vendedor:")[0] || "Não especificado";
  return { vendedor, periodo };
}
function normalizeItem(pd) { return pd?.item ?? pd?.raw?.registros?.[0] ?? {}; }
function fmtMoney(v) { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : "0.00"; }

export default function PaymentProofModal({ open, onClose, paymentData }) {
  const [full, setFull] = useState(paymentData || {});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Card visível (respecta o tema atual)
  const cardRef = useRef(null);
  // Cópia oculta em Light Mode para export
  const printRef = useRef(null);

  useEffect(() => { setFull(paymentData || {}); }, [paymentData]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    async function fetchFallback(id) {
      if (!API_BASE) throw new Error("VITE_IXC_CONTAS_APAGAR_API_BASE ausente");
      const r = await fetch(`${API_BASE.replace(/\/$/, "")}/contas-apagar/${id}`, {
        signal: ctrl.signal, headers: { accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }
    async function load() {
      setErr("");
      const hasItem = !!(full?.item || full?.raw?.registros?.[0]);
      const id = full?.registro || full?.id || paymentData?.registro || paymentData?.id;
      if (!open || hasItem || !id) return;
      try {
        setLoading(true);
        const res = typeof fetchContaPagarStatus === "function" ? await fetchContaPagarStatus(id) : await fetchFallback(id);
        if (!cancelled) setFull((p) => ({ ...(p || {}), ...(res || {}), registro: id }));
      } catch (e) {
        if (!cancelled) setErr(`Falha ao buscar registro #${id}: ${e?.message || e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; ctrl.abort(); };
  }, [open, full, paymentData]);

  const item = useMemo(() => normalizeItem(full), [full]);
  const obs  = item?.obs || "";
  const { vendedor, periodo } = parseFromObs(obs);

  // Captura a CÓPIA LIGHT oculta (printRef)
  async function handleDownloadPNG() {
    const el = printRef.current;
    if (!el) return;

    let html2canvas;
    try { ({ default: html2canvas } = await import("html2canvas")); }
    catch {
      if (!window.html2canvas) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
          s.onload = res; s.onerror = rej; document.head.appendChild(s);
        });
      }
      html2canvas = window.html2canvas;
    }

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      removeContainer: true,
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `comprovante_${full?.registro || full?.id || "pagamento"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* ---------- MODAL VISÍVEL (respeita dark/light do app) ---------- */}
      <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 p-3" onMouseDown={onClose}>
        <div
          ref={cardRef}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700"
          onMouseDown={(e) => e.stopPropagation()}
          role="dialog" aria-modal="true" aria-label="Comprovante de Pagamento"
        >
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white dark:from-zinc-900 dark:to-zinc-800">
            <h4 className="flex items-center gap-2 text-lg font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="w-6 h-6" /> Comprovante de Pagamento
            </h4>
            <button className="p-2 rounded-full hover:bg-emerald-100 dark:hover:bg-zinc-800" onClick={onClose} aria-label="Fechar">
              <X className="w-6 h-6 text-gray-600 dark:text-zinc-300" />
            </button>
          </div>

          <div className="px-6 py-5 text-sm space-y-4">
            {loading ? (
              <div className="opacity-80 text-center dark:text-zinc-200">Carregando dados do registro…</div>
            ) : err ? (
              <div className="text-red-600 dark:text-red-400 text-center">{err}</div>
            ) : (
              <>
                {[
                  ["Vendedor:", vendedor],
                  ["Valor Pago:", `R$ ${fmtMoney(item?.valor_pago)}`],
                  ["Data do Pagamento:", item?.data_pagamento || "Não especificada"],
                  ["Método de Pagamento:", item?.tipo_pagamento || "Não especificado"],
                  ["Chave PIX:", item?.chave_pix || "Não especificada"],
                  ["Período:", periodo],
                  ["Registro #", full.registro || full.id || ""],
                ].map(([label, value], i) => (
                  <p
                    key={i}
                    className="flex justify-between items-center bg-gray-50 dark:bg-zinc-800/70 p-2 rounded-lg border border-transparent dark:border-zinc-700 shadow-inner"
                  >
                    <strong className="text-gray-700 dark:text-zinc-200">{label}</strong>
                    <span className="font-medium text-gray-900 dark:text-zinc-50">{value}</span>
                  </p>
                ))}
              </>
            )}
          </div>

          {/* Footer (visível só na UI) */}
          <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end space-x-3 bg-gradient-to-r from-white to-emerald-50 dark:from-zinc-900 dark:to-zinc-800">
            <button
              className="px-4 py-2 rounded-xl text-sm bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2"
              onClick={handleDownloadPNG}
            >
              <Download className="w-5 h-5" /> Baixar PNG
            </button>
            <button
              className="px-4 py-2 rounded-xl text-sm border bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-200"
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* ---------- CÓPIA OCULTA EM LIGHT MODE (para export) ---------- */}
      <div style={{ position: "fixed", left: "-10000px", top: 0, zIndex: -1 }}>
        <div
          ref={printRef}                           // captura EXATAMENTE este card
          style={{ width: 720, background: "#fff" }} // largura fixa → sem “sobra” branca
          className="rounded-2xl shadow-2xl border border-zinc-200 text-gray-900"
        >
          <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-white">
            <h4 className="flex items-center gap-2 text-lg font-bold text-emerald-700">
              <CheckCircle className="w-6 h-6" /> Comprovante de Pagamento
            </h4>
            <div className="w-6 h-6 rounded-full text-gray-400" />
          </div>

          <div className="px-6 py-5 text-sm space-y-4">
            {[
              ["Vendedor:", vendedor],
              ["Valor Pago:", `R$ ${fmtMoney(item?.valor_pago)}`],
              ["Data do Pagamento:", item?.data_pagamento || "Não especificada"],
              ["Método de Pagamento:", item?.tipo_pagamento || "Não especificado"],
              ["Chave PIX:", item?.chave_pix || "Não especificada"],
              ["Período:", periodo],
              ["Registro #", full.registro || full.id || ""],
            ].map(([label, value], i) => (
              <p
                key={`print-${i}`}
                className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-zinc-200"
              >
                <strong className="text-gray-700">{label}</strong>
                <span className="font-medium text-gray-900">{value}</span>
              </p>
            ))}
          </div>
          {/* sem footer/botões na versão de impressão */}
        </div>
      </div>
    </>,
    document.body
  );

}
