import React, { useEffect, useMemo, useState } from "react";
import { X, Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react"; // adicionado

import {
  fetchCadastroVendedorJSON,
  mapCadastroVendedor,
  updateVendedorPixPorNome_Config,
} from "@/services/nocodbVendedores";

/**
 * Props:
 *  - open
 *  - onClose
 *  - defaultNome
 *  - vendedorNome  → se vier, mostra SOMENTE esse vendedor (input travado)
 */
export default function VendedorConfigModal({ open, onClose, defaultNome, vendedorNome }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lista, setLista] = useState([]);
  const [selNome, setSelNome] = useState("");
  const [pix, setPix] = useState("");
  const [tipo, setTipo] = useState("E-mail"); // "CPF" | "E-mail" | "Telefone"
  const [nomeCadastro, setNomeCadastro] = useState("");

    const [msg, setMsg] = useState("");
    const [msgType, setMsgType] = useState(null); // "success" | "error"

  const norm = (s = "") => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const travaVendedor = Boolean(vendedorNome);
  const vSel = useMemo(() => lista.find((x) => x.nome === selNome), [lista, selNome]);

  // helpers
  const onlyDigits = (s = "") => String(s).replace(/\D/g, "");
  const maskCPF = (s = "") => {
    const d = onlyDigits(s).slice(0, 11);
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  const maskPhoneBR = (s = "") => {
    const d = onlyDigits(s).slice(0, 11); // DDD + 9 + 8
    if (d.length <= 10) {
      return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
    }
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
  };
  const isEmail = (v = "") => /.+@.+\..+/.test(v.trim());

  // bloquear scroll ao abrir
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, [open]);

  // carregar dados
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      setMsg("");
      try {
        const { cadJSON } = await fetchCadastroVendedorJSON();
        let arr = mapCadastroVendedor(cadJSON).sort((a, b) => a.nome.localeCompare(b.nome));
        if (vendedorNome) arr = arr.filter((v) => norm(v.nome) === norm(vendedorNome));
        setLista(arr);

        const initialName = arr[0]?.nome || vendedorNome || defaultNome || "";
        setSelNome(initialName);
        const v = arr.find((x) => x.nome === initialName);
        setPix(v?.pix ?? "");
        setTipo(v?._raw?.Tipo || "E-mail");
        setNomeCadastro(v?._raw?.["nome-cadastro"] || "");
      } catch (e) {
        setMsg(e?.message || "Falha ao carregar vendedores.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, defaultNome, vendedorNome]);

  // trocar vendedor → atualizar campos
  useEffect(() => {
    const v = lista.find((x) => x.nome === selNome);
    setPix(v?.pix ?? "");
    setTipo(v?._raw?.Tipo || "E-mail");
    setNomeCadastro(v?._raw?.["nome-cadastro"] || "");
  }, [selNome, lista]);

  // máscara dinâmica
  function onChangePix(e) {
    const val = e.target.value;
    if (tipo === "CPF") setPix(maskCPF(val));
    else if (tipo === "Telefone") setPix(maskPhoneBR(val));
    else setPix(val);
  }

  function validate() {
    if (!selNome) return "Selecione o vendedor.";
    if (!nomeCadastro || nomeCadastro.trim().length < 5) return "Informe o nome completo (mín. 5 caracteres).";
    if (tipo === "E-mail" && !isEmail(pix)) return "E-mail inválido.";
    if (tipo === "CPF" && onlyDigits(pix).length !== 11) return "CPF inválido.";
    if (tipo === "Telefone" && ![10, 11].includes(onlyDigits(pix).length)) return "Telefone inválido.";
    return null;
  }

    async function handleSave() {
    const err = validate();
    if (err) {
        setMsg(err);
        setMsgType("error");
        return;
    }
    setSaving(true);
    setMsg("");
    setMsgType(null);
    try {
        await updateVendedorPixPorNome_Config({ nome: selNome, pix, tipo, nomeCadastro });
        setMsg("Dados de pagamento atualizados!");
        setMsgType("success");
    } catch (e) {
        setMsg(e?.message || "Erro ao salvar.");
        setMsgType("error");
    } finally {
        setSaving(false);
    }
    }

  function closeOnBackdrop(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  if (!open) return null;
  const singleOnly = travaVendedor || (lista.length === 1);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-6"
      onMouseDown={closeOnBackdrop}
    >
      <div
        className="w-full sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-semibold">Configurações do Vendedor</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              {/* Vendedor */}
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-zinc-500">Vendedor</label>
                {singleOnly ? (
                  <input
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 px-3 py-2"
                    value={selNome}
                    disabled
                  />
                ) : (
                  <select
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={selNome}
                    onChange={(e) => setSelNome(e.target.value)}
                  >
                    {lista.map((v) => (
                      <option key={v.key} value={v.nome}>
                        {v.nome}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* E-mail / Telefone (somente leitura) */}
              {vSel && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-zinc-500">E-mail</label>
                    <input className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 px-3 py-2" value={vSel.email || ""} disabled />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-wide text-zinc-500">Telefone</label>
                    <input className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800/60 px-3 py-2" value={vSel.telefone || ""} disabled />
                  </div>
                </div>
              )}

              {/* Tipo / Nome completo / Chave */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-zinc-500">Tipo</label>
                  <select
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={tipo}
                    onChange={(e) => {
                      const t = e.target.value;
                      setTipo(t);
                      setPix(""); // limpa para evitar sujeira ao trocar tipo
                    }}
                  >
                    <option>CPF</option>
                    <option>E-mail</option>
                    <option>Telefone</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs uppercase tracking-wide text-zinc-500">Nome completo (titular do Pix)</label>
                  <input
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Ex.: Joao Carlos Lopes"
                    value={nomeCadastro}
                    onChange={(e) => setNomeCadastro(e.target.value)}
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs uppercase tracking-wide text-zinc-500">Chave Pix</label>
                  <input
                    type={tipo === "E-mail" ? "email" : "text"}
                    inputMode={tipo === "CPF" || tipo === "Telefone" ? "numeric" : "text"}
                    className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder={
                      tipo === "E-mail" ? "email@exemplo.com" :
                      tipo === "CPF" ? "000.000.000-00" : "(27) 99999-0000"
                    }
                    value={pix}
                    onChange={onChangePix}
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Estes campos são editáveis. E-mail e telefone acima são exibidos a partir do cadastro.
                  </p>
                </div>
              </div>
            </>
          )}

            {/* Mensagem de sucesso/erro */}
            {msg && (
            <div
                className={`mt-2 flex items-center gap-2 text-sm px-3 py-2 rounded-lg border
                ${msgType === "success"
                    ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300/60"
                    : "text-red-700 bg-red-50 dark:bg-red-900/20 border-red-300/60"}`}
            >
                {msgType === "success" ? (
                <CheckCircle2 className="w-4 h-4" />
                ) : (
                <AlertCircle className="w-4 h-4" />
                )}
                <span>{msg}</span>
            </div>
            )}

        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || !selNome}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
