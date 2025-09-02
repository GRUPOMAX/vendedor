import React, { useEffect, useMemo, useState, useRef  } from "react";
import { Plus, Pencil, Trash2, Check, X, Save } from "lucide-react";
import useRegrasComissao from "../../../../../hooks/useRegrasComissao";
import { emitDev } from "../../../../../dev/commandBus";



// -------- helpers de broadcast em ESCOPO DE MODULO --------
const serializeRegras = (arr = []) =>
 (arr || []).map(r => ({
   Id: r.Id,
   ATIVO: !(r.ATIVO === false || r.ATIVO === 0 || r.ATIVO === "false"),
   PRIORIDADE: Number(r.PRIORIDADE ?? 999),
   NOME_REGRA: r.NOME_REGRA || "",
   DESCRICAO: r.DESCRICAO || "",
   TAGS: r.TAGS || "",
   REGRA: r.REGRA, // pode ser string ou objeto
 }));

export const broadcastRegras = (arr) => {
   try {
     const lista = serializeRegras(arr);
     // mesma aba
     emitDev("regras:comissao:changed", { lista });
     // outras abas/janelas
     localStorage.setItem("regras:comissao:lista", JSON.stringify(lista));
     localStorage.setItem("regras:comissao:ping", String(Date.now()));
   // BroadcastChannel (mesma aba/SPA e cross-tab)
   try {
     const ch =
       typeof BroadcastChannel !== "undefined"
         ? new BroadcastChannel("regras:comissao")
         : null;
     ch?.postMessage?.({ type: "regras:comissao:changed", lista });
     ch?.close?.();
   } catch {}
   } catch (e) {
     console.warn("[Regras] broadcast falhou:", e);
   }
 };




function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-lg text-xs border ${
        active
          ? "border-emerald-400 text-emerald-700 bg-emerald-50"
          : "border-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
      }`}
    >
      {children}
    </button>
  );
}

/** ---------------- MODO BÁSICO ---------------- **/
// defaults por tipo
const OPS_BY_TYPE = {
  bool: [{ v: "=", label: "=" }],
  text: [{ v: "=", label: "=" }, { v: "!=", label: "≠" }, { v: "~", label: "contém" }],
};

const BASIC_FIELDS = [
  { key: "semTaxa",       label: "Sem taxa",       type: "bool" },
  { key: "bloqueado",     label: "Bloqueado",      type: "bool" },
  { key: "clienteAtivo", label: "Cliente ativo", type: "bool" },
  { key: "motivo",        label: "Motivo",         type: "text", placeholder: "ex.: resistencia" },
];

// ✅ Regra default usada ao criar nova regra
const DEFAULT_RULE = {
  when: { semTaxa: true },
  calc: { type: "fixo", valorCentavos: 500 },
  stop: true,
};

// ✅ ÚNICA versão de newRow (aceita fieldKey opcional)
function newRow(fieldKey = "semTaxa") {
  const f = BASIC_FIELDS.find((x) => x.key === fieldKey) || BASIC_FIELDS[0];
  return {
    id: crypto.randomUUID(),
    field: f.key,
    op: OPS_BY_TYPE[f.type][0].v,
    value: f.type === "bool" ? true : "",
  };
}


const parseRegra = (raw) => {
  try { return typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {}); }
  catch { return {}; }
};

const objectToBasicRows = (when = {}) => {
  const rows = [];
  for (const [k, v] of Object.entries(when)) {
    if (Array.isArray(v)) v.forEach(val => rows.push({ id: crypto.randomUUID(), field:k, op:"=",  value: val }));
    else if (v && typeof v === "object") {
      if ("ne"   in v) rows.push({ id: crypto.randomUUID(), field:k, op:"!=", value: v.ne });
      if ("like" in v) rows.push({ id: crypto.randomUUID(), field:k, op:"~",  value: v.like });
    } else {
      rows.push({ id: crypto.randomUUID(), field:k, op:"=", value: v });
    }
  }
  return rows.length ? rows : [newRow()];
};


function BasicBuilder({ UI, rows, setRows }) {
  const fieldDef = (k) => BASIC_FIELDS.find(f => f.key === k) || BASIC_FIELDS[0];

  const update = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const add    = () => setRows(rs => [...rs, newRow()]);
  const remove = (id) => setRows(rs => rs.filter(r => r.id !== id));

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const f   = fieldDef(r.field);
        const ops = OPS_BY_TYPE[f.type] || OPS_BY_TYPE.text;

        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2 w-full">
            {/* campo */}
            <select
              value={r.field}
              onChange={(e) => {
                const fk = e.target.value;
                const fd = fieldDef(fk);
                update(r.id, {
                  field: fk,
                  op: OPS_BY_TYPE[fd.type][0].v,
                  value: fd.type === "bool" ? true : "",
                });
              }}
              className="px-2 py-1 rounded-md bg-transparent shrink-0"
              style={{ border:`1px solid ${UI.border}` }}
            >
              {BASIC_FIELDS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>

            {/* operador */}
            <select
              value={r.op}
              onChange={(e) => update(r.id, { op: e.target.value })}
              className="px-2 py-1 rounded-md bg-transparent shrink-0"
              style={{ border:`1px solid ${UI.border}` }}
            >
              {ops.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>

            {/* valor */}
            {f.type === "bool" ? (
              <select
                value={String(r.value)}
                onChange={(e)=> update(r.id, { value: e.target.value === "true" })}
                className="px-2 py-1 rounded-md bg-transparent shrink-0"
                style={{ border:`1px solid ${UI.border}` }}
              >
                <option value="true">Verdadeiro</option>
                <option value="false">Falso</option>
              </select>
            ) : (
              <input
                value={r.value ?? ""}
                onChange={(e)=> update(r.id, { value: e.target.value })}
                placeholder={f.placeholder || ""}
                className="px-2 py-1 rounded-md bg-transparent flex-1 min-w-[160px]"
                style={{ border:`1px solid ${UI.border}` }}
              />
            )}

            {/* Remover sempre “grudado” no fim da linha */}
            <button
              type="button"
              onClick={() => remove(r.id)}
              className="px-2 py-1 rounded-md shrink-0 ml-auto"
              style={{ border:`1px solid ${UI.border}` }}
            >
              Remover
            </button>
          </div>
        );
      })}
      <button type="button" onClick={add} className="px-2 py-1 rounded-md text-xs"
              style={{ border:`1px solid ${UI.border}` }}>
        + condição
      </button>
    </div>
  );
}


/** Converte as linhas do builder em REGRA.when */
function buildWhenFromBasic(rows = []) {
  const when = {};
  const byField = rows.filter(r => r.field && r.op).reduce((acc, r) => {
    (acc[r.field] ||= []).push(r);
    return acc;
  }, {});

  for (const [field, arr] of Object.entries(byField)) {
    const equalsVals = arr.filter(r => r.op === "=").map(r => r.value);
    const neVals     = arr.filter(r => r.op === "!=").map(r => r.value);
    const likeVals   = arr.filter(r => r.op === "~").map(r => r.value);

    if (equalsVals.length === 1) when[field] = equalsVals[0];
    if (equalsVals.length > 1)  when[field] = equalsVals;

    if (neVals.length === 1)    when[field] = { ...(when[field]||{}), ne: neVals[0] };
    if (neVals.length > 1)      when[field] = { ...(when[field]||{}), nin: neVals };

    if (likeVals.length === 1)  when[field] = { ...(when[field]||{}), like: String(likeVals[0]||"") };
  }
  return when;
}

/* valida o shape do JSON REGRA */
function validateRegra(r) {
  const errors = [];
  if (typeof r !== "object" || !r) errors.push("REGRA precisa ser um objeto.");
  const calc = r?.calc || {};
  const type = calc?.type;
  const allowed = ["fixo", "percentual", "ajuste", "minimo", "maximo"];
  if (!allowed.includes(type)) errors.push(`calc.type inválido (${type}). Use ${allowed.join(", ")}.`);

  if (type === "fixo") {
    const usandoClassif = calc.base === "classificacao";
    if (!usandoClassif && typeof calc.valorCentavos !== "number") {
      errors.push("Para 'fixo', informe 'valorCentavos' ou use base='classificacao'.");
    }
  }
  if (type === "percentual" && typeof calc.percentual !== "number") {
    errors.push("calc.percentual numérico é obrigatório para 'percentual'.");
  }
  return { ok: !errors.length, errors };
}


/** --------------- EDITOR --------------- **/
function RuleEditor({ UI, open, onClose, onSubmit, initial }) {
  const [nome, setNome] = useState(initial?.NOME_REGRA || "");
  const [prio, setPrio] = useState(initial?.PRIORIDADE ?? 999);
  const [ativo, setAtivo] = useState(initial?.ATIVO ?? true);
  const [desc, setDesc]   = useState(initial?.DESCRICAO || "");
  const [tags, setTags]   = useState(initial?.TAGS || "");
  const [usarClassificacao, setUsarClassificacao] = useState(false);

  const [mode, setMode] = useState(initial ? "json" : "basic");
  const [basicRows, setBasicRows] = useState([newRow()]);
  const [calcType, setCalcType] = useState("fixo");
  const [valorCent, setValorCent] = useState(500);
  const [percentual, setPercentual] = useState(10);

  const [ruleText, setRuleText] = useState(() => {
    const r = initial?.REGRA;
    return JSON.stringify(
      typeof r === "string" ? JSON.parse(r || "{}") : (r || {
        when: { semTaxa: true },
        calc: { type: "fixo", valorCentavos: 500 },
        stop: true
      }),
      null, 2
    );
  });
  const [err, setErr] = useState("");

// normaliza só o que o dashboard precisa e evita valores estranhos
    const serializeRegras = (arr = []) =>
    (arr || []).map(r => ({
        Id: r.Id,
        ATIVO: !(r.ATIVO === false || r.ATIVO === 0 || r.ATIVO === "false"),
        PRIORIDADE: Number(r.PRIORIDADE ?? 999),
        NOME_REGRA: r.NOME_REGRA || "",
        DESCRICAO: r.DESCRICAO || "",
        TAGS: r.TAGS || "",
        // pode ser string ou objeto; o dashboard aceita ambos
        REGRA: r.REGRA
    }));

    const broadcastRegras = (arr) => {
    try {
        const lista = serializeRegras(arr);
        emitDev("regras:comissao:changed", { lista });                 // mesma aba
        localStorage.setItem("regras:comissao:lista", JSON.stringify(lista)); // outras abas
        localStorage.setItem("regras:comissao:ping", String(Date.now()));     // força refresh
    } catch (e) {
        console.warn("[Regras] broadcast falhou:", e);
    }
    };



    useEffect(() => {
    if (mode !== "basic") return;
    const when = buildWhenFromBasic(basicRows);

    let calc;
    if (calcType === "percentual") {
        calc = { type: "percentual", percentual: Number(percentual || 0) };
    } else if (calcType === "fixo") {
        if (usarClassificacao) {
        // ✅ novo: fixa pelo valor da classificação
        calc = { type: "fixo", base: "classificacao" };
        } else {
        calc = { type: "fixo", valorCentavos: Number(valorCent || 0) };
        }
    } else {
        calc = { type: calcType, valorCentavos: Number(valorCent || 0) };
    }

    const obj = { when, calc, stop: true };
    setRuleText(JSON.stringify(obj, null, 2));
    }, [mode, basicRows, calcType, valorCent, percentual, usarClassificacao]);


  useEffect(() => {
  if (!open) return;

  if (initial) {
    // Campos da esquerda
    setNome(initial.NOME_REGRA || "");
    setPrio(initial.PRIORIDADE ?? 999);
    setAtivo(!(initial.ATIVO === false || initial.ATIVO === 0 || initial.ATIVO === "false"));
    setDesc(initial.DESCRICAO || "");
    setTags(initial.TAGS || "");

    // JSON e builder
    const obj = parseRegra(initial.REGRA);
    setRuleText(JSON.stringify(obj, null, 2));
    setMode("json"); // ao editar, começa no JSON

    setBasicRows(objectToBasicRows(obj.when));
    if (obj.calc?.type === "percentual") {
      setCalcType("percentual");
      setPercentual(Number(obj.calc.percentual || 0));
    } else {
      setCalcType(String(obj.calc?.type || "fixo"));
      setValorCent(Number(obj.calc?.valorCentavos || 0));
    }
  } else {
    // Novo registro
    setNome(""); setPrio(999); setAtivo(true); setDesc(""); setTags("");
    setMode("basic");
    setBasicRows([newRow()]);
    setCalcType("fixo"); setValorCent(500); setPercentual(10);
    setRuleText(JSON.stringify(DEFAULT_RULE, null, 2));
  }
}, [initial, open]);

// dentro do RuleEditor
useEffect(() => {
  if (mode !== "basic") return;

  // tenta montar linhas a partir do JSON atual do editor
  try {
    const obj  = JSON.parse(ruleText || "{}");
    const when = obj?.when || {};
    const rows = [];

    for (const [field, val] of Object.entries(when)) {
      const f = BASIC_FIELDS.find(x => x.key === field);
      if (!f) continue;

      // valor simples
      if (typeof val !== "object" || val === null || Array.isArray(val)) {
        if (Array.isArray(val)) {
          // vários "="
          val.forEach(v => rows.push(newRowFrom(field, "=", v)));
        } else {
          rows.push(newRowFrom(field, "=", val));
        }
        continue;
      }
      // operadores
      if ("ne"   in val) rows.push(newRowFrom(field, "!=",  val.ne));
      if ("nin"  in val && Array.isArray(val.nin))  val.nin.forEach(v => rows.push(newRowFrom(field, "!=", v)));
      if ("like" in val) rows.push(newRowFrom(field, "~",   val.like));
    }

    setBasicRows(rows.length ? rows : [newRow()]);

    // hidrata tipo de cálculo
    const c = obj?.calc || {};
    if (c.type === "percentual") {
      setCalcType("percentual");
      setPercentual(Number(c.percentual || 0));
    } else {
      const t = ["fixo","ajuste","minimo","maximo"].includes(c.type) ? c.type : "fixo";
      setCalcType(t);
      setValorCent(Number(c.valorCentavos || 0));
    }
  } catch {
    // se o JSON estiver inválido, não trava o builder
  }

  // helper local
  function newRowFrom(field, op, value) {
    const row = newRow(field);
    row.op = op;
    row.value = BASIC_FIELDS.find(b=>b.key===field)?.type === "bool"
      ? (value === true || value === "true")
      : (value ?? "");
    return row;
  }
}, [mode]);  // roda quando muda pra "basic"



  const save = () => {
    try {
      setErr("");
      const parsed = JSON.parse(ruleText || "{}");
      const { ok, errors } = validateRegra(parsed);
      if (!ok) { setErr(errors.join("\n")); return; }
      onSubmit?.({
        NOME_REGRA: nome.trim(),
        PRIORIDADE: Number(prio || 999),
        ATIVO: !!ativo,
        DESCRICAO: desc,
        TAGS: tags,
        REGRA: parsed
      });
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[min(980px,96vw)] max-h-[90vh] overflow-hidden rounded-2xl"
           style={{ background: UI.cardBg, color: UI.text, border: `1px solid ${UI.border}` }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom:`1px solid ${UI.border}` }}>
          <div className="flex items-center gap-2"><b>{initial ? "Editar regra" : "Nova regra"}</b></div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setMode("basic")}
              className={`px-2 py-1 rounded-lg text-xs border ${mode==="basic"?"border-emerald-400 text-emerald-700 bg-emerald-50":"border-zinc-300"}`}>
              Modo básico
            </button>
            <button onClick={()=>setMode("json")}
              className={`px-2 py-1 rounded-lg text-xs border ${mode==="json"?"border-emerald-400 text-emerald-700 bg-emerald-50":"border-zinc-300"}`}>
              JSON
            </button>
            <button onClick={onClose} className="px-2 py-1 rounded-lg" style={{ border:`1px solid ${UI.border}` }}>
              <X className="w-4 h-4"/>
            </button>
          </div>
        </div>

        <div className="p-4 grid md:grid-cols-2 gap-4 overflow-auto max-h-[72vh]">
          {/* Lado esquerdo */}
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs opacity-75">Nome da regra</span>
              <input value={nome} onChange={e=>setNome(e.target.value)}
                     className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                     style={{ border:`1px solid ${UI.border}` }}/>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs opacity-75">Prioridade</span>
                <input type="number" value={prio} onChange={e=>setPrio(e.target.value)}
                       className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                       style={{ border:`1px solid ${UI.border}` }}/>
              </label>
              <label className="block space-y-1">
                <span className="text-xs opacity-75">Ativo</span>
                <select value={String(ativo)} onChange={e=>setAtivo(e.target.value==="true")}
                        className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                        style={{ border:`1px solid ${UI.border}` }}>
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs opacity-75">Descrição</span>
              <input value={desc} onChange={e=>setDesc(e.target.value)}
                     className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                     style={{ border:`1px solid ${UI.border}` }}/>
            </label>

            <label className="block space-y-1">
              <span className="text-xs opacity-75">Tags (livre)</span>
              <input value={tags} onChange={e=>setTags(e.target.value)}
                     className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                     style={{ border:`1px solid ${UI.border}` }}/>
            </label>

            {/* Builder básico */}
            {mode === "basic" && (
              <div className="rounded-2xl p-3 space-y-3" style={{ border:`1px solid ${UI.border}` }}>
                <div className="text-xs font-semibold">Condições (SE)</div>
                <BasicBuilder UI={UI} rows={basicRows} setRows={setBasicRows} />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <label className="block space-y-1">
                    <span className="text-xs opacity-75">Tipo de cálculo</span>
                    <select value={calcType} onChange={e=>setCalcType(e.target.value)}
                            className="w-full px-2 py-1 rounded bg-transparent"
                            style={{ border:`1px solid ${UI.border}` }}>
                      <option value="fixo">fixo</option>
                      <option value="percentual">percentual</option>
                      <option value="ajuste">ajuste (+/-)</option>
                      <option value="minimo">mínimo</option>
                      <option value="maximo">máximo</option>
                    </select>
                  </label>
                  {calcType === "percentual" ? (
                    <label className="block space-y-1">
                      <span className="text-xs opacity-75">% (0-100)</span>
                      <input type="number" value={percentual} onChange={e=>setPercentual(Number(e.target.value||0))}
                             className="w-full px-2 py-1 rounded bg-transparent"
                             style={{ border:`1px solid ${UI.border}` }}/>
                    </label>
                  ) : (
                    <label className="block space-y-1">
                      <span className="text-xs opacity-75">Valor (centavos)</span>
                      <input type="number" value={valorCent} onChange={e=>setValorCent(Number(e.target.value||0))}
                             className="w-full px-2 py-1 rounded bg-transparent"
                             style={{ border:`1px solid ${UI.border}` }}/>
                    </label>
                  )}
                  {calcType === "fixo" && (
                    <label className="flex items-center gap-2 text-xs">
                        <input
                        type="checkbox"
                        checked={usarClassificacao}
                        onChange={(e)=> setUsarClassificacao(e.target.checked)}
                        />
                        Usar valor total da classificação
                    </label>
                    )}

                </div>
              </div>
            )}
          </div>

          {/* Lado direito – JSON */}
          <div className="flex flex-col">
            <label className="block space-y-1 flex-1">
              <span className="text-xs opacity-75">JSON da regra</span>
              <textarea
                value={ruleText}
                onChange={e=>setRuleText(e.target.value)}
                className="w-full h-[380px] md:h-[520px] px-3 py-2 rounded-xl bg-transparent outline-none font-mono text-xs"
                style={{ border:`1px solid ${UI.border}` }}
                spellCheck={false}
              />
            </label>
            {err && <div className="mt-2 text-xs text-red-500 whitespace-pre-wrap">{err}</div>}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm" style={{ border:`1px solid ${UI.border}` }}>
                Cancelar
              </button>
              <button onClick={save}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                style={{ border:`1px solid ${UI.emerald.soft}`, color: UI.emerald.strong, background:"rgba(34,197,94,0.12)" }}>
                <Save className="w-4 h-4"/> Salvar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ UI, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-[min(420px,92vw)] rounded-2xl p-4"
           style={{ background: UI.cardBg, color: UI.text, border: `1px solid ${UI.border}` }}>
        <div className="text-base font-semibold mb-2">Excluir regra?</div>
        <div className="text-sm" style={{ color: UI.muted }}>Essa ação não pode ser desfeita.</div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-xl text-sm" style={{ border:`1px solid ${UI.border}` }}>
            Cancelar
          </button>
          <button onClick={onConfirm} className="px-3 py-2 rounded-xl text-sm text-white"
                  style={{ background:"#e11d48", border:`1px solid #e11d48` }}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

/** ---------------- LISTAGEM + MODAL WRAPPER ---------------- **/
export default function RegrasComissaoTab({ UI }) {
  const { items, loading, error, add, patch, remove } = useRegrasComissao();
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const list = useMemo(
    () => (items || []).slice().sort((a, b) => (a.PRIORIDADE ?? 999) - (b.PRIORIDADE ?? 999)),
    [items]
  );

  const didMountRef = useRef(false);
    useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (Array.isArray(items)) broadcastRegras(items);
    }, [items]);

  const startNew  = () => { setEditing(null); setOpenEditor(true); };
  const startEdit = (row) => { setEditing(row); setOpenEditor(true); };

    const handleSave = async (data) => {
        if (!editing) await add(data); else await patch(editing.Id, data);
        setOpenEditor(false);
        if (Array.isArray(items)) broadcastRegras(items); // ping imediato
        };


    const toggleAtivo = async (row) => {
        await patch(row.Id, { ATIVO: !(row.ATIVO ?? true) });
        if (Array.isArray(items)) broadcastRegras(items);
        };


    const confirmDelete = async () => {
        const id = confirmId;
        setConfirmId(null);
        if (!id) return;
        await remove(id);
        if (Array.isArray(items)) broadcastRegras(items);
        };



  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: UI.muted }}>
          Cadastre regras de comissão. A ordem é definida pela <b>Prioridade</b> (menor primeiro).
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ border: `1px solid ${UI.border}` }}
        >
          <Plus className="w-4 h-4" /> Nova regra
        </button>
      </div>

      {loading && <div className="text-sm" style={{ color: UI.muted }}>Carregando…</div>}
      {error && <div className="text-sm text-red-500">Erro: {error}</div>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${UI.border}` }}>
          <table className="w-full text-sm">
            <thead style={{ background: UI.tableHeadBg, color: UI.muted }}>
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Prioridade</th>
                <th className="px-3 py-2 text-left">Ativo</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.Id} style={{ borderTop: `1px solid ${UI.border}` }}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.NOME_REGRA || "—"}</div>
                    {r.DESCRICAO ? <div className="text-xs opacity-60">{r.DESCRICAO}</div> : null}
                  </td>
                  <td className="px-3 py-2">{r.PRIORIDADE ?? "—"}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => toggleAtivo(r)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${
                        r.ATIVO ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-zinc-300"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {r.ATIVO ? "Sim" : "Não"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(r)}
                        className="p-2 rounded-xl"
                        style={{ border: `1px solid ${UI.border}` }}
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmId(r.Id)}
                        className="p-2 rounded-xl"
                        style={{ border: `1px solid ${UI.border}` }}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm" colSpan={4} style={{ color: UI.muted }}>
                    Nenhuma regra cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal editor */}
        <RuleEditor
        key={openEditor ? (editing?.Id ?? "new") : "closed"} // <- importante
        UI={UI}
        open={openEditor}
        onClose={() => setOpenEditor(false)}
        onSubmit={handleSave}
        initial={editing}
        />

      {/* Modal confirmação */}
      {confirmId && <ConfirmModal UI={UI} onCancel={() => setConfirmId(null)} onConfirm={confirmDelete} />}
    </div>
  );
}
