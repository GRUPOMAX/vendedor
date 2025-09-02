import React, { useState } from "react";
import { Settings } from "lucide-react";
import { useUI } from "../../../../state/ThemeContext";
import ConfigModal from "./ConfigModal";

export default function ConfigButton({
  vendedores = [],
  comissoes = [],
  onCreateVendedor,
  onUpdateVendedor,
  onDeleteVendedor,
  onSaveComissoes,
  className = "",
  children,
}) {
  const UI = useUI();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl transition ${className}`}
        style={{ border: `1px solid ${UI.border}` }}
      >
        <Settings className="w-4 h-4" />
        {children || "Configurações"}
      </button>

      <ConfigModal
        open={open}
        onClose={() => setOpen(false)}
        vendedores={vendedores}
        comissoes={comissoes}
        onCreateVendedor={onCreateVendedor}
        onUpdateVendedor={onUpdateVendedor}
        onDeleteVendedor={onDeleteVendedor}
        onSaveComissoes={onSaveComissoes}
      />
    </>
  );
}
