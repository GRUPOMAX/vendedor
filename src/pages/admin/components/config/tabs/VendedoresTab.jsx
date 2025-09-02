// src/pages/admin/components/config/tabs/VendedoresTab.jsx
import React, { useMemo, useState } from "react";
import { Pencil, Trash2, Search } from "lucide-react";

export default function VendedoresTab({
  UI,
  vendedores = [],
  onUpdateVendedor,
  onDeleteVendedor,
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // rowId em edição
  const [form, setForm] = useState({});

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vendedores;
    return vendedores.filter((v) =>
      [v.nome, v.email, v.cpf, v.telefone, v.codigo]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle))
    );
  }, [q, vendedores]);

  // gera um ID seguro por linha (evita undefined e colisões)
  const getRowId = (vend, idx) => {
    const raw =
      vend?.id ??
      vend?._id ??
      vend?.cpf ??
      vend?.email ??
      vend?.nome ??
      "";
    const base = String(raw).trim();
    return base ? base : `row-${idx}`;
  };

  const startEdit = (vend, rowId) => {
    setEditing(rowId);
    setForm({
      nome: vend.nome || "",
      cpf: vend.cpf || "",
      email: vend.email || "",
      telefone: vend.telefone || "",
      codigo: vend.codigo || "",
      ativo: vend.ativo ?? true,
      metaMensal: vend.metaMensal ?? "",
    });
  };

  // === envia só o que mudou (PATCH), nunca sobrescreve o resto ===
  const makePatch = (orig, curr) => {
    const p = {};
    for (const k of Object.keys(curr)) {
      const a = orig?.[k] ?? "";
      const b = curr?.[k] ?? "";
      if (a !== b) p[k] = b;
    }
    return p;
  };

  const submitEdit = async (vend) => {
    const patch = makePatch(vend, form);
    if (!Object.keys(patch).length) {
      setEditing(null);
      return;
    }
    await onUpdateVendedor?.(vend, patch);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      {/* busca */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1"
          style={{ border: `1px solid ${UI.border}` }}
        >
          <Search className="w-4 h-4" style={{ color: UI.muted }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF, e-mail..."
            className="bg-transparent outline-none w-full"
          />
        </div>
        <div className="text-sm" style={{ color: UI.muted }}>
          {list.length} resultado(s)
        </div>
      </div>

      {/* tabela */}
      <div
        className="overflow-hidden rounded-2xl"
        style={{ border: `1px solid ${UI.border}` }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: UI.tableHeadBg, color: UI.muted }}>
            <tr>
              <th className="px-3 py-2 text-left">Nome</th>
              <th className="px-3 py-2 text-left">CPF</th>
              <th className="px-3 py-2 text-left">E-mail</th>
              <th className="px-3 py-2 text-left">Telefone</th>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Meta mensal</th>
              <th className="px-3 py-2 text-left">Ativo</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            {list.map((v, idx) => {
              const rowId = getRowId(v, idx);
              const isEditing = editing === rowId;

              return (
                <React.Fragment key={rowId}>
                  {/* linha de visualização */}
                  <tr style={{ borderTop: `1px solid ${UI.border}` }}>
                    <td className="px-3 py-2">{v.nome || "—"}</td>
                    <td className="px-3 py-2">{v.cpf || "—"}</td>
                    <td className="px-3 py-2">{v.email || "—"}</td>
                    <td className="px-3 py-2">{v.telefone || "—"}</td>
                    <td className="px-3 py-2">{v.codigo || "—"}</td>
                    <td className="px-3 py-2">{v.metaMensal ?? "—"}</td>
                    <td className="px-3 py-2">{v.ativo ? "Sim" : "Não"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(v, rowId)}
                          className="p-2 rounded-xl"
                          style={{ border: `1px solid ${UI.border}` }}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteVendedor?.(v)}
                          className="p-2 rounded-xl"
                          style={{ border: `1px solid ${UI.border}` }}
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* editor expandido em 2 colunas */}
                  {isEditing && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3">
                        <div
                          className="rounded-2xl p-4"
                          style={{
                            border: `1px solid ${UI.border}`,
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div className="grid md:grid-cols-2 gap-3">
                            <Field label="Nome">
                              <input
                                value={form.nome}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, nome: e.target.value }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              />
                            </Field>

                            <Field label="CPF">
                              <input
                                value={form.cpf}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, cpf: e.target.value }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              />
                            </Field>

                            <Field label="E-mail">
                              <input
                                value={form.email}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, email: e.target.value }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              />
                            </Field>

                            <Field label="Telefone">
                              <input
                                value={form.telefone}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    telefone: e.target.value,
                                  }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              />
                            </Field>

                            <Field label="Código">
                              <input
                                value={form.codigo}
                                onChange={(e) =>
                                  setForm((f) => ({ ...f, codigo: e.target.value }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              />
                            </Field>

                            <Field label="Meta mensal">
                              <input
                                type="number"
                                value={form.metaMensal}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    metaMensal: e.target.value,
                                  }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              />
                            </Field>

                            <Field label="Ativo">
                              <select
                                value={form.ativo ? "1" : "0"}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    ativo: e.target.value === "1",
                                  }))
                                }
                                className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
                                style={{ border: `1px solid ${UI.border}` }}
                              >
                                <option value="1">Sim</option>
                                <option value="0">Não</option>
                              </select>
                            </Field>
                          </div>

                          <div className="flex items-center justify-end gap-2 mt-4">
                            <button
                              onClick={() => submitEdit(v)}
                              className="px-3 py-2 rounded-xl text-sm"
                              style={{
                                border: `1px solid ${UI.emerald.soft}`,
                                color: UI.emerald.strong,
                                background: "rgba(34,197,94,0.12)",
                              }}
                            >
                              Salvar alterações
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="px-3 py-2 rounded-xl text-sm"
                              style={{ border: `1px solid ${UI.border}` }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {!list.length && (
              <tr>
                <td
                  className="px-3 py-6 text-center text-sm"
                  colSpan={8}
                  style={{ color: UI.muted }}
                >
                  Nenhum vendedor encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs opacity-75">{label}</span>
      {children}
    </label>
  );
}
