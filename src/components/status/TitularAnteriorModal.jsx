import { useEffect, useState } from "react";
import { onlyDigits } from "../../services/nocodbVendedores";
import { parseTitularAnterior, titularAnteriorObsTemplate } from "../../utils/ixc";


export default function TitularAnteriorModal({ open, onClose, initial, onSave }) {
  const [nome, setNome] = useState(initial?.nome || "");
  const [doc, setDoc]   = useState(initial?.doc || "");
  const [obs, setObs]   = useState(initial?.obs || "");

  useEffect(() => {
    if (!open) return;

    const nomeI = initial?.nome || "";
    const docI  = initial?.doc || "";
    const obsI  = initial?.obs || "";

    // aplica valores vindos do pai
    setNome(nomeI);
    setDoc(docI);
    setObs(obsI);

    // se nome/doc vierem vazios, tenta extrair do texto das observações
    if ((!nomeI || !docI) && obsI) {
      try {
        const parsed = parseTitularAnterior(obsI); // <- usa o mesmo parser
        if (!nomeI && parsed.nome) setNome(parsed.nome);
        if (!docI  && parsed.doc)  setDoc(onlyDigits(parsed.doc));
      } catch {
        // silencioso
      } 
        // se já temos nome/doc, mas obs está vazia → preenche no padrão
        if (!obsI && (nomeI || docI)) {
          setObs(titularAnteriorObsTemplate(nomeI, onlyDigits(docI)));
        }
    }
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border dark:border-dark-border bg-card dark:bg-dark-card text-text dark:text-dark-text shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-dark-border">
          <h3 className="text-lg font-semibold">Registrar Titular Anterior</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 hover:bg-background dark:hover:bg-dark-background">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="Nome do titular anterior">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 bg-background dark:bg-dark-background border-border dark:border-dark-border outline-none focus:ring-2"
            />
          </Field>

          <Field label="CPF/CNPJ do titular anterior">
            <input
              value={doc}
              onChange={(e) => setDoc(onlyDigits(e.target.value))}
              className="w-full rounded-xl border px-3 py-2 bg-background dark:bg-dark-background border-border dark:border-dark-border outline-none focus:ring-2"
              placeholder="Somente números"
            />
          </Field>

          <Field label="Observações">
            <textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 bg-background dark:bg-dark-background border-border dark:border-dark-border outline-none focus:ring-2"
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border dark:border-dark-border">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border dark:border-dark-border hover:bg-background dark:hover:bg-dark-background">
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave?.({ nome: nome.trim(), doc: onlyDigits(doc), obs: obs.trim() });
              onClose?.();
            }}
            className="px-4 py-2 rounded-xl bg-background dark:bg-dark-card"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
