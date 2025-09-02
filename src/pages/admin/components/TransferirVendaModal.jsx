import React, { useEffect, useState, useMemo } from "react";
import { X as XIcon, Send, Users, CheckCircle, XCircle } from "lucide-react";

import { transferirVendaBasico, localizarVenda } from "../../../services/vendasApi";
import { listVendedores } from "../../../services/vendedoresCadastroService";

const norm = (s = "") => String(s).trim();

export default function TransferirVendaModal({
  open,
  onClose,
  protocolo,
  sugestaoDestino = {},
  onSuccess,
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [listaVend, setListaVend] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");

  // NOVOS estados
  const [check, setCheck] = useState({ loading: false, ok: false, vendedorAtual: "", arquivo: "" });

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const arr = await listVendedores();
        if (!cancel) setListaVend(arr);
      } catch (e) {
        console.warn("[TransferirVendaModal] Falha ao listar vendedores:", e);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // reset ao abrir
  useEffect(() => {
    if (!open) return;
    setMsg("");
    setSelectedIdx("");
    setNome("");
    setEmail("");
    setCheck({ loading: true, ok: false, vendedorAtual: "", arquivo: "" });

    (async () => {
      try {
        const res = await localizarVenda(protocolo);
        // esperado: { ok:true, found:true, vendedorAtual, arquivo, ... }
        if (res?.ok && (res.found ?? true)) {
          setCheck({
            loading: false,
            ok: true,
            vendedorAtual: res.vendedorAtual || res.vendedor || "",
            arquivo: res.arquivo || res.file || "",
          });
          setMsg(""); // limpa msg de erro
        } else {
          setCheck({ loading: false, ok: false, vendedorAtual: "", arquivo: "" });
          setMsg("❌ Protocolo não localizado. Verifique o número.");
        }
      } catch (e) {
        setCheck({ loading: false, ok: false, vendedorAtual: "", arquivo: "" });
        setMsg(`❌ ${e.message}`);
      }
    })();
  }, [open, protocolo]);

  // pré-seleção por sugestão
  const sugestaoNome = (sugestaoDestino?.nome || "").toLowerCase();
  useEffect(() => {
    if (!open || !listaVend.length || !sugestaoNome) return;
    const idx = listaVend.findIndex(v => String(v.nome).toLowerCase() === sugestaoNome);
    if (idx >= 0) setSelectedIdx(String(idx)); // nome/email sincronizam abaixo
  }, [open, listaVend, sugestaoNome]);

  // sincroniza campos quando selectedIdx mudar
  useEffect(() => {
    if (selectedIdx === "") return;
    const v = listaVend[Number(selectedIdx)];
    setNome(v?.nome || "");
    setEmail(v?.email || "");
  }, [selectedIdx, listaVend]);

  const canSend = useMemo(() => {
    const okProto = !!norm(protocolo);
    const v = listaVend[Number(selectedIdx)];
    const okVend = !!v?.nome && !!norm(v?.email || "");
    return okProto && okVend && check.ok && !busy;
  }, [busy, protocolo, selectedIdx, listaVend, check.ok]);

  const handleTransfer = async () => {
    if (!canSend) return;
    setMsg("");
    setBusy(true);
    try {
  const v = listaVend[Number(selectedIdx)];
  const result = await transferirVendaBasico({
    protocolo: norm(protocolo),
    to: { nome: norm(v.nome), email: norm(v.email) },
  });
  setMsg(
    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
      <CheckCircle className="w-4 h-4" />
      Transferência concluída.
    </span>
  );
  onSuccess?.(result);
  setTimeout(() => onClose?.(), 700);
      } catch (err) {
        let cleanMsg = err?.message || "Erro ao transferir.";
        // se vier JSON bruto dentro da mensagem, tenta parsear
        try {
          if (cleanMsg.trim().startsWith("{")) {
            const j = JSON.parse(cleanMsg);
            cleanMsg = j.error || cleanMsg;
          }
        } catch {}
        
        setMsg(
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <XCircle className="w-4 h-4" />
            {cleanMsg}
          </span>
        );
} finally {
      setBusy(false);
    }
  };

  const hiddenCls = open ? "" : "pointer-events-none opacity-0";

  return (
    <div className={`fixed inset-0 z-[1100] transition ${hiddenCls}`}>
      <div className="absolute inset-0 bg-black/50" onClick={busy ? undefined : onClose} />
      <div className="absolute inset-x-0 top-16 mx-auto w-[min(560px,92vw)] rounded-2xl border bg-white border-zinc-200 shadow-xl dark:bg-zinc-950 dark:border-zinc-800">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold">Transferir venda</h3>
          </div>
          <button disabled={busy} onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs opacity-70">Protocolo</label>
            <input
              value={protocolo || ""}
              readOnly
              className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm"
            />
          </div>

          {/* status da checagem */}
          <div className="text-xs">
            {check.loading ? "Validando protocolo…" : (
              check.ok ? (
                <div className="text-emerald-600 dark:text-emerald-400">
                  ✓ Encontrado {check.arquivo ? `(${check.arquivo})` : ""}{check.vendedorAtual ? ` · Vendedor atual: ${check.vendedorAtual}` : ""}
                </div>
              ) : (
                <div className="text-red-600 dark:text-red-400">Protocolo não localizado.</div>
              )
            )}
          </div>

          {/* seletor (único campo editável) */}
          {Array.isArray(listaVend) && listaVend.length > 0 && (
            <div className="flex gap-2">
              <select
                className="w-1/2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                value={selectedIdx}
                onChange={(e) => setSelectedIdx(e.target.value)}
              >
                <option value="" disabled>Escolher vendedor…</option>
                {listaVend.map((v, i) => (
                  <option key={i} value={i}>{v.nome}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => { setSelectedIdx(""); setNome(""); setEmail(""); }}
                className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm"
              >
                Limpar
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs opacity-70">Vendedor destino (Nome)</label>
              <input value={nome} readOnly className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs opacity-70">E-mail do destino</label>
              <input value={email} readOnly className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 py-2 text-sm" />
            </div>
          </div>

          {msg ? <div className="text-sm">{msg}</div> : null}
        </div>

        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          <button
            disabled={busy}
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border text-sm bg-white border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            Cancelar
          </button>
          <button
            disabled={!canSend}
            onClick={handleTransfer}
            className={`px-3 py-1.5 rounded-xl text-sm inline-flex items-center gap-2
                       ${canSend ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-zinc-300 text-zinc-600"}`}
          >
            <Send className="w-4 h-4" />
            {busy ? "Transferindo…" : "Transferir"}
          </button>
        </div>
      </div>
    </div>
  );
}
