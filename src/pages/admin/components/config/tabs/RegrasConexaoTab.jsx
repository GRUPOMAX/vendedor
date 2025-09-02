import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Save, Zap, ShieldBan, ShieldCheck, Globe } from "lucide-react";
// Substitua pelo seu hook real (similar ao useRegrasComissao)
// Deve expor: { items, loading, error, add, patch, remove }
// Campos esperados no NocoDB (tabela AUTH_IP_RULES):
//  - ATIVO (bool)
//  - PRIORIDADE (number)
//  - NOME_REGRA (string)
//  - DESCRICAO (string)
//  - TAGS (string)
//  - PATTERN (string) → 177.55.*.* | 177.55.0.0/16 | 203.0.113.42
//  - ACAO (string) → "allow" | "deny"
//  - ROLE (string) → "any" | "Admin" | "Vendedor" | ...
import useRegrasConexao from "../../../../../hooks/useRegrasConexao";
// opcional
let _emitDev = null;
try { _emitDev = (await import("../../../../../dev/commandBus")).emitDev } catch {}

// ────────────────────────────────────────────────────────────────────────────────
// Broadcast cross‑tab/SPA
const serializeRules = (arr = []) =>
  (arr || []).map((r) => ({
    Id: r.Id,
    ATIVO: !(r.ATIVO === false || r.ATIVO === 0 || r.ATIVO === "false"),
    PRIORIDADE: Number(r.PRIORIDADE ?? 999),
    NOME_REGRA: r.NOME_REGRA || "",
    DESCRICAO: r.DESCRICAO || "",
    TAGS: r.TAGS || "",
    PATTERN: String(r.PATTERN || r.pattern || ""),
    ACAO: (r.ACAO || r.action || "allow").toLowerCase(),
    ROLE: r.ROLE || r.role || "any",
  }));

export const broadcastRegrasConexao = (arr) => {
  try {
    const lista = serializeRules(arr);
    // mesma aba
    _emitDev?.("regras:conexao:changed", { lista });
    // outras abas/janelas
    localStorage.setItem("regras:conexao:lista", JSON.stringify(lista));
    localStorage.setItem("regras:conexao:ping", String(Date.now()));
    // BroadcastChannel
    try {
      const ch = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("regras:conexao") : null;
      ch?.postMessage?.({ type: "regras:conexao:changed", lista });
      ch?.close?.();
    } catch {}
  } catch (e) {
    console.warn("[RegrasConexao] broadcast falhou:", e);
  }
};

// ────────────────────────────────────────────────────────────────────────────────
// Helpers de IP (compatíveis com o servidor)
function ip4ToInt(ip) {
  const m = String(ip).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return ((+m[1] << 24) >>> 0) + ((+m[2] << 16) >>> 0) + ((+m[3] << 8) >>> 0) + (+m[4] >>> 0);
}
function matchCidrV4(ip, cidr) {
  const [base, bitsStr] = String(cidr).split("/");
  const bits = Number(bitsStr);
  if (!Number.isFinite(bits)) return false;
  const ipInt = ip4ToInt(ip);
  const baseInt = ip4ToInt(base);
  if (ipInt == null || baseInt == null) return false;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}
function ipMatchesPattern(ip, pattern) {
  if (!pattern) return false;
  pattern = String(pattern).trim();
  if (pattern.includes("/")) {
    if (/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(pattern)) return matchCidrV4(ip, pattern);
    return ip === pattern; // fallback simples (ex.: IPv6 literal/sem CIDR)
  }
  if (pattern.includes("*")) {
    const re = new RegExp(
      "^" +
        pattern
          .split(".")
          .map((p) => (p === "*" ? "\\d+" : p.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&")))
          .join("\\.") +
        "$"
    );
    return re.test(ip);
  }
  return ip === pattern;
}
function decideAccess(ip, role = "any", rules = [], defaultAction = "allow") {
  let decision = defaultAction === "deny" ? "deny" : "allow";
  for (const r of rules) {
    const RROLE = (r.ROLE || r.role || "any").toString();
    const RPATTERN = r.PATTERN || r.pattern;
    if (RROLE !== "any" && RROLE !== role) continue;
    if (ipMatchesPattern(ip, RPATTERN)) {
      decision = (r.ACAO || r.action || "allow").toLowerCase();
      break;
    }
  }
  return decision;
}

// ────────────────────────────────────────────────────────────────────────────────
function ConfirmModal({ UI, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div
        className="relative w-[min(420px,92vw)] rounded-2xl p-4"
        style={{ background: UI.cardBg, color: UI.text, border: `1px solid ${UI.border}` }}
      >
        <div className="text-base font-semibold mb-2">Excluir regra?</div>
        <div className="text-sm" style={{ color: UI.muted }}>
          Essa ação não pode ser desfeita.
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-xl text-sm" style={{ border: `1px solid ${UI.border}` }}>
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-2 rounded-xl text-sm text-white"
            style={{ background: "#e11d48", border: `1px solid #e11d48` }}
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

function PatternHelp({ UI }) {
  return (
    <div className="text-xs rounded-xl p-2" style={{ border: `1px solid ${UI.border}`, background: UI.subtle }}>
      <div className="font-semibold mb-1">Formas aceitas:</div>
      <ul className="list-disc pl-4 space-y-1">
        <li><code>203.0.113.42</code> (IP exato)</li>
        <li><code>177.55.*.*</code> (curinga por octeto)</li>
        <li><code>177.55.0.0/16</code> (CIDR v4)</li>
        <li>Outros formatos (ex.: IPv6 literal) serão comparados por igualdade simples.</li>
      </ul>
    </div>
  );
}

function RuleEditor({ UI, open, onClose, onSubmit, initial, whoamiUrl = "/whoami" }) {
  const [nome, setNome] = useState(initial?.NOME_REGRA || "");
  const [prio, setPrio] = useState(initial?.PRIORIDADE ?? 999);
  const [ativo, setAtivo] = useState(initial?.ATIVO ?? true);
  const [desc, setDesc] = useState(initial?.DESCRICAO || "");
  const [tags, setTags] = useState(initial?.TAGS || "");

  const [pattern, setPattern] = useState(String(initial?.PATTERN || initial?.pattern || ""));
  const [acao, setAcao] = useState((initial?.ACAO || initial?.action || "allow").toLowerCase());
  const [role, setRole] = useState(initial?.ROLE || initial?.role || "any");

  const [ipTest, setIpTest] = useState("");
  const [decision, setDecision] = useState(null);
  const [err, setErr] = useState("");

  const [subjectType, setSubjectType] = useState(
  initial?.SUBJECT_TYPE || ((initial?.ROLE && initial.ROLE !== "any") ? "role" : "global")
  );
  const [subjectValue, setSubjectValue] = useState(
    initial?.SUBJECT_VALUE || ((initial?.ROLE && initial.ROLE !== "any") ? initial.ROLE : "")
  );


  useEffect(() => {
    if (!open) return;
    // Init no abrir
    setNome(initial?.NOME_REGRA || "");
    setPrio(initial?.PRIORIDADE ?? 999);
    setAtivo(!(initial?.ATIVO === false || initial?.ATIVO === 0 || initial?.ATIVO === "false"));
    setDesc(initial?.DESCRICAO || "");
    setTags(initial?.TAGS || "");
    setPattern(String(initial?.PATTERN || initial?.pattern || ""));
    setAcao((initial?.ACAO || initial?.action || "allow").toLowerCase());
    setRole(initial?.ROLE || initial?.role || "any");
    setIpTest("");
    setDecision(null);
    setErr("");
    setSubjectType(initial?.SUBJECT_TYPE || ((initial?.ROLE && initial.ROLE !== "any") ? "role" : "global"));
    setSubjectValue(initial?.SUBJECT_VALUE || ((initial?.ROLE && initial.ROLE !== "any") ? initial.ROLE : ""));

  }, [open, initial]);

  const validate = () => {
    const errors = [];
    if (!pattern.trim()) errors.push("Informe um padrão de IP");
    if (!/^(allow|deny)$/i.test(String(acao))) errors.push("Ação inválida (use allow ou deny)");
    // Avisos amigáveis (não bloqueiam):
    if (pattern.includes("/")) {
      if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(pattern)) {
        // pode ser IPv6 literal -> só alertar
        // noop
      }
    } else if (pattern.includes("*")) {
      if (!/^((\*|\d{1,3})\.){3}(\*|\d{1,3})$/.test(pattern)) {
        errors.push("Padrão com * inválido (use formato v4 com * por octeto)");
      }
    } else {
      // exato v4? se não combinar, ok (pode ser IPv6 ou hostname fixo)
    }
    return { ok: errors.length === 0, errors };
  };

  const testMatch = () => {
    const ok = ipMatchesPattern(ipTest, pattern);
    setDecision(ok ? acao : "(sem efeito)→depende da próxima regra/ação padrão");
  };

  const fillMyIP = async () => {
    try {
      const r = await fetch(whoamiUrl, { headers: { Accept: "application/json" } });
      const ct = r.headers.get("content-type") || "";
      const body = await r.text();
      let ip;

      if (ct.includes("application/json")) {
        try {
          const j = JSON.parse(body);
          ip = j?.ip || j?.address || j?.clientIp;
        } catch {}
      }
      if (!ip) {
        // tenta extrair IPv4 mesmo se vier HTML
        const m = body.match(/(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}/);
        if (m) ip = m[0];
      }

      if (ip) setIpTest(ip);
      else console.warn("/whoami sem IP. Resposta:", body.slice(0, 120));
    } catch (e) {
      console.warn("/whoami falhou:", e);
    }
  };


  const save = () => {
    const { ok, errors } = validate();
    if (!ok) {
      setErr(errors.join("\n"));
      return;
    }
    onSubmit?.({
      NOME_REGRA: nome.trim(),
      PRIORIDADE: Number(prio || 999),
      ATIVO: !!ativo,
      DESCRICAO: desc,
      TAGS: tags,
      PATTERN: pattern.trim(),
      ACAO: acao.toLowerCase(),
      // 👇 alvo (GLOBAL | ROLE | EMAIL) 
      SUBJECT_TYPE: subjectType,                            // "global" | "role" | "email" 
      SUBJECT_VALUE: subjectType === "global" ? "" : subjectValue.trim(),
    });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-[min(860px,96vw)] max-h-[90vh] overflow-hidden rounded-2xl"
        style={{ background: UI.cardBg, color: UI.text, border: `1px solid ${UI.border}` }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${UI.border}` }}>
          <div className="flex items-center gap-2">
            <b>{initial ? "Editar regra de conexão" : "Nova regra de conexão"}</b>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-2 py-1 rounded-lg" style={{ border: `1px solid ${UI.border}` }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 grid md:grid-cols-2 gap-4 overflow-auto max-h-[72vh]">
          {/* Lado esquerdo */}
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs opacity-75">Nome da regra</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                style={{ border: `1px solid ${UI.border}` }}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs opacity-75">Prioridade</span>
                <input
                  type="number"
                  value={prio}
                  onChange={(e) => setPrio(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                  style={{ border: `1px solid ${UI.border}` }}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs opacity-75">Ativo</span>
                <select
                  value={String(ativo)}
                  onChange={(e) => setAtivo(e.target.value === "true")}
                  className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                  style={{ border: `1px solid ${UI.border}` }}
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs opacity-75">Padrão de IP</span>
              <input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="ex.: 177.55.*.* ou 177.55.0.0/16"
                className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                style={{ border: `1px solid ${UI.border}` }}
              />
            </label>

              <div className="grid grid-cols-2 gap-3">
                {/* 50% — Ação */}
                <label className="block space-y-1">
                  <span className="text-xs opacity-75">Ação</span>
                  <select
                    value={acao}
                    onChange={(e) => setAcao(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                    style={{ border: `1px solid ${UI.border}` }}
                  >
                    <option value="allow">allow</option>
                    <option value="deny">deny</option>
                  </select>
                </label>

                {/* 50% — Alvo */}
                <label className="block space-y-1">
                  <span className="text-xs opacity-75">Alvo</span>
                  <select
                    value={subjectType}
                    onChange={(e) => setSubjectType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                    style={{ border: `1px solid ${UI.border}` }}
                  >
                    <option value="global">GLOBAL</option>
                    <option value="role">ROLE</option>
                    <option value="email">EMAIL</option>
                  </select>
                </label>

                {/* 100% — Valor do alvo (apenas quando não for GLOBAL) */}
                {subjectType !== "global" && (
                  <label className="block space-y-1 col-span-2">
                    <span className="text-xs opacity-75">
                      {subjectType === "role" ? "Valor do role" : "E-mail exato"}
                    </span>
                    <input
                      value={subjectValue}
                      onChange={(e) => setSubjectValue(e.target.value)}
                      placeholder={subjectType === "role" ? "ex.: Admin, Vendedor" : "ex.: joao@empresa.com"}
                      className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                      style={{ border: `1px solid ${UI.border}` }}
                    />
                  </label>
                )}
              </div>



            <label className="block space-y-1">
              <span className="text-xs opacity-75">Descrição</span>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                style={{ border: `1px solid ${UI.border}` }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs opacity-75">Tags</span>
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-transparent outline-none"
                style={{ border: `1px solid ${UI.border}` }}
              />
            </label>

            <PatternHelp UI={UI} />
          </div>

          {/* Lado direito – Simulador */}
            {/* Lado direito – Simulador (novo) */}
            <div className="flex flex-col">
              <div
                className="rounded-2xl overflow-hidden flex flex-col"
                style={{ border: `1px solid ${UI.border}`, background: UI.subtle }}
              >
                {/* Cabeçalho */}
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: `1px solid ${UI.border}`, background: UI.cardBg }}
                >
                  <div className="text-sm font-semibold">Simular contra esta regra</div>

                  {/* Badge de resultado */}
                  {decision ? (
                    <span
                      className={`inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-xl border ${
                        decision === "allow"
                          ? "border-emerald-300 text-emerald-700"
                          : "border-rose-300 text-rose-700"
                      }`}
                      style={{ background: decision === "allow" ? "rgba(16,185,129,.10)" : "rgba(244,63,94,.10)" }}
                    >
                      {decision === "allow" ? "allow" : "deny"}
                    </span>
                  ) : (
                    <span className="text-xs opacity-60">—</span>
                  )}
                </div>

                {/* Conteúdo */}
                <div className="p-4 space-y-3">
                  {/* IP + Meu IP */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block space-y-1 col-span-2">
                      <span className="text-xs opacity-75">IP para teste</span>
                      <div className="flex gap-2">
                        <input
                          value={ipTest}
                          onChange={(e) => setIpTest(e.target.value)}
                          placeholder="203.0.113.42"
                          className="w-full px-3 py-2 rounded-xl bg-white/50 dark:bg-transparent outline-none"
                          style={{ border: `1px solid ${UI.border}` }}
                        />
                        <button
                          type="button"
                          onClick={fillMyIP}
                          className="px-3 py-2 rounded-xl text-xs"
                          title="Usar meu IP (via /whoami)"
                          style={{ border: `1px solid ${UI.border}`, background: UI.cardBg }}
                        >
                          🌐 Meu IP
                        </button>
                      </div>
                    </label>

                    {/* Role de teste */}
                    <label className="block space-y-1">
                      <span className="text-xs opacity-75">Role</span>
                      <input
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white/50 dark:bg-transparent outline-none"
                        style={{ border: `1px solid ${UI.border}` }}
                      />
                    </label>
                  </div>

                  {/* Resumo da regra (compacto) */}
                  <div
                    className="text-xs rounded-xl p-2 flex flex-wrap gap-x-3 gap-y-1"
                    style={{ border: `1px solid ${UI.border}`, background: UI.cardBg }}
                  >
                    <div><b>Padrão:</b> <code>{pattern || "—"}</code></div>
                    <div><b>Ação:</b> {acao}</div>
                     <div><b>Alvo:</b> {subjectType.toUpperCase()} 
                                        {subjectType !== "global" ? ` → ${subjectValue || "—"}` : ""}</div>
                  </div>

                  {/* Ações de teste */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={testMatch}
                      className="px-3 py-2 rounded-xl"
                      style={{ border: `1px solid ${UI.border}`, background: UI.cardBg }}
                    >
                      Testar
                    </button>
                    <span className="text-xs opacity-60">
                      {decision
                        ? (decision === "allow" ? "IP corresponde → allow" : "IP corresponde → deny")
                        : "Sem decisão ainda"}
                    </span>
                  </div>

                  {/* Erros/avisos */}
                  {err && <div className="text-xs text-rose-500 whitespace-pre-wrap">{err}</div>}

                  {/* Dica de formatos */}
                  <div className="text-[11px] rounded-xl p-2"
                      style={{ border: `1px solid ${UI.border}`, background: UI.cardBg }}>
                    <b>Formas aceitas:</b> 203.0.113.42 • 177.55.*.* • 177.55.0.0/16 • IPv6 literal (igualdade simples)
                  </div>
                </div>

                {/* Rodapé sticky */}
                <div
                  className="px-4 py-3 flex items-center justify-end gap-2"
                  style={{ borderTop: `1px solid ${UI.border}`, background: UI.cardBg }}
                >
                  <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm"
                          style={{ border: `1px solid ${UI.border}` }}>
                    Cancelar
                  </button>
                    <button 
                      onClick={save} 
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm" 
                      style={{ border: `1px solid ${UI.emerald.soft}`, color: UI.emerald.strong, background: "rgba(34,197,94,0.12)" }} 
                    > 
                      <Save className="w-4 h-4" /> Salvar
                    </button>
                </div>
              </div>
            </div>

        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────────
export default function RegrasConexaoTab({ UI, whoamiUrl = "/whoami" }) {
  const { items, loading, error, add, patch, remove } = useRegrasConexao();

  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  const list = useMemo(
    () => (items || []).slice().sort((a, b) => (a.PRIORIDADE ?? 999) - (b.PRIORIDADE ?? 999)),
    [items]
  );

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (Array.isArray(items)) broadcastRegrasConexao(items);
  }, [items]);

  const startNew = () => {
    setEditing(null);
    setOpenEditor(true);
  };
  const startEdit = (row) => {
    setEditing(row);
    setOpenEditor(true);
  };

  const handleSave = async (data) => {
    if (!editing) await add(data);
    else await patch(editing.Id, data);
    setOpenEditor(false);
    if (Array.isArray(items)) broadcastRegrasConexao(items); // ping imediato
  };

  const toggleAtivo = async (row) => {
    await patch(row.Id, { ATIVO: !(row.ATIVO ?? true) });
    if (Array.isArray(items)) broadcastRegrasConexao(items);
  };

  const confirmDelete = async () => {
    const id = confirmId;
    setConfirmId(null);
    if (!id) return;
    await remove(id);
    if (Array.isArray(items)) broadcastRegrasConexao(items);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: UI.muted }}>
          Cadastre regras de <b>conexão</b> (IP allow/deny). A ordem é definida pela <b>Prioridade</b> (menor primeiro).
        </div>
        <button onClick={startNew} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl" style={{ border: `1px solid ${UI.border}` }}>
          <Plus className="w-4 h-4" /> Nova regra
        </button>
      </div>

      {loading && (
        <div className="text-sm" style={{ color: UI.muted }}>
          Carregando…
        </div>
      )}
      {error && <div className="text-sm text-rose-500">Erro: {String(error)}</div>}

      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl" style={{ border: `1px solid ${UI.border}` }}>
          <table className="w-full text-sm">
            <thead style={{ background: UI.tableHeadBg, color: UI.muted }}>
              <tr>
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Padrão</th>
                <th className="px-3 py-2 text-left">Ação</th>
                <th className="px-3 py-2 text-left">Role</th>
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
                  <td className="px-3 py-2 font-mono text-xs">{r.PATTERN || r.pattern || "—"}</td>
                  <td className="px-3 py-2">
                    {String(r.ACAO || r.action).toLowerCase() === "deny" ? (
                      <span className="inline-flex items-center gap-1 text-rose-600"><ShieldBan className="w-4 h-4"/> deny</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-600"><ShieldCheck className="w-4 h-4"/> allow</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.ROLE || r.role || "any"}</td>
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
                  <td className="px-3 py-6 text-center text-sm" colSpan={7} style={{ color: UI.muted }}>
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
        key={openEditor ? (editing?.Id ?? "new") : "closed"}
        UI={UI}
        open={openEditor}
        onClose={() => setOpenEditor(false)}
        onSubmit={handleSave}
        initial={editing}
        whoamiUrl={whoamiUrl}
      />

      {/* Modal confirmação */}
      {confirmId && (
        <ConfirmModal UI={UI} onCancel={() => setConfirmId(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}
