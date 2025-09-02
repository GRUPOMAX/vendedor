// pages/admin/components/config/ConfigModal.jsx
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, UsersRound, Percent, UserPlus, Settings, ListChecks, Shield } from "lucide-react";
import { useUI } from "../../../../state/ThemeContext";
import VendedoresTab from "./tabs/VendedoresTab";
import ComissoesTab from "./tabs/ComissoesTab";
import NovoVendedorTab from "./tabs/NovoVendedorTab";
import useConfigVendedores from "../../../admin/hooks/useConfigVendedores";
import RegrasComissaoTab from "./tabs/RegrasComissaoTab";
import RegrasConexaoTab from "./tabs/RegrasConexaoTab"; // 👈 NOVO

const TABS = [
  { key: "vendedores",     label: "Vendedores Cadastrados", icon: UsersRound },
  { key: "comissoes",      label: "Comissões Cadastradas",  icon: Percent },
  { key: "regras",         label: "Regras de Comissão",      icon: ListChecks },
  { key: "regrasConexao",  label: "Regras de Conexão (IP)",  icon: Shield }, // 👈 NOVO
  { key: "novo",           label: "Cadastrar Novo Vendedor", icon: UserPlus },
];

export default function ConfigModal({
  open,
  onClose,
  comissoes = [],
  onDeleteVendedor,
  onSaveComissoes,
}) {
  const UI = useUI();
  const [tab, setTab] = useState("vendedores");

  // WHOAMI da API (env) → fallback "/whoami"
  const V = (typeof import.meta !== "undefined" && import.meta.env) || {};
  const WHOAMI_URL = ((V.VITE_API_BASE || "").replace(/\/$/, "") || "") + "/whoami";

  // agora também traz o createVendedor do hook
  const {
    lista: vendedores,
    loading,
    error,
    updateVendedor,
    createVendedor,
  } = useConfigVendedores();

  if (!open) return null;

  let ActiveTab = null;

  if (tab === "vendedores") {
    ActiveTab = (
      <>
        {loading && <p className="text-sm text-zinc-400">Carregando vendedores…</p>}
        {error && <p className="text-sm text-red-400">Erro: {error}</p>}
        {!loading && !error && (
          <VendedoresTab
            UI={UI}
            vendedores={vendedores}
            onUpdateVendedor={(vend, patch) => updateVendedor(vend.nome, patch)}
            onDeleteVendedor={onDeleteVendedor}
          />
        )}
      </>
    );
  } else if (tab === "regras") {
    ActiveTab = <RegrasComissaoTab UI={UI} />;
  } else if (tab === "regrasConexao") {
    // 👇 Novo Tab de regras de conexão (IP allow/deny)
    ActiveTab = <RegrasConexaoTab UI={UI} whoamiUrl={WHOAMI_URL} />;
  } else if (tab === "comissoes") {
    ActiveTab = <ComissoesTab UI={UI} comissoes={comissoes} onSave={onSaveComissoes} />;
  } else if (tab === "novo") {
    const classificacoes = Array.from(new Set((comissoes || []).map((r) => r?.nome).filter(Boolean)));
    ActiveTab = (
      <NovoVendedorTab
        UI={UI}
        classificacoes={classificacoes}
        onSubmit={async (data) => {
          await createVendedor(data);
          setTab("vendedores");
        }}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl shadow-2xl m-0 sm:m-4"
        style={{ background: UI.cardBg, color: UI.text }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6" style={{ borderBottom: `1px solid ${UI.border}` }}>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-xl sm:text-2xl font-semibold">Configurações do Sistema</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl" style={{ border: `1px solid ${UI.border}` }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="px-4 sm:px-6 pt-4">
          <div className="flex flex-wrap gap-2">
            {TABS.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                  style={{
                    border: `1px solid ${active ? UI.emerald.soft : UI.border}`,
                    background: active ? "rgba(34,197,94,0.12)" : "transparent",
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Corpo */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[72vh]">{ActiveTab}</div>
      </div>
    </div>,
    document.body
  );
}
