import React, { useMemo, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Copy, Download, CheckCircle } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { buildPixPayload, normalizePixKey } from "./pixPayload";

import { fetchFornecedorByNomeCadastro } from "../../../../services/ixcFornecedor";
import { createContaPagar } from "../../../../services/ixcContasApagar";
import { formatDateKey } from "../../../../utils/date";
import dayjs from "../../../../utils/dayjs";
 import {
   salvarRegistroComissao,
   updateRegistroComissao,
   findRegistroComissaoByPeriodo,
} from "../../../../services/nocodbComprovantesPix";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const FORNEC_API_BASE =
  import.meta.env.VITE_IXC_FORNECEDOR_API_BASE ||
  "https://ixc-fornecedor.api.webserver.app.br";

// ------------ helpers locais ------------
const onlyDigits = (s = "") => String(s).replace(/\D/g, "");
function parseRegs(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.rows)) return payload.rows;
  if (payload.data && Array.isArray(payload.data.registros)) return payload.data.registros;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}
async function fetchFornecedorByDoc(doc) {
  const base = FORNEC_API_BASE.replace(/\/$/, "");
  const url = `${base}/api/fornecedor?doc=${encodeURIComponent(onlyDigits(doc))}&_=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) {
    throw new Error(j?.error || j?.message || `Fornecedor API (HTTP ${r.status})`);
  }
  const regs = parseRegs(j);
  if (!regs.length) throw new Error("Sem resultados por documento.");
  const pick = regs[0];
  return {
    id: String(pick.id),
    id_conta: String(pick.id_conta || ""),
    razao: pick.razao,
    fantasia: pick.fantasia,
  };
}

export default function PixQrModal({
  open,
  onClose,
  vendedor,
  chavePix,
  valor,
  txid,
  nomeFavorecido = vendedor,
  cidade = "VIANA",
  de,
  ate,
  onSent,
  registrosAntigos = [],
  registroAtual = null,
}) {
  // estado da UI
  const [manual, setManual] = useState(false); // controla exibição do bloco manual
  const [sent, setSent] = useState(false);
  const [closingIn, setClosingIn] = useState(10);

  // estados do fluxo Modobank
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cpCreated, setCpCreated] = useState(null);

  const closeTimerRef = useRef(null);



  const baseApi = useMemo(() => {
    return (API_BASE && API_BASE.trim()) ? API_BASE : window.location.origin;
  }, []);

  const { deFmt, ateFmt } = useMemo(() => {
    const parse = (x) => {
      const m = dayjs(x, ["YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY"], true);
      return m.isValid() ? m : dayjs(x);
    };

    const d1 = parse(de);
    // força o final do mês da data base
    const ultimoDiaMes = d1.endOf("month");

    return {
      deFmt: d1.isValid() ? d1.format("DD-MM-YYYY") : formatDateKey(de),
      ateFmt: ultimoDiaMes.format("DD-MM-YYYY"),
    };
  }, [de]);

  const txidFinal = useMemo(() => {
    const base = txid || `COMISSAO-${deFmt}-${ateFmt}-${(vendedor || "VEND").slice(0, 10)}`;
    return String(base).slice(0, 25);
  }, [txid, deFmt, ateFmt, vendedor]);

  const payload = useMemo(() => {
    if (!chavePix || !valor) return "";
    return buildPixPayload({
      chave: chavePix,
      valor,
      nome: nomeFavorecido || vendedor || "RECEBEDOR",
      cidade,
      txid: txidFinal,
    });
  }, [chavePix, valor, nomeFavorecido, vendedor, cidade, txidFinal]);

  const fmtMoney = (v) => `R$ ${Number(v || 0).toFixed(2)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(payload); } catch {} };

  const downloadPng = () => {
    const canvas = document.querySelector("#pix-qr-canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `pix_${(vendedor || "vendedor").replace(/\s+/g, "_")}_${Number(valor || 0).toFixed(2)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleSuccess = () => {
    if (sent) return;
    setSent(true);
    setClosingIn(10);

    if (closeTimerRef.current) clearInterval(closeTimerRef.current);
    closeTimerRef.current = setInterval(() => {
      setClosingIn((s) => {
        if (s <= 1) {
          clearInterval(closeTimerRef.current);
          closeTimerRef.current = null;
          onClose?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // Botão principal: Pagar com Modobank
  async function pagarComModobank() {
    try {
      setBusy(true);
      setErr("");
      setCpCreated(null);

      const nomeCadastro = String(nomeFavorecido || vendedor || "").trim();
      if (!nomeCadastro) throw new Error("Nome de cadastro vazio.");

      // normaliza chave e identifica tipo (antes de buscar fornecedor)
      const chave = normalizePixKey(chavePix || "");
      let tipo_pix = "";
      if (/^\d{11}$/.test(chave)) tipo_pix = "CPF_CNPJ";
      else if (/^\d{2,3}\d{8,9}$/.test(chave)) tipo_pix = "CELULAR";
      else if (/@/.test(chave)) tipo_pix = "EMAIL";
      else if (/^[a-zA-Z0-9]{32,}$/.test(chave)) tipo_pix = "ALEATORIA";
      else tipo_pix = "COPIA_E_COLA";

      // 1) tenta por nome → fallback por doc se CPF/CNPJ
      let fornecedor;
      try {
        fornecedor = await fetchFornecedorByNomeCadastro(nomeCadastro);
      } catch (e1) {
        if (tipo_pix === "CPF_CNPJ") {
          try {
            fornecedor = await fetchFornecedorByDoc(chave);
          } catch (e2) {
            throw new Error(
              `Fornecedor não encontrado no IXC para: "${nomeCadastro}" (por nome) e CPF/CNPJ ${onlyDigits(chave)}.`
            );
          }
        } else {
          throw new Error(`Fornecedor não encontrado no IXC para: "${nomeCadastro}".`);
        }
      }

      const id_fornecedor = fornecedor.id;
      const valorStr = Number(valor || 0).toFixed(2).replace(".", ",");

      const hoje = new Date();
      const dd = String(hoje.getDate()).padStart(2, "0");
      const mm = String(hoje.getMonth() + 1).padStart(2, "0");
      const yyyy = hoje.getFullYear();
      const dataBR = `${dd}/${mm}/${yyyy}`;

      const obs = `Comissão de ${deFmt} a ${ateFmt} — Vendedor: ${vendedor} — Valor: R$ ${Number(valor || 0).toFixed(2)}`;

      const contasPayload = {
        id_fornecedor: String(id_fornecedor),
        data_emissao: dataBR,
        data_vencimento: dataBR,
        valor: valorStr,
        id_contas: "17",
        tipo_pagamento: "Pix",
        tipo_pix,
        chave_pix: chave,
        id_conta: "112",
        filial_id: "1",
        obs,
        previsao: "N",
        status: "A",
        liberado: "S",
        status_auditoria: "N",
      };

      if (!contasPayload.id_fornecedor || !contasPayload.valor || !contasPayload.chave_pix) {
        throw new Error("Campos obrigatórios ausentes: fornecedor, valor ou chave Pix.");
      }

      //console.log("[DEBUG] Enviando contasPayload:", contasPayload);
      const criado = await createContaPagar(contasPayload);
      setCpCreated(criado);

      const novoId = (criado?.id != null) ? String(criado.id) : null;
      //console.log("[NocoDB] novoId criado:", novoId);

      // Monta dadosNC com id_antigo para auditoria
      const dadosNC = {
        periodo: { de: deFmt, ate: ateFmt },
        vendedor,
        nomeCadastro: nomeFavorecido,
        valor: Number(valor || 0),
        observacao: obs,
        tipo_pagamento: "Pix",
        createdAt: new Date().toISOString(),
      };

      // Busca o registro anterior para pegar o id_antigo
      const registroAntigo = await findRegistroComissaoByPeriodo({ vendedor: vendedor || nomeFavorecido, de: deFmt, ate: ateFmt });
      const idAntigo = registroAntigo?.registro || null;

      // Chama salvarRegistroComissao uma vez só (lida com update ou create, incluindo id_antigo)
      await salvarRegistroComissao({
        vendedor: vendedor || nomeFavorecido,
        de: deFmt,
        ate: ateFmt,
        registro: novoId,
        dados: dadosNC,
        id_antigo: idAntigo,
      });

      onSent?.({ txid: txidFinal, vendedor: nomeCadastro, valor, url: null });
      handleSuccess();
    } catch (e) {
      setErr(e?.message || "Erro ao processar pagamento Modobank.");
    } finally {
      setBusy(false);
    }
  }


  // cleanup do countdown
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearInterval(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div 
        className="w-full max-w-md bg-white dark:bg-zinc-900  
                   text-zinc-900 dark:text-zinc-100 
                   rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700" 
        onMouseDown={(e) => e.stopPropagation()}
      >
         <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between"> 
         <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">PIX · Comissão</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center gap-3 text-zinc-900 dark:text-zinc-100">
          {/* Cabeçalho */}
          <div className="text-center text-sm text-zinc-600 dark:text-zinc-300">
            <div>Vendedor: <strong>{vendedor}</strong></div>
            {nomeFavorecido && nomeFavorecido !== vendedor && (
              <div>Nome de cadastro: <strong>{nomeFavorecido}</strong></div>
            )}
            <div>Valor: <strong>{fmtMoney(valor)}</strong></div>
            {/* A chave só aparece quando manual = true */}
            {manual && (
              <div>Chave: <strong className="break-all">{normalizePixKey(chavePix)}</strong></div>
            )}
          </div>

          {!!err && (
            <div className="w-full text-sm px-3 py-2 rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {err}
            </div>
          )}

          {sent ? (
            <div className="w-full text-center py-6">
              <div className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xl font-semibold">
                <CheckCircle className="w-6 h-6" />
                Solicitação registrada!
              </div>
              {cpCreated?.id && (
                 <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                  Contas a pagar criado: <strong>#{cpCreated.id}</strong>
                </p>
              )}
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Fechando em {closingIn}s…</p>
              <button
                onClick={onClose}
                className="mt-4 inline-flex items-center justify-center px-3 py-1.5 rounded-lg border text-sm
                          bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800"
              >
                Fechar agora
              </button>
            </div>
          ) : (
            <>
              {/* Ação Modobank */}
              <button
                onClick={pagarComModobank}
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm
                              bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
              >
                {busy ? "Enviando..." : "Pagar com Modobank"}
              </button>

              {/* Botão para revelar pagamento manual */}
              <button
                type="button"
                onClick={() => setManual((v) => !v)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm
                           bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 
                          border-zinc-200 dark:border-zinc-700"
              >
                {manual ? "Ocultar pagamento manual" : "Pagar manualmente"}
              </button>

              {/* Bloco manual (QR + Copia e Cola). Sem 'Enviar comprovante'. */}
              {manual && (
                payload ? (
                  <>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Pague via QR ou use o “Copia e Cola”:</div>
                    <QRCodeCanvas id="pix-qr-canvas" value={payload} size={256} includeMargin />
                    <div className="w-full">
                      <label className="text-xs opacity-70">Copia e Cola</label>
                      <textarea
                        readOnly
                        value={payload}
                        className="w-full mt-1 p-2 rounded-lg border 
                                   bg-white dark:bg-zinc-950  
                                   text-zinc-900 dark:text-zinc-100 
                                   border-zinc-200 dark:border-zinc-700 text-xs h-24"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={copy}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border  
                                   bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800 
                                   text-zinc-900 dark:text-zinc-100 
                                  border-zinc-200 dark:border-zinc-700"
                      >
                        <Copy className="w-4 h-4" /> Copiar
                      </button>
                      <button
                        onClick={downloadPng}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800
+                           text-zinc-900 dark:text-zinc-100
+                           border-zinc-200 dark:border-zinc-700"
                      >
                        <Download className="w-4 h-4" /> Baixar PNG
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-red-600 dark:text-red-400">Chave Pix Não Cadastrada.</div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
