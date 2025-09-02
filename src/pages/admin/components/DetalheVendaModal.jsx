// components/DetalheVendaModal.jsx
import React, { useEffect, useState } from "react";
import { X as XIcon, Receipt, IdCard, Phone, MapPin, Mail, ArrowLeftRight } from "lucide-react";
import { useUI } from "../../../state/ThemeContext";
import ClienteMapaModal from "./ClienteMapaModal";

// ⬇️ imports para abrir o modal de status e recarregar status do NocoDB
import EditarStatusClienteModal from "../../../components/vendedor/EditarStatusClienteModal";
import { readCpfStatus, formatDoc } from "../../../services/nocodbVendedores";

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const maskCpfCnpj = (s) => {
  const d = onlyDigits(s);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return s || "—";
};
const get = (o, ...ks) => { for (const k of ks) if (o && o[k] != null) return o[k]; return undefined; };
const nz = (v, def = "—") => (v === undefined || v === null || String(v).trim() === "" ? def : v);

// Normaliza datas para DD/MM/AAAA (aceita "YYYY-MM-DD", "DD/MM/YYYY", e "DD/MM/YYYY HH:mm:ss")
const toBRDate = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s) return "—";
  const mDMY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,T].*)?$/);
  if (mDMY) return `${mDMY[1]}/${mDMY[2]}/${mDMY[3]}`;
  const mYMD = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (mYMD) return `${mYMD[3]}/${mYMD[2]}/${mYMD[1]}`;
  return s;
};

export default function DetalheVendaModal({ open, onClose, venda = {}, statusMap }) {
  const UI = useUI();
  const [openMap, setOpenMap] = useState(false);

  // ⬇️ novo: abrir/fechar o modal de status (alteração de titularidade)
  const [openEditarStatus, setOpenEditarStatus] = useState(false);
  // ⬇️ novo: status recarregado após salvar no modal de status
  const [freshStatus, setFreshStatus] = useState(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // zera o freshStatus ao abrir
  useEffect(() => { if (open) setFreshStatus(null); }, [open]);

  if (!open) return null;

  // ---- Campos principais (com múltiplos aliases)
  const protocolo   = nz(get(venda, "protocolo", "Protocolo"));
  const nome        = nz(get(venda, "nome", "Nome", "cliente", "Cliente"));
  const cpfRaw      = nz(get(venda, "cpf", "CPF", "documento", "cpfCliente", "cpf_cliente"), "");
  const cpfCnpj     = maskCpfCnpj(cpfRaw);
  const rg          = nz(get(venda, "rg", "RG", "rgCliente"));
  const dataNasc    = toBRDate(get(venda, "dataNascimento", "nascimento", "dtNascimento"));
  const email       = nz(get(venda, "email", "Email"));
  const tel1        = nz(get(venda, "telefone1", "fone1", "telefone"));
  const tel2        = nz(get(venda, "telefone2", "fone2"));
  const tel3        = nz(get(venda, "telefone3", "fone3"));
  const cidade      = nz(get(venda, "cidade", "Cidade"));
  const bairro      = nz(get(venda, "bairro", "Bairro"));
  const rua         = nz(get(venda, "rua", "logradouro", "endereco", "Endereço"));
  const numero      = nz(get(venda, "numero", "número", "Numero"));
  const cep         = nz(get(venda, "cep", "CEP"));
  const complemento = nz(get(venda, "complemento", "Complemento"));
  const latRaw      = nz(get(venda, "latitude", "lat"));
  const lngRaw      = nz(get(venda, "longitude", "lng"));
  const parseNum = (s) => {
    const x = String(s || "").replace(",", ".").trim();
    if (!x || /não informada/i.test(x)) return null;
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };
  const latNum = parseNum(latRaw);
  const lngNum = parseNum(lngRaw);
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum);

  const plano       = nz(get(venda, "plano", "Plano"));
  const streaming   = nz(get(venda, "streaming", "Streaming"));
  const vencimento  = nz(get(venda, "vencimento", "Vencimento"));
  const vendedor    = nz(get(venda, "__vendedorNome", "vendedor", "Vendedor"));
  const vendedorEmail = nz(get(venda, "vendedorEmail", "emailVendedor"));
  const cupom       = nz(get(venda, "cupom", "Cupom"));
  const desconto    = nz(get(venda, "desconto", "Desconto"), 0);
  const isEmpresa   = get(venda, "isEmpresa", "empresa");
  const tipoResid   = nz(get(venda, "tipoResidencia", "residencia"));
  const valor       = get(venda, "valor", "Valor", "preco", "price", "total");
  const dtRaw       = nz(get(venda, "dataHora", "data", "createdAt", "Data"), "");
  let dataHora;
  try { const d = new Date(dtRaw); dataHora = Number.isNaN(+d) ? String(dtRaw) : d.toLocaleString("pt-BR"); }
  catch { dataHora = String(dtRaw || "—"); }

  // Status mostrado: prefere o que foi recarregado após salvar
  const status = (() => {
    const key = onlyDigits(cpfRaw);
    const s = freshStatus ?? statusMap?.[key];
    if (!s) return null;
    return {
      pagou:      (s["Pagou Taxa"] || s.pagouTaxa || "").toString().toUpperCase(),
      bloqueado:  (s["Bloqueado"]  || "").toString().toUpperCase(),
      ativado:    (s["Ativado"]    || "").toString().toUpperCase(),
      desistiu:   (s["Desistiu"]   || "").toString().toUpperCase(),
      autorizado: (s["Autorizado"] || "").toString().toUpperCase(),
    };
  })();

  const Row = ({ label, value, mono }) => (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div className={mono ? "tabular-nums" : ""}>{nz(value)}</div>
    </div>
  );

  const Badge = ({ children }) => (
    <span className="px-2 py-0.5 rounded-lg text-xs border bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800">
      {children}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* CARD com HEADER/CONTENT/FOOTER e SCROLL INTERNO */}
      <div className="p-4 space-y-6 overflow-y-auto custom-scroll">


      <div className="absolute inset-x-0 top-10 mx-auto w-[min(860px,94vw)] max-h-[85vh] rounded-2xl border bg-white border-zinc-200 shadow-xl dark:bg-zinc-950 dark:border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-semibold">Dados da venda</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900" aria-label="Fechar">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="p-4 space-y-6 overflow-y-auto">
          {/* Resumo */}
          <section>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Row label="Cliente" value={nome} />
              <Row label="CPF/CNPJ" value={cpfCnpj} mono />
              <Row label="Vendedor" value={vendedor} />
              <Row label="Plano" value={plano} />
              <Row label="Data/Hora" value={dataHora} />
              <Row label="Protocolo" value={protocolo} mono />
              {valor != null && (
                <Row
                  label="Valor"
                  value={Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  mono
                />
              )}
            </div>
          </section>

          {/* Documentos */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <IdCard className="w-4 h-4 opacity-70" />
              <h4 className="font-medium">Documentos</h4>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Row label="RG" value={rg} />
              <Row label="Data de Nascimento" value={dataNasc} />
              <Row label="Cliente é Empresa?" value={isEmpresa === true ? "SIM" : isEmpresa === false ? "NÃO" : nz(isEmpresa)} />
              <Row label="Tipo de Residência" value={tipoResid} />
            </div>
          </section>

          {/* Contato */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-4 h-4 opacity-70" />
              <h4 className="font-medium">Contato</h4>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Row label="E-mail" value={email} />
              <Row label="Telefone 1" value={tel1} />
              <Row label="Telefone 2" value={tel2} />
              <Row label="Telefone 3" value={tel3} />
            </div>
          </section>

          {/* Endereço */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 opacity-70" />
              <h4 className="font-medium">Endereço</h4>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Row label="Cidade" value={cidade} />
              <Row label="Bairro" value={bairro} />
              <Row label="Rua" value={rua} />
              <Row label="Número" value={numero} mono />
              <Row label="CEP" value={cep} mono />
              <Row label="Complemento" value={complemento} />
              {hasCoords && <Row label="Latitude" value={latNum} mono />}
              {hasCoords && <Row label="Longitude" value={lngNum} mono />}
            </div>
            {hasCoords && (
              <div className="mt-2">
                <button
                  onClick={() => setOpenMap(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm
                             bg-white border-zinc-200 hover:bg-zinc-50
                             dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900">
                  <MapPin className="w-4 h-4" />
                  Ver no mapa
                </button>
              </div>
            )}
          </section>

          {/* Contrato / Opções */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4 opacity-70" />
              <h4 className="font-medium">Contrato</h4>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Row label="Streaming" value={streaming} />
              <Row label="Vencimento" value={vencimento} />
              <Row label="Cupom" value={cupom} />
              <Row label="Desconto" value={desconto} mono />
              <Row label="E-mail do Vendedor" value={vendedorEmail} />
            </div>
          </section>

          {/* Status do cliente (se disponível) */}
          {status && (
            <section>
              <div className="text-xs opacity-60 mb-1">Status do cliente</div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-sm
                                  bg-white border-zinc-200 hover:bg-zinc-50
                                  dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900">
                  <ArrowLeftRight className="w-4 h-4" />
                  <button onClick={() => setOpenEditarStatus(true)}>
                    Marcar Alteração de Titularidade
                  </button>
                </span>
                <Badge>Pagou Taxa: {status.pagou || "—"}</Badge>
                <Badge>Ativado: {status.ativado || "—"}</Badge>
                <Badge>Bloqueado: {status.bloqueado || "—"}</Badge>
                <Badge>Desistiu: {status.desistiu || "—"}</Badge>
                <Badge>Autorizado: {status.autorizado || "—"}</Badge>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border text-sm
                       bg-white border-zinc-200 hover:bg-zinc-50
                       dark:bg-zinc-950 dark:border-zinc-800 dark:hover:bg-zinc-900">
            Fechar
          </button>
        </div>
      </div>

      
      </div>
      {hasCoords && (
        <ClienteMapaModal
          open={openMap}
          onClose={() => setOpenMap(false)}
          lat={latNum}
          lng={lngNum}
          nome={nome}
          endereco={{ cidade, bairro, rua, numero }}
        />
      )}

      {/* Modal de edição de status / titularidade */}
      <EditarStatusClienteModal
        isOpen={openEditarStatus}
        onClose={() => setOpenEditarStatus(false)}
        venda={{ cpf: cpfRaw, nome, protocolo }}
        vendedorNome={vendedor}
        onSaved={async () => {
          // recarrega status do NocoDB para refletir no detalhe
          const doc = formatDoc(onlyDigits(cpfRaw));
          const found = await readCpfStatus(doc).catch(() => null);
          setFreshStatus(found?.status || null);
        }}
      />
    </div>
  );
}
