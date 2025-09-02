// src/components/pix/PixQrButton.jsx
import React, { useState } from "react";
import { QrCode } from "lucide-react";
import PixQrModal from "./PixQrModal";

/**
 * Props:
 * - vendedor: string
 * - valor: number
 * - getChavePix?: (vendedor) => string | Promise<string>
 * - getDadosPix?: (vendedor) => ({ chave, nomeCadastro } | Promise<...>)
 * - txid?: string
 * - className?: string
 * - title?: string
 * - de?: string
 * - ate?: string
 * - onSent?: (payload) => void
 */
export default function PixQrButton({
  vendedor,
  valor,
  getChavePix,
  getDadosPix,
  txid,
  className = "",
  title = "Gerar QR PIX",
  de,
  ate,
  onSent,
  registrosAntigos = [],
  registroAtual = null,
  Icon = QrCode,
}) {
  const [open, setOpen] = useState(false);
  const [chave, setChave] = useState("");
  const [nomeCadastro, setNomeCadastro] = useState("");

  const openModal = async () => {
    try {
      let k = "", nc = "";
      if (typeof getDadosPix === "function") {
        const d = await getDadosPix(vendedor);
        k = d?.chave || d?.pix || "";
        nc = d?.nomeCadastro || d?.["nome-cadastro"] || d?.nome_cadastro || "";
      } else if (typeof getChavePix === "function") {
        k = await getChavePix(vendedor);
      }
      setChave(k || "");
      setNomeCadastro(nc || "");
    } catch {
      setChave("");
      setNomeCadastro("");
    } finally {
      setOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        title={title}
        onClick={openModal}
       className={`ml-2 inline-flex items-center justify-center rounded-lg border px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 ${className}`}
      >
        <Icon className="w-4 h-4" />
      </button>

      <PixQrModal
        open={open}
        onClose={() => setOpen(false)}
        vendedor={vendedor}
        chavePix={chave}
        valor={valor}
        txid={txid}
        nomeFavorecido={nomeCadastro || vendedor}
        de={de}
        ate={ate}
        onSent={onSent}
        registrosAntigos={registrosAntigos}
        registroAtual={registroAtual}
      />
    </>
  );
}
