import React, { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Loader2, Image as ImageIcon, Link as LinkIcon, X } from "lucide-react";

function useQS() {
  const { search } = useLocation();
  return useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);
}

export default function UploadComprovantePage() {
  const qs = useQS();
  const navigate = useNavigate();

  // upload de arquivo
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState("");

  // estados
  const [url, setUrl] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const apiBase = import.meta.env.VITE_UPLOAD_API || "http://localhost:10005";

  const isHttpUrl = (u) => /^https?:\/\//i.test(u);
  const isImageUrl = (u) => /\.(png|jpe?g)(\?.*)?$/i.test(u);

  function onPickFile(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setErr("");
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview(f ? URL.createObjectURL(f) : "");
  }
  function clearFile() {
    setFile(null);
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFilePreview("");
  }

  // chama SEMPRE o mesmo endpoint: com arquivo (FormData) OU só com ?url=
  async function enviar() {
    const baseParams = {
      vendedor: qs.vendedor || "",
      nomeCadastro: qs.nomeCadastro || "",
      chave: qs.chave || "",
      valor: String(qs.valor || 0),
      txid: qs.txid || "",     // usamos o txid da query como veio
      de: qs.de || "",
      ate: qs.ate || "",
      data: qs.data || "",
      obs: obs || "",
    };

    // 1) arquivo → multipart + query
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      const q = new URLSearchParams(baseParams).toString();
      const resp = await fetch(`${apiBase}/api/upload-comprovante?${q}`, { method: "POST", body: fd });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.error || "Falha no upload");
      return json.url;
    }

    // 2) URL direta → só query (?url=)
    if (!isHttpUrl(url)) throw new Error("Informe uma URL válida (http/https).");
    if (!isImageUrl(url)) throw new Error("A URL deve apontar para uma imagem PNG/JPG.");

    const q = new URLSearchParams({ ...baseParams, url }).toString();
    const resp = await fetch(`${apiBase}/api/upload-comprovante?${q}`, { method: "POST" });
    const json = await resp.json();
    if (!json.ok) throw new Error(json.error || "Falha no upload");
    return json.url;
  }

  function notifySuccess(extra = {}) {
    try {
      window.opener?.postMessage(
        { type: "comprovante:enviado", payload: { txid: qs.txid, vendedor: qs.vendedor, ...extra } },
        "*"
      );
      window.postMessage(
        { type: "comprovante:enviado", payload: { txid: qs.txid, vendedor: qs.vendedor, ...extra } },
        "*"
      );
    } catch (e) {
      console.error("postMessage error:", e);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await enviar();
      setDone(true);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!done) return;
    notifySuccess();
    const t = setTimeout(() => {
      try {
        if (window.opener && !window.opener.closed) window.close();
      } catch {}
    }, 10000);
    return () => clearTimeout(t);
  }, [done]);

  if (done) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2 flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600" /> Comprovante enviado!
        </h1>
        <p className="text-sm opacity-80">Obrigado. O financeiro fará a conferência.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-2">Enviar comprovante (PIX)</h1>

      <div className="text-sm opacity-80 mb-4 space-y-1">
        <div><strong>Vendedor:</strong> {qs.vendedor}</div>
        {qs.nomeCadastro && <div><strong>Nome de cadastro:</strong> {qs.nomeCadastro}</div>}
        <div><strong>Valor:</strong> R$ {Number(qs.valor || 0).toFixed(2)}</div>
        <div><strong>Chave:</strong> {qs.chave}</div>
        <div><strong>TXID:</strong> {qs.txid}</div>
        {qs.data && <div><strong>Data (grupo):</strong> {qs.data}</div>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-zinc-300 p-3">
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> Enviar arquivo (PNG/JPG)
          </label>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={onPickFile}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-zinc-300 file:bg-white file:px-3 file:py-1.5 file:text-sm hover:file:bg-zinc-50"
            />
            {file && (
              <button
                type="button"
                onClick={clearFile}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-300 hover:bg-zinc-50"
              >
                <X className="w-3 h-3" /> remover
              </button>
            )}
          </div>

          {filePreview && (
            <div className="mt-3">
              <img
                src={filePreview}
                alt="Pré-visualização"
                className="max-h-56 rounded-lg border border-zinc-200"
              />
            </div>
          )}

          <p className="text-xs opacity-70 mt-2">
            Dica: escolha um arquivo de até 6 MB. Ao enviar arquivo, o campo de URL fica desabilitado.
          </p>
        </div>

        <div className={`rounded-xl border border-zinc-300 p-3 ${file ? 'opacity-50 pointer-events-none' : ''}`}>
          <label className="block text-sm font-medium mb-2 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" /> OU URL da imagem (PNG/JPG)
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/comprovante.png"
            className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:outline-none"
          />
          <p className="text-xs opacity-70 mt-2">
            Suba a imagem em um local público (drive, CDN ou storage) e cole o link direto (.png / .jpg).
          </p>
        </div>

        <div>
          <label className="block text-sm mb-1">Observação (opcional)</label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-zinc-300 h-24"
          />
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          type="submit"
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>) : "Enviar"}
        </button>
      </form>
    </div>
  );
}
