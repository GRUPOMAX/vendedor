import { useEffect, useMemo, useState } from 'react';
import { listarVendedores } from '../services/vendedoresService';
import { getControleVendas } from '../services/controleVendas';
import { getComissoes } from '../services/comissaoService';
import { getIndicacoes } from '../services/indicacoesService';
import { startOfMonth, today } from '../utils/date';
import { downloadCSV } from '../utils/csv';

export default function AdminDashboard() {
  const [vendList, setVendList] = useState([]);
  const [filtros, setFiltros] = useState({ dateFrom: startOfMonth(), dateTo: today(), vendedor: '' });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [rows, setRows] = useState([]);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErro(null);
        const [vendedores, ctrl, , indAll] = await Promise.all([
          listarVendedores(),
          getControleVendas(filtros),
          getComissoes(),
          getIndicacoes({ vendedor: filtros.vendedor || undefined }),
        ]);
        setVendList(vendedores);

        const idxVend = Object.fromEntries(
          vendedores.map((v) => [v.vendedor?.toLowerCase(), v])
        );
        const porV = new Map();
        for (const r of ctrl.list || []) {
          const k = (r.Vendedor || r.Title || '').toLowerCase();
          const cur = porV.get(k) || { vendas: 0, receita: 0 };
          cur.vendas += 1;
          porV.set(k, cur);
        }
        const table = Array.from(porV.entries())
          .map(([k, m]) => {
            const meta = idxVend[k] || { vendedor: k, email: '' };
            const indicacoes = (indAll.list || []).filter(
              (x) => (x.Vendedor || '').toLowerCase() === k
            ).length;
            return {
              vendedor: meta.vendedor,
              email: meta.email,
              vendas: m.vendas,
              receita: m.receita,
              indicacoes,
            };
          })
          .sort((a, b) => b.vendas - a.vendas);

        const totVendas = table.reduce((s, x) => s + x.vendas, 0);
        const totReceita = table.reduce((s, x) => s + (x.receita || 0), 0);
        setRows(table);
        setCards([
          { label: 'Total de Vendas', value: totVendas },
          {
            label: 'Receita Estimada',
            value: totReceita.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }),
          },
          { label: 'Vendedores no Período', value: table.length },
        ]);
      } catch (e) {
        setErro(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [filtros.dateFrom, filtros.dateTo, filtros.vendedor]);

  function handleExport() {
    if (!rows.length) return;
    downloadCSV(
      `admin_${filtros.dateFrom}_a_${filtros.dateTo}.csv`,
      rows.map((r) => ({
        Vendedor: r.vendedor,
        Email: r.email,
        Vendas: r.vendas,
        Receita: r.receita,
        Indicacoes: r.indicacoes,
      }))
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-text dark:text-dark-text">
        Admin · Dashboard
      </h1>
      <FilterBar
        filtros={filtros}
        vendList={vendList}
        onChange={(p) => setFiltros((s) => ({ ...s, ...p }))}
        onExport={handleExport}
      />
      {loading ? (
        <div className="animate-pulse text-text dark:text-dark-text">Carregando…</div>
      ) : erro ? (
        <div className="text-red-400">Erro: {erro}</div>
      ) : (
        <>
          <Cards cards={cards} />
          <Table rows={rows} />
        </>
      )}
    </div>
  );
}

function FilterBar({ filtros, vendList, onChange, onExport }) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
      <div>
        <label className="text-xs text-text dark:text-dark-text">De</label>
        <input
          type="date"
          value={filtros.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })}
          className="bg-card dark:bg-dark-card border border-border dark:border-dark-border rounded-xl px-3 py-2 text-text dark:text-dark-text"
        />
      </div>
      <div>
        <label className="text-xs text-text dark:text-dark-text">Até</label>
        <input
          type="date"
          value={filtros.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })}
          className="bg-card dark:bg-dark-card border border-border dark:border-dark-border rounded-xl px-3 py-2 text-text dark:text-dark-text"
        />
      </div>
      <div className="grow">
        <label className="text-xs text-text dark:text-dark-text">Vendedor</label>
        <select
          value={filtros.vendedor}
          onChange={(e) => onChange({ vendedor: e.target.value })}
          className="w-full bg-card dark:bg-dark-card border border-border dark:border-dark-border rounded-xl px-3 py-2 text-text dark:text-dark-text"
        >
          <option value="">Todos</option>
          {vendList.map((v) => (
            <option key={v.vendedor} value={v.vendedor}>
              {v.vendedor}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={onExport}
        className="bg-background dark:bg-dark-card text-text dark:text-dark-text rounded-xl px-4 py-2 font-medium hover:opacity-90"
      >
        Exportar CSV
      </button>
    </div>
  );
}

function Cards({ cards }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border dark:border-dark-border p-4 bg-card dark:bg-dark-card"
        >
          <div className="text-text dark:text-dark-text text-xs uppercase">
            {c.label}
          </div>
          <div className="text-2xl font-semibold mt-1 text-text dark:text-dark-text">
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Table({ rows }) {
  return (
    <div className="rounded-2xl border border-border dark:border-dark-border overflow-hidden">
      <table className="w-full text-sm text-text dark:text-dark-text">
        <thead className="bg-card dark:bg-dark-card">
          <tr><Th>Vendedor</Th><Th>Email</Th><Th>Vendas</Th><Th>Receita</Th><Th>Indicações</Th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="odd:bg-background dark:odd:bg-dark-background even:bg-card dark:even:bg-dark-card"
            >
              <Td>{r.vendedor}</Td>
              <Td className="truncate max-w-[260px]">{r.email}</Td>
              <Td>{r.vendas}</Td>
              <Td>
                {Number(r.receita || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </Td>
              <Td>{r.indicacoes}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }) => (
  <th className="text-left font-medium p-3 text-text dark:text-dark-text">
    {children}
  </th>
);
const Td = ({ children, className = '' }) => (
  <td className={`p-3 text-text dark:text-dark-text ${className}`}>
    {children}
  </td>
);