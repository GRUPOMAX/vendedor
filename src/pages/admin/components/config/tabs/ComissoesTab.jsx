// src/pages/admin/components/config/tabs/ComissoesTab.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";

/** utils de BRL */
const toCents = (s = "") => Number(String(s).replace(/[^\d]+/g, "") || 0);
const centsToBRL = (c = 0) =>
  (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inputToMaskedBRL = (raw = "") => centsToBRL(toCents(raw));

/** normaliza prop comissoes (array legado OU objeto mapa) -> rows { id, nome, valorCents, _isNew, origName } */
function normalizeComissoes(input) {
  if (!input) return [];
  if (!Array.isArray(input)) {
    return Object.entries(input).map(([nome, v]) => ({
      id: crypto.randomUUID(),
      nome,
      valorCents: toCents(v?.valor ?? "R$ 0,00"),
      _isNew: false,
      origName: nome,
    }));
  }
  return input.map((r) => ({
    id: r.id ?? crypto.randomUUID(),
    nome: r.nome ?? "",
    valorCents: toCents(r.valor ?? r.percentual ?? 0),
    _isNew: !!r._isNew,
    origName: r.nome ?? "",
  }));
}

/** serializa rows -> objeto { Nome: { valor: "R$ x,xx" } } */
function rowsToComissoesObj(rows = []) {
  const out = {};
  for (const r of rows) {
    const nome = String(r.nome || "").trim();
    if (!nome) continue;
    out[nome] = { valor: centsToBRL(r.valorCents || 0) };
  }
  return out;
}

export default function ComissoesTab({ UI, comissoes, onSave }) {
  const [rows, setRows] = useState([]);
  const baselineRef = useRef({});

  // modal de confirmação
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const norm = normalizeComissoes(comissoes);
    setRows(norm);
    baselineRef.current = Array.isArray(comissoes) ? rowsToComissoesObj(norm) : (comissoes || {});
  }, [comissoes]);

  const add = () =>
    setRows((rs) => [
      ...rs,
      { id: crypto.randomUUID(), nome: "", valorCents: 0, _isNew: true },
    ]);

  const update = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const askRemove = (id) => setConfirm({ open: true, id });

  const reallyRemove = async (id) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    // nova: remove só local
    if (row._isNew) {
      setRows((rs) => rs.filter((r) => r.id !== id));
      return;
    }

    const key = row.origName || row.nome;
    if (!key) return;

    // PATCH: remove apenas a chave selecionada
    const updated = { ...baselineRef.current };
    delete updated[key];

    // service espera ARRAY [{nome, valor}]
    const rowsArray = Object.entries(updated).map(([nome, v]) => ({
      nome,
      valor: v?.valor ?? "R$ 0,00",
    }));

    setBusy(true);
    try {
      await onSave?.(rowsArray);
      baselineRef.current = updated;
      setRows((rs) => rs.filter((r) => r.id !== id));
    } finally {
      setBusy(false);
    }
  };

  const hasNew = useMemo(
    () => rows.some((r) => r._isNew && String(r.nome || "").trim()),
    [rows]
  );

  const handleSave = async () => {
    const newsOnly = rows.filter((r) => r._isNew && String(r.nome || "").trim());
    if (!newsOnly.length) return;

    const addObj = rowsToComissoesObj(newsOnly);
    const merged = { ...baselineRef.current, ...addObj };

    const rowsArray = Object.entries(merged).map(([nome, v]) => ({
      nome,
      valor: v?.valor ?? "R$ 0,00",
    }));

    setBusy(true);
    try {
      await onSave?.(rowsArray);
      baselineRef.current = merged;
      setRows((rs) => rs.map((r) => (r._isNew ? { ...r, _isNew: false, origName: r.nome } : r)));
    } finally {
      setBusy(false);
    }
  };

  const totalClasses = useMemo(() => rows.length, [rows]);
  const confirmName = useMemo(
    () => rows.find((r) => r.id === confirm.id)?.nome || "",
    [rows, confirm.id]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: UI.muted }}>
          Defina o <b>valor fixo</b> da comissão por classificação.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={add}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ border: `1px solid ${UI.border}` }}
            disabled={busy}
          >
            <Plus className="w-4 h-4" /> Nova classificação
          </button>

          {hasNew && (
            <button
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{
                border: `1px solid ${UI.emerald.soft}`,
                color: UI.emerald.strong,
                background: "rgba(34,197,94,0.12)",
                opacity: busy ? 0.6 : 1,
              }}
              disabled={busy}
              title="Salvar apenas as novas classificações"
            >
              <Save className="w-4 h-4" /> Salvar alterações
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${UI.border}` }}>
        <table className="w-full text-sm">
          <thead style={{ background: UI.tableHeadBg, color: UI.muted }}>
            <tr>
              <th className="px-3 py-2 text-left">Classificação</th>
              <th className="px-3 py-2 text-left">Valor da comissão (R$)</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${UI.border}` }}>
                <td className="px-3 py-2">
                  <input
                    value={r.nome}
                    onChange={(e) => update(r.id, { nome: e.target.value })}
                    readOnly={!r._isNew}
                    className="bg-transparent outline-none px-2 py-1 rounded w-full"
                    style={{
                      border: `1px solid ${UI.border}`,
                      background: r._isNew ? "rgba(34,197,94,0.06)" : "transparent",
                      opacity: r._isNew ? 1 : 0.8,
                      cursor: r._isNew ? "text" : "not-allowed",
                    }}
                    placeholder="Ex.: Ouro"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={centsToBRL(r.valorCents)}
                    onChange={(e) => update(r.id, { valorCents: toCents(e.target.value) })}
                    onBlur={(e) => (e.target.value = inputToMaskedBRL(e.target.value))}
                    inputMode="numeric"
                    className="bg-transparent outline-none px-2 py-1 rounded w-40"
                    style={{ border: `1px solid ${UI.border}` }}
                    placeholder="R$ 0,00"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => askRemove(r.id)}
                      className="p-2 rounded-xl"
                      style={{ border: `1px solid ${UI.border}` }}
                      title="Remover"
                      disabled={busy}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-3 py-6 text-center text-sm" colSpan={3} style={{ color: UI.muted }}>
                  Nenhuma classificação cadastrada.
                </td>
              </tr>
            )}
          </tbody>
          {totalClasses > 0 && (
            <tfoot>
              <tr>
                <td className="px-3 py-2 text-xs" colSpan={3} style={{ color: UI.muted }}>
                  {totalClasses} classificação(ões).
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Modal de confirmação */}
      {confirm.open && (
        <ConfirmDialog
          UI={UI}
          title="Excluir classificação"
          message={
            <>
              Tem certeza que deseja excluir <b>{confirmName}</b>?<br />
              Essa ação não pode ser desfeita.
            </>
          }
          confirmLabel="Excluir"
          onCancel={() => setConfirm({ open: false, id: null })}
          onConfirm={async () => {
            const id = confirm.id;
            setConfirm({ open: false, id: null });
            await reallyRemove(id);
          }}
          busy={busy}
        />
      )}
    </div>
  );
}

/** Modal reutilizável */
function ConfirmDialog({ UI, title, message, confirmLabel = "Confirmar", onCancel, onConfirm, busy }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onCancel} />
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl"
        style={{ background: UI.cardBg, color: UI.text, border: `1px solid ${UI.border}` }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${UI.border}` }}>
          <h3 className="text-base font-semibold">{title}</h3>
          <button
            onClick={onCancel}
            className="p-2 rounded-xl"
            style={{ border: `1px solid ${UI.border}`, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-4 text-sm">{message}</div>

        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${UI.border}` }}>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ border: `1px solid ${UI.border}`, opacity: busy ? 0.6 : 1 }}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 rounded-xl text-sm text-red-600 bg-red-500/10 border border-red-400"
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
