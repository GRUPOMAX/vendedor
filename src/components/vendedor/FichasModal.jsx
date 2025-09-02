import React, { useMemo, useState } from 'react';
import dayjs from '../../utils/dayjs';

function parseDataHora(s) {
  const d = dayjs(s, ['DD/MM/YYYY, HH:mm:ss', 'DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DDTHH:mm:ssZ'], true);
  return d.isValid() ? d : null;
}

// Helpers com controle de visibilidade no mobile
const Th = ({ children, showOnMobile = false, className = '' }) => (
  <th
    className={[
      'text-left font-medium p-3 text-text dark:text-dark-text align-middle',
      showOnMobile ? 'table-cell' : 'hidden sm:table-cell',
      className,
    ].join(' ')}
  >
    {children}
  </th>
);

const Td = ({ children, showOnMobile = false, className = '' }) => (
  <td
    className={[
      'p-3 text-text dark:text-dark-text align-middle',
      showOnMobile ? 'table-cell' : 'hidden sm:table-cell',
      className,
    ].join(' ')}
  >
    {children}
  </td>
);

export default function FichasModal({
  isOpen,
  onClose,
  nome,
  fichas = [],
  onEditar, // (venda) => void
}) {
  const [detalhe, setDetalhe] = useState(null);

  const ordenadas = useMemo(
    () =>
      (fichas || [])
        .slice()
        .sort((a, b) => {
          const da = parseDataHora(a?.dataHora);
          const db = parseDataHora(b?.dataHora);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return db.valueOf() - da.valueOf();
        }),
    [fichas]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-[92vw] max-w-[560px] sm:max-w-3xl rounded-2xl border border-border dark:border-dark-border bg-card dark:bg-dark-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-text dark:text-dark-text">
            Fichas · {nome} <span className="opacity-70">({ordenadas.length})</span>
          </h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border dark:border-dark-border hover:bg-background dark:hover:bg-dark-background"
          >
            Fechar
          </button>
        </div>

        {/* tabela responsiva */}
        <div className="rounded-xl border border-border dark:border-dark-border overflow-x-auto sm:overflow-visible">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-background dark:bg-dark-background">
              <tr>
                {/* visíveis no mobile */}
                <Th showOnMobile>Data/Hora</Th>
                <Th showOnMobile>Protocolo</Th>
                <Th showOnMobile className="text-right w-24">Ações</Th>

                {/* escondidos no mobile; aparecem no >= sm */}
                <Th>Plano</Th>
                <Th>Cidade</Th>
                <Th>Bairro</Th>
              </tr>
            </thead>

            <tbody>
              {ordenadas.map((v, idx) => (
                <tr
                  key={idx}
                  className="odd:bg-background dark:odd:bg-dark-background even:bg-card dark:even:bg-dark-card"
                >
                  {/* visíveis no mobile */}
                  <Td showOnMobile className="whitespace-nowrap">{v.dataHora}</Td>
                  <Td showOnMobile className="whitespace-nowrap">{v.protocolo}</Td>
                  <Td showOnMobile className="text-right w-24 whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => setDetalhe(v)}
                        className="px-2 py-1 rounded-lg border border-border dark:border-dark-border hover:bg-card dark:hover:bg-dark-card"
                        title="Ver ficha completa"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-80" fill="currentColor">
                          <path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1v5h5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onEditar?.(v)}
                        className="px-3 py-1.5 rounded-lg border border-border dark:border-dark-border hover:bg-card dark:hover:bg-dark-card"
                        title="Editar status desta venda"
                      >
                        Editar
                      </button>
                    </div>
                  </Td>

                  {/* escondidos no mobile */}
                  <Td>{v.plano}</Td>
                  <Td>{v.cidade}</Td>
                  <Td>{v.bairro}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Submodal: Detalhes da ficha */}
      {detalhe && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetalhe(null)} />
          <div className="relative z-10 w-[92vw] max-w-[560px] sm:max-w-2xl rounded-2xl border border-border dark:border-dark-border bg-card dark:bg-dark-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-text dark:text-dark-text">Dados da Ficha</h3>
              <button
                onClick={() => setDetalhe(null)}
                className="px-3 py-1.5 rounded-lg border border-border dark:border-dark-border hover:bg-background dark:hover:bg-dark-background"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-auto pr-1">
              {[
                ['Protocolo', detalhe.protocolo],
                ['Data/Hora', detalhe.dataHora],
                ['Nome', detalhe.nome],
                ['CPF/CNPJ', detalhe.cpf],
                ['RG', detalhe.rg],
                [
                  'Nascimento',
                  detalhe.dataNascimento ? dayjs(detalhe.dataNascimento).format('DD/MM/YYYY') : ''
                ],
                ['E-mail', detalhe.email],
                ['Telefone 1', detalhe.telefone1],
                ['Telefone 2', detalhe.telefone2],
                ['Telefone 3', detalhe.telefone3],
                ['Cidade', detalhe.cidade],
                ['Bairro', detalhe.bairro],
                ['Rua', detalhe.rua],
                ['Número', detalhe.numero],
                ['CEP', detalhe.cep],
                ['Complemento', detalhe.complemento],
                ['Latitude', detalhe.latitude],
                ['Longitude', detalhe.longitude],
                ['Plano', detalhe.plano],
                ['Streaming', detalhe.streaming],
                ['Vencimento', detalhe.vencimento],
                ['Vendedor', detalhe.vendedor],
                ['Vendedor E-mail', detalhe.vendedorEmail],
                ['Cupom', detalhe.cupom],
                ['Desconto', detalhe.desconto ?? ''],
                ['Tipo residência', detalhe.tipoResidencia],
                ['Empresa?', detalhe.isEmpresa ? 'Sim' : 'Não'],
              ]
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-xl border border-border dark:border-dark-border p-3 bg-background dark:bg-dark-background"
                  >
                    <div className="text-xs opacity-70">{k}</div>
                    <div className="text-sm break-words">{String(v)}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
