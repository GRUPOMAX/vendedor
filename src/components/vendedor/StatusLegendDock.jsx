import React, { useMemo, useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react';

/** normaliza strings do NocoDB */
function norm(v) {
  return (v || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function guessCPF(r) {
  return String(r?.cpf || r?.CPF || r?.documento || r?.cpfCliente || r?.cpf_cliente || '').replace(/\D/g, '');
}

function isTransferencia(cliente) {
  const a = norm(cliente?.['Alterar Titularidade']);
  // considera SIM ou qualquer campo do titular anterior preenchido
  return a === 'sim'
    || !!cliente?.['Titular Anterior Nome']
    || !!cliente?.['Titular Anterior Documento']
    || !!cliente?.['Titular Anterior Obs'];
}

function isAllNullStatus(cliente) {
  if (!cliente) return true;
  const keys = ['Pagou Taxa', 'Bloqueado', 'Ativado', 'Desistiu', 'Autorizado'];
  return keys.every((k) => cliente[k] == null || cliente[k] === '');
}



/** espelha a lógica do StatusIcon */
function avaliarStatus(cliente) {
  // se todos os campos são nulos/vazios, não classifica
  if (isAllNullStatus(cliente)) return 'sem_status';

  const pagouTaxa = norm(cliente?.['Pagou Taxa']);
  const bloqueado  = norm(cliente?.['Bloqueado']);
  const ativado    = norm(cliente?.['Ativado']);
  const desistiu   = norm(cliente?.['Desistiu']);
  const autorizado = norm(cliente?.['Autorizado']);

  if (desistiu === 'sim') return 'desistiu';
  if (bloqueado === 'sim') return 'bloqueado';
  if (ativado === 'sim' && autorizado === 'aprovado' && pagouTaxa !== 'sim') return 'aprovado_sem_taxa';
  if (ativado === 'sim' && pagouTaxa === 'sim') return 'ok';
  return 'pendencia';
}

const LEGEND_META = {
  transferencia: { label: 'Alteração de Titularidade', Icon: ArrowLeftRight, className: 'text-indigo-500' },
  desistiu: { label: 'Desistiu', Icon: XCircle, className: 'text-red-500' },
  bloqueado: { label: 'Bloqueado', Icon: XCircle, className: 'text-red-500' },
  aprovado_sem_taxa: { label: 'Aprovado (sem taxa)', Icons: [AlertTriangle, CheckCircle], classes: ['text-yellow-500', 'text-green-500'] },
  ok: { label: 'OK (Ativado e pagou taxa)', Icon: CheckCircle, className: 'text-green-500' },
  pendencia: { label: 'Pendência', Icon: AlertTriangle, className: 'text-yellow-500' },
};

/**
 * Dock lateral recolhível (esquerda). Fica com uma aba sempre visível.
 * Props:
 * - registros: linhas que estão na tabela (idealmente já deduplicadas)
 * - mapaClientes: {cpf -> status do cliente}
 * - initialOpen: bool
 * - showCounts: bool
 */
export default function StatusLegendDock({
  registros = [],
  mapaClientes = {},
  initialOpen = false,
  showCounts = true,
}) {
  const [open, setOpen] = useState(initialOpen);
  const contagem = useMemo(() => {
    const c = { transferencia: 0, desistiu: 0, bloqueado: 0, aprovado_sem_taxa: 0, ok: 0, pendencia: 0 };

    for (const r of registros) {
      const cpf = guessCPF(r);
      const cliente = mapaClientes?.[cpf];

      // 1) transferência tem prioridade e não entra nas outras classes
      if (isTransferencia(cliente)) {
        c.transferencia += 1;
        continue;
      }

      // 2) se todos os campos de status são nulos/vazios, ignora (não é pendência)
      if (isAllNullStatus(cliente)) {
        continue;
      }

      // 3) avalia normalmente
      const codigo = avaliarStatus(cliente);
      if (codigo !== 'sem_status') {
        c[codigo] = (c[codigo] || 0) + 1;
      }
    }

    return c;
  }, [registros, mapaClientes]);


  const hasPendencia = contagem.pendencia > 0; // Nova variável para verificar pendências

  const itens = Object.entries(contagem).filter(([, q]) => q > 0);
  if (!itens.length) {
    // mesmo sem itens, mantemos a aba para não “pular” a UI
    return (
      <DockFrame
        open={open}
        toggle={() => setOpen((o) => !o)}
        onOutsideClose={() => setOpen(false)} // ← fecha ao clicar fora/ESC
        hasPendencia={hasPendencia} // Passamos a prop para o DockFrame
      >
        <EmptyLegend />
      </DockFrame>
    );
  }
  return (
    <DockFrame
      open={open}
      toggle={() => setOpen((o) => !o)}
      onOutsideClose={() => setOpen(false)} // ← fecha ao clicar fora/ESC
      hasPendencia={hasPendencia} // Passamos a prop para o DockFrame
    >
      <div className="text-sm font-medium mb-3 text-text dark:text-dark-text flex items-center gap-2">
        <Info className="w-4 h-4 opacity-70" />
        Legenda de status
      </div>
      <ul className="space-y-2">
        {itens.map(([codigo, qtd]) => {
          const meta = LEGEND_META[codigo];
          if (meta.Icons) {
            const [I1, I2] = meta.Icons;
            const [c1, c2] = meta.classes;
            return (
              <li key={codigo} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <I1 className={`${c1} w-4 h-4`} />
                    <I2 className={`${c2} w-4 h-4`} />
                  </span>
                  <span className="text-sm">{meta.label}</span>
                </div>
                {showCounts && <span className="text-xs opacity-70">{qtd}</span>}
              </li>
            );
          }
          const Icon = meta.Icon;
          return (
            <li key={codigo} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon className={`${meta.className} w-4 h-4`} />
                <span className="text-sm">{meta.label}</span>
              </div>
              {showCounts && <span className="text-xs opacity-70">{qtd}</span>}
            </li>
          );
        })}
      </ul>
    </DockFrame>
  );
}

/** Moldura do dock com a aba/handle e animação */
/** Moldura do dock com botão DENTRO ao abrir e botão discreto ao fechar */
function DockFrame({ open, toggle, onOutsideClose, children, hasPendencia }) { // Adicionamos hasPendencia como prop
  const ref = useRef(null);
  useEffect(() => {
    const handleDown = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onOutsideClose?.();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onOutsideClose?.();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown, { passive: true });
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onOutsideClose]);

  return (
    <div className="hidden lg:block">
      {/* PAINEL */}
      <div
        ref={ref}
        className={[
          'fixed z-40 left-0 top-28 h-[35vh] w-[280px]',
          'transition-transform duration-300',
          // fechado: some 100% (sem aba aparecendo)
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="relative h-full rounded-r-2xl border border-border dark:border-dark-border bg-card dark:bg-dark-card shadow">
          {/* BOTÃO DE FECHAR — DENTRO DO CARD */}
          {open && (
            <button
              onClick={toggle}
              title="Recolher legenda"
              aria-label="Recolher legenda"
              className={[
                'absolute top-2 right-2 h-8 w-8 rounded-lg',
                'border border-border dark:border-dark-border',
                'bg-background/70 dark:bg-dark-background/70',
                'backdrop-blur hover:bg-background dark:hover:bg-dark-background',
                'flex items-center justify-center',
              ].join(' ')}
            >
              {/* aberto → mostra seta para a ESQUERDA (vai recolher) */}
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {/* CONTEÚDO */}
          <div className="p-4 h-full overflow-y-auto">{children}</div>
        </div>
      </div>
      {/* BOTÃO DE ABRIR — DISCRETO, ALINHADO, QUANDO FECHADO */}
      {!open && (
        <button
          onClick={toggle}
          title="Abrir legenda"
          aria-label="Abrir legenda"
          className={[
            'fixed z-30 left-2 top-32 h-8 w-8 rounded-lg',
            'border border-border dark:border-dark-border',
            'bg-card dark:bg-dark-card shadow flex items-center justify-center',
            'hover:bg-background dark:hover:bg-dark-background',
            hasPendencia ? 'border-yellow-500 bg-yellow-100/50 dark:bg-yellow-900/50' : '', //
          ].join(' ')}
        >
          {/* ícone de warning se houver pendência, senão seta normal */}
          {hasPendencia ? (
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

function EmptyLegend() {
  return (
    <div className="text-sm text-text dark:text-dark-text opacity-70 flex items-center gap-2">
      <Info className="w-4 h-4" />
      Sem itens para exibir
    </div>
  );
}