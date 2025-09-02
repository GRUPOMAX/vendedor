import { useEffect, useMemo, useState } from 'react';
import { readClassificacao, updateClassificacao } from '../../services/vendedorNivelService';
import { pesoVendaParaXP } from '../../utils/progressoNivel';

const LEVELS = [
  { key: 'Ouro', min: 0 },
  { key: 'Diamante', min: 20 },
  { key: 'Mestre', min: 40 },
  { key: 'Lenda', min: 60 },
];

// ⬇️ substitua sua calcularVendasValidasParaXP por esta versão
function calcularVendasValidasParaXP(registros, mapaClientes) {
  return registros.reduce((acc, venda, i) => {
    const cpf = String(venda?.cpf || venda?.CPF || venda?.documento || '').replace(/\D/g, '');
    const cliente = mapaClientes?.[cpf];

    // Transferência não dá XP
    if (isTransferenciaLocal(cliente)) {
      // console.log(`[XP] Venda ${i}: ${venda.nome} | CPF: ${cpf} | Transferência: sem XP`);
      return acc;
    }

    const peso = pesoVendaParaXP(cliente);
    // console.log(`[XP] Venda ${i}: ${venda.nome} | CPF: ${cpf} | Peso: ${peso}`);
    return acc + (Number.isFinite(peso) ? peso : 0);
  }, 0);
}



// ⬇️ add perto do topo deste arquivo
function isTransferenciaLocal(cliente) {
  const norm = (v) =>
    (v || '').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const alter = norm(cliente?.['Alterar Titularidade']);
  return alter === 'sim'
    || !!cliente?.['Titular Anterior Nome']
    || !!cliente?.['Titular Anterior Documento']
    || !!cliente?.['Titular Anterior Obs'];
}


function levelFromSales(sales) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (sales >= lvl.min) current = lvl;
  }
  return current;
}

function nextLevel(currentKey) {
  const idx = LEVELS.findIndex(l => l.key === currentKey);
  if (idx < 0 || idx === LEVELS.length - 1) return null;
  return LEVELS[idx + 1];
}

function percentToNext(sales, currentKey) {
  const cur = LEVELS.find(l => l.key === currentKey);
  const nxt = nextLevel(currentKey);
  if (!cur || !nxt) return 100;
  const span = (nxt.min - cur.min) || 1;
  const done = Math.min(Math.max(sales - cur.min, 0), span);
  return Math.round((done / span) * 100);
}

export default function VendedorXPBar({
  vendedorKey,
  vendedorNome,
  registros = [],
  mapaClientes = {},
  autoUpdate = true,
  onUpdated,
}) {
  const [carregando, setCarregando] = useState(true);
  const [classificacaoAtual, setClassificacaoAtual] = useState(null);

  const vendasMensais = useMemo(() => {
    return calcularVendasValidasParaXP(registros, mapaClientes);
  }, [registros, mapaClientes]);

  const nivelCalculado = useMemo(() => levelFromSales(vendasMensais), [vendasMensais]);

  const progresso = useMemo(() => {
    const atualIndex = LEVELS.findIndex(l => l.key === classificacaoAtual);
    const calculadoIndex = LEVELS.findIndex(l => l.key === nivelCalculado.key);
    const nivelBase = (calculadoIndex < atualIndex) ? classificacaoAtual : nivelCalculado.key;
    return percentToNext(vendasMensais, nivelBase || 'Ouro');
  }, [vendasMensais, classificacaoAtual, nivelCalculado]);

  useEffect(() => {
    let alive = true;
    async function boot() {
      try {
        setCarregando(true);
        const cls = await readClassificacao(vendedorKey);
        if (alive) setClassificacaoAtual(cls || 'Ouro');
      } catch (e) {
        console.error('VendedorXPBar read error:', e);
        if (alive) setClassificacaoAtual('Ouro');
      } finally {
        if (alive) setCarregando(false);
      }
    }
    boot();
    return () => { alive = false; };
  }, [vendedorKey]);

  useEffect(() => {
    const deveAtualizar = (
      !carregando &&
      autoUpdate &&
      classificacaoAtual &&
      nivelCalculado.key &&
      LEVELS.findIndex(l => l.key === nivelCalculado.key) >
      LEVELS.findIndex(l => l.key === classificacaoAtual)
    );

    if (deveAtualizar) {
      handleApply(nivelCalculado.key);
    }
  }, [carregando, classificacaoAtual, nivelCalculado, autoUpdate]);

  async function handleApply(novoNivel) {
    try {
      setCarregando(true);
      await updateClassificacao(vendedorKey, novoNivel);
      onUpdated?.(novoNivel);
    } catch (e) {
      console.error('VendedorXPBar update error:', e);
      alert('Falha ao atualizar a classificação no NocoDB.');
    } finally {
      setCarregando(false);
    }
  }

  const mudou = classificacaoAtual && nivelCalculado.key && classificacaoAtual !== nivelCalculado.key;

  return (
    <div className="w-full p-5 rounded-2xl bg-card dark:bg-dark-card border border-border dark:border-dark-border shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-text dark:text-dark-text">
          {vendedorNome && <span className="font-medium">{vendedorNome} · </span>}
          <span>Vendas no mês: <b>{vendasMensais}</b></span>
        </div>
        <div className="text-sm text-text dark:text-dark-text">
          Nível atual:&nbsp;
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-white">
            {classificacaoAtual || '...'}
          </span>
          {mudou && (
            <span className="ml-2 text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-800 border border-amber-300 dark:border-amber-600 text-amber-900 dark:text-amber-100">
              Novo: <b>{nivelCalculado.key}</b>
            </span>
          )}
        </div>
      </div>

      <div className="relative w-full h-3 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div
          className="h-full transition-all duration-500 ease-out bg-gradient-to-r from-blue-500 to-indigo-600 dark:from-emerald-400 dark:to-emerald-600"
          style={{ width: `${progresso}%` }}
          title={`${progresso}%`}
        />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-text dark:text-dark-text">
        <span>
          {progresso >= 100
            ? 'Nível máximo atingido!'
            : `Progresso até o próximo nível: ${progresso}%`}
        </span>
        <div className="flex-1" />
        {!autoUpdate && mudou && (
          <button
            disabled={carregando}
            onClick={() => handleApply(nivelCalculado.key)}
            className="px-3 py-1 rounded-md border border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Aplicar nível
          </button>
        )}
      </div>
    </div>
  );
}