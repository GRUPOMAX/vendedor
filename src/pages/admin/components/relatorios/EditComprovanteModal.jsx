// src/components/admin/relatorios/EditComprovanteModal.jsx
import React, { useEffect, useState } from "react";
import { X, Info } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function EditComprovanteModal({ open, onClose, item, onSaved }) {
  const [valor, setValor] = useState(0);
  const [obs, setObs] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setValor(Number(item?.valor || 0));
    setObs("");
    setFile(null);
    setMsg("");
  }, [open, item]);

  if (!open) return null;

  const patchMeta = async () => {
    const url = `${API_BASE.replace(/\/$/, "")}/api/comprovantes/${encodeURIComponent(item.txid)}`;
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valor: Number(valor || 0), observacao: obs || "" }),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };

  const uploadNewFile = async () => {
    if (!file) return null;
    const url = `${API_BASE.replace(/\/$/, "")}/api/comprovantes/${encodeURIComponent(item.txid)}/file`;
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(url, { method: "POST", body: fd });
    if (!r.ok) throw new Error(await r.text());
    return r.json(); // deve retornar { url, versao, ... }
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    try {
      setBusy(true);
      setMsg("");

      // 1) atualiza metadados
      const meta = await patchMeta();

      // 2) se houver arquivo novo, sobe e mantém versão antiga
      let newFileInfo = null;
      if (file) newFileInfo = await uploadNewFile();

      const payload = {
        txid: item.txid,
        valor: Number(valor || 0),
        url: newFileInfo?.url || item.url,
        meta,
      };
      onSaved?.(payload);
    } catch (err) {
      setMsg(`Falha ao salvar: ${err?.message || "erro desconhecido"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="font-semibold">Editar comprovante</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-4 space-y-3">
          <div className="text-sm opacity-80">
            <div>TXID: <strong className="font-mono">{item?.txid}</strong></div>
            <div>Vendedor: <strong>{item?.vendedor}</strong></div>
            {!!item?.url && (
              <div className="mt-1">
                Arquivo atual:{" "}
                <a href={item.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                  abrir comprovante
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs opacity-70">Valor (R$)</label>
              <input
                type="number" step="0.01" min="0"
                value={valor} onChange={(e) => setValor(e.target.value)}
                className="w-full mt-1 p-2 rounded-lg border bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                required
              />
            </div>
            <div>
              <label className="text-xs opacity-70">Observação</label>
              <input
                value={obs} onChange={(e) => setObs(e.target.value)}
                placeholder="ex: valor corrigido, erro de digitação…"
                className="w-full mt-1 p-2 rounded-lg border bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </div>

          <div>
            <label className="text-xs opacity-70">Substituir arquivo (opcional)</label>
            <input
              type="file" accept="image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full mt-1 text-sm"
            />
            <p className="mt-2 text-xs flex items-start gap-1 opacity-70">
              <Info className="w-4 h-4 mt-0.5" />
              <span>
                <strong>Importante:</strong> o arquivo <em>original</em> não é alterado. Ao anexar um novo,
                criamos <strong>uma nova versão</strong> do comprovante e mantemos a anterior para auditoria
                (rastreabilidade e prevenção de fraude). Apenas os <em>metadados</em> (valor/observação) são atualizados.
              </span>
            </p>
          </div>

          {msg && <div className="text-sm text-red-600 dark:text-red-400">{msg}</div>}

          <div className="pt-1 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded-lg border bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800">
              Cancelar
            </button>
            <button type="submit" disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60">
              {busy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
