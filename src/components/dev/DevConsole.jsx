import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Terminal, Trash2, Play, Network, Copy, ChevronDown } from "lucide-react";
import { runCustomCommands } from "../../dev/commands";

/**
 * DevConsole — overlay de debug
 * - Abre ao digitar "console" rápido (qualquer lugar) ou Ctrl+`
 * - Intercepta console.* e guarda os logs
 * - (Opcional) Intercepta fetch/XHR (toggle dentro do console)
 * - Executa expressões JS com acesso a um "contexto" exposto via prop
 *
 * ATENÇÃO: por segurança, ative apenas em DEV ou atrás de flag de env.
 */

const isDev = typeof import.meta !== "undefined"
  ? import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEVCONSOLE === "1"
  : (process?.env?.NODE_ENV !== "production");

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const now = () => new Date().toLocaleTimeString();

function useTypeToOpen({ word = "console", onOpen }) {
  const seq = useRef("");
  const lastTs = useRef(0);

  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // toggle via Ctrl+` também
      if ((e.ctrlKey || e.metaKey) && e.key === "`") return onOpen?.();

      const char = e.key?.length === 1 ? e.key.toLowerCase() : "";
      if (!char) return;

      const t = performance.now();
      // se demorou muito, reinicia sequência
      if (t - lastTs.current > 1000) seq.current = "";
      lastTs.current = t;

      const target = word.toLowerCase();
      const next = (seq.current + char).slice(-target.length);

      // mantém apenas prefixos válidos
      if (target.startsWith(next)) {
        seq.current = next;
        if (next === target) {
          seq.current = "";
          onOpen?.();
        }
      } else {
        // recomeça se a tecla já começa a palavra
        seq.current = char === target[0] ? char : "";
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [word, onOpen]);
}

/**
 * Intercepta chamadas ao console (log, info, warn, error) e redireciona para um callback.
 * @param enabled - Se true, ativa a interceptação.
 * @param opts - Opções de configuração.
 * @param opts.forwardNative - Se true, repassa logs para o console nativo.
 * @param opts.keepNativeFor - Tipos de logs a manter no console nativo (ex.: ["error", "warn"]).
 * @returns Objeto com método setPusher para definir o callback de logs, e métodos mute/unmute.
 */
function useConsoleIntercept(enabled, opts = {}) {
  const { forwardNative = false, keepNativeFor = ["error", "warn"] } = opts;
  const originals = useRef(null);
  const pushRef = useRef(null);
  const mutedPrefixesRef = useRef(["[CP/SVC]"]);
  const pendingLogs = useRef([]);
  const timeoutRef = useRef(null);

  const flushLogs = () => {
    if (pendingLogs.current.length) {
      pushRef.current?.(pendingLogs.current);
      pendingLogs.current = [];
    }
  };

  useEffect(() => {
    if (!enabled) return;
    if (originals.current) return;

    originals.current = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
    };

    ["log", "info", "warn", "error"].forEach((k) => {
      console[k] = (...args) => {
        const first = args?.[0];
        const isMuted = typeof first === "string" && mutedPrefixesRef.current.some(p => first.startsWith(p));
        if (!isMuted) {
          pendingLogs.current.push({ type: k, args, ts: Date.now() });
          if (!timeoutRef.current) {
            timeoutRef.current = setTimeout(() => {
              flushLogs();
              timeoutRef.current = null;
            }, 100); // Debounce de 100ms
          }
        }
        if (forwardNative || keepNativeFor.includes(k)) {
          if (!isMuted) try { originals.current[k](...args); } catch {}
        }
      };
    });

    return () => {
      clearTimeout(timeoutRef.current);
      flushLogs();
      if (!originals.current) return;
      console.log = originals.current.log;
      console.info = originals.current.info;
      console.warn = originals.current.warn;
      console.error = originals.current.error;
      originals.current = null;
    };
  }, [enabled, forwardNative, keepNativeFor]);

  return {
    setPusher(fn) {
      pushRef.current = (logs) => fn(logs);
    },
    mutePrefix(prefix) {
      if (prefix && !mutedPrefixesRef.current.includes(prefix)) {
        mutedPrefixesRef.current.push(prefix);
      }
    },
    unmutePrefix(prefix) {
      mutedPrefixesRef.current = mutedPrefixesRef.current.filter(p => p !== prefix);
    },
  };
}

function useNetworkIntercept(enabled) {
  const originals = useRef(null);
  const pushRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (originals.current) return;

    // fetch
    const origFetch = window.fetch?.bind(window);
    // XHR
    const OrigXHR = window.XMLHttpRequest;

    originals.current = { fetch: origFetch, XHR: OrigXHR };

    if (origFetch) {
      window.fetch = async (input, init = {}) => {
        const started = performance.now();
        const method = (init.method || "GET").toUpperCase();
        const url = typeof input === "string" ? input : input.url;
        pushRef.current?.({ type: "net", phase: "start", method, url, ts: Date.now() });
        try {
          const res = await origFetch(input, init);
          const dur = performance.now() - started;
          pushRef.current?.({
            type: "net",
            phase: "end",
            method,
            url,
            status: res.status,
            ok: res.ok,
            dur,
            ts: Date.now(),
          });
          return res;
        } catch (err) {
          const dur = performance.now() - started;
          pushRef.current?.({
            type: "net",
            phase: "error",
            method,
            url,
            error: String(err?.message || err),
            dur,
            ts: Date.now(),
          });
          throw err;
        }
      };
    }

    if (OrigXHR) {
      function WrappedXHR() {
        const xhr = new OrigXHR();
        let _url = "", _method = "GET", _start = 0;

        const open = xhr.open;
        xhr.open = function(method, url, ...rest) {
          _method = String(method || "GET").toUpperCase();
          _url = String(url || "");
          return open.call(xhr, method, url, ...rest);
        };

        const send = xhr.send;
        xhr.send = function(...args) {
          _start = performance.now();
          pushRef.current?.({ type: "net", phase: "start", method: _method, url: _url, ts: Date.now() });
          xhr.addEventListener("loadend", () => {
            const dur = performance.now() - _start;
            pushRef.current?.({
              type: "net",
              phase: "end",
              method: _method,
              url: _url,
              status: xhr.status,
              ok: xhr.status >= 200 && xhr.status < 300,
              dur,
              ts: Date.now(),
            });
          });
          return send.apply(xhr, args);
        };

        return xhr;
      }
      window.XMLHttpRequest = WrappedXHR;
    }

    return () => {
      if (!originals.current) return;
      if (originals.current.fetch) window.fetch = originals.current.fetch;
      if (originals.current.XHR) window.XMLHttpRequest = originals.current.XHR;
      originals.current = null;
    };
  }, [enabled]);

  return {
    setPusher(fn) { pushRef.current = fn; },
  };
}

export default function DevConsole({ expose = {}, defaultOpen = false }) {
  if (!isDev) return null; // segurança: só em DEV / flag

  const [open, setOpen] = useState(!!defaultOpen);
  const [netOn, setNetOn] = useState(() => JSON.parse(localStorage.getItem('devConsoleNetOn') || 'true'));
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState(() => localStorage.getItem('devConsoleFilter') || "all");
  const [logs, setLogs] = useState([]);
  const [fixado, setFixado] = useState(false);
  const [capConsole, setCapConsole] = useState(() => JSON.parse(localStorage.getItem('devConsoleCap') || 'true'));
  const [search, setSearch] = useState("");

  const consoleHook = useConsoleIntercept(open && capConsole, { forwardNative: false });
  const netHook = useNetworkIntercept(netOn);
  const listRef = useRef(null);

  // Persistência de estados
  useEffect(() => {
    localStorage.setItem('devConsoleNetOn', JSON.stringify(netOn));
  }, [netOn]);
  useEffect(() => {
    localStorage.setItem('devConsoleFilter', filter);
  }, [filter]);
  useEffect(() => {
    localStorage.setItem('devConsoleCap', JSON.stringify(capConsole));
  }, [capConsole]);

  // Abrir digitando "console"
  useTypeToOpen({ word: "console", onOpen: () => setOpen(true) });

  // Limpar ao abrir
  useEffect(() => {
    if (open) {
      console.clear();
      setLogs([]);
    }
  }, [open]);

  // Atalhos de teclado para filtros
  useEffect(() => {
    const onKey = (e) => {
      if (!open || !e.ctrlKey) return;
      if (e.key === '1') setFilter('all');
      if (e.key === '2') setFilter('log');
      if (e.key === '3') setFilter('warn');
      if (e.key === '4') setFilter('error');
      if (e.key === '5') setFilter('net');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Fazer push de eventos com rate limit
  const LOG_RATE_LIMIT = 100; // Máximo de logs por segundo
  let lastLogTime = 0;
  let logCount = 0;

  useEffect(() => {
    const push = (evts) => {
      const nowTime = Date.now();
      if (nowTime - lastLogTime > 1000) {
        lastLogTime = nowTime;
        logCount = 0;
      }
      if (logCount >= LOG_RATE_LIMIT) return;
      logCount += Array.isArray(evts) ? evts.length : 1;
      setLogs((prev) => [
        ...prev,
        ...(Array.isArray(evts) ? evts : [evts]).map((evt, i) => ({
          id: prev.length + i + 1,
          ...evt,
        })),
      ].slice(-500));
    };
    consoleHook.setPusher(push);
    netHook.setPusher(push);
  }, [consoleHook, netHook]);

  // Autoscroll
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  // Contexto exposto para eval
  const ctx = useMemo(() => ({ ...expose, now: Date, perf: performance }), [expose]);

  // Eval seguro com Proxy
  const safeCtx = useMemo(() => new Proxy(ctx, {
    has: () => true,
    get: (target, prop) => {
      if (prop === 'eval' || prop === 'Function') return undefined;
      return target[prop];
    },
  }), [ctx]);

  // Plugins de comandos
  const commandPlugins = useMemo(() => new Map([
    ['clear', () => setLogs([])],
    ['help', () => setLogs((prev) => [
      ...prev,
      { id: prev.length + 1, type: "info", args: [
        "Comandos:\n/clear  - limpa\n/filter [all|log|warn|error|net]\n/net [on|off]\n/mute [prefix]\n/unmute [prefix]\n/help   - ajuda\nQualquer outra entrada é avaliada como JS (eval) no contexto exposto."
      ], ts: Date.now() }
    ])],
    ['filter', (args) => {
      const v = args[0]?.trim();
      if (['all', 'log', 'warn', 'error', 'net'].includes(v)) {
        setFilter(v);
      } else {
        throw new Error(`Filtro inválido: ${v}`);
      }
    }],
    ['net', (args) => {
      const v = args[0]?.trim();
      setNetOn(v === 'on');
    }],
    ['mute', (args) => consoleHook.mutePrefix(args[0]?.trim())],
    ['unmute', (args) => consoleHook.unmutePrefix(args[0]?.trim())],
  ]), [consoleHook]);

  function runCommand() {
    const code = input.trim();
    if (!code) return;
    setInput("");

    if (code[0] === '/') {
      const [cmd, ...args] = code.slice(1).split(" ");
      if (commandPlugins.has(cmd)) {
        try {
          commandPlugins.get(cmd)(args);
        } catch (e) {
          setLogs((prev) => [
            ...prev,
            { id: prev.length + 1, type: "error", args: [String(e)], ts: Date.now() }
          ]);
        }
        return;
      }
    }

    // Comandos custom
    const handledMsg = runCustomCommands(code, ctx);
    if (handledMsg != null) {
      setLogs((prev) => [
        ...prev,
        { id: prev.length + 1, type: "info", args: [handledMsg], ts: Date.now() }
      ]);
      return;
    }

    // EVAL (DEV APENAS!)
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function("ctx", "with(ctx){ return (async ()=>(" + code + "))(); }");
      const t0 = performance.now();
      fn(safeCtx).then((res) => {
        setLogs((prev) => [
          ...prev,
          { id: prev.length + 1, type: "result", args: [`${code}  ⇒`, res, `(${(performance.now()-t0).toFixed(1)}ms)`], ts: Date.now() }
        ]);
      }).catch((err) => {
        setLogs((prev) => [
          ...prev,
          { id: prev.length + 1, type: "error", args: [`${code}`, err], ts: Date.now() }
        ]);
      });
    } catch (e) {
      setLogs((prev) => [
        ...prev,
        { id: prev.length + 1, type: "error", args: [`${code}`, e], ts: Date.now() }
      ]);
    }
  }

  const filtered = logs.filter(l => 
    (filter === "all" ? true : l.type === filter) &&
    (search ? JSON.stringify(l.args).toLowerCase().includes(search.toLowerCase()) : true)
  );

  // Exportação de logs
  const exportLogs = () => {
    const data = JSON.stringify(filtered, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devconsole-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Componente memoizado para log item
  const LogItem = React.memo(({ log }) => (
    <div className="flex gap-2">
      <span className="opacity-40 shrink-0">{new Date(log.ts).toLocaleTimeString()}</span>
      <span className={`shrink-0 capitalize ${
        log.type === "error" ? "text-red-600" :
        log.type === "warn" ? "text-amber-600" :
        log.type === "net" ? "text-emerald-700" :
        "text-zinc-700"
      }`}>{log.type}</span>
      <span className="whitespace-pre-wrap break-words">
        {Array.isArray(log.args) ? log.args.map((a, i) => (
          <span key={i}>{formatArg(a)}{i < log.args.length - 1 ? " " : ""}</span>
        )) : formatArg(log)}
      </span>
    </div>
  ));

  // Extraia o conteúdo do painel para reaproveitar
  function ConsolePanel({
    fixado, netOn, setNetOn, setFixado, setOpen,
    filter, setFilter, input, setInput,
    runCommand, listRef, filtered, exportLogs, search, setSearch
  }) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl flex flex-col h-full">
        {/* cabeçalho */}
        <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-600" />
            <div className="font-semibold">Dev Console</div>
            <span className="text-xs opacity-60">({now()})</span>
            <span className="ml-2 text-[11px] rounded-md px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-900">
              digite <b>console</b> para abrir
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFixado(v => !v)}
              className={`px-2 py-1 rounded-lg text-xs border ${
                fixado
                  ? "border-blue-500 text-blue-700 bg-blue-50"
                  : "border-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
              title="Fixar console (impede fechamento ao clicar fora)"
            >
              <div className="flex items-center gap-1">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${fixado ? "rotate-180" : ""}`} />
                {fixado ? "Fixado" : "Fixar"}
              </div>
            </button>

            <button
              onClick={() => setCapConsole(v => !v)}
              className={`px-2 py-1 rounded-lg text-xs border ${capConsole ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-zinc-300"}`}
              title="Interceptar console"
            >
              Console {capConsole ? "ON" : "OFF"}
            </button>

            <button
              onClick={() => setNetOn(v => !v)}
              className={`px-2 py-1 rounded-lg text-xs border ${netOn ? "border-emerald-400 text-emerald-700 bg-emerald-50" : "border-zinc-300"}`}
              title="Interceptar network"
            >
              <div className="flex items-center gap-1"><Network className="w-3.5 h-3.5"/>{netOn ? "Net ON" : "Net OFF"}</div>
            </button>
            <button
              onClick={() => setLogs([])}
              className="px-2 py-1 rounded-lg text-xs border border-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              title="Limpar"
            >
              <div className="flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>Limpar</div>
            </button>
            <button
              onClick={exportLogs}
              className="px-2 py-1 rounded-lg text-xs border border-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              title="Exportar logs"
            >
              <div className="flex items-center gap-1"><Copy className="w-3.5 h-3.5"/>Exportar</div>
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900"
              title="Fechar"
            >
              <X className="w-5 h-5"/>
            </button>
          </div>
        </div>

        {/* filtros e busca */}
        <div className="px-3 py-2 flex items-center gap-2 text-xs">
          <label className="opacity-70">Filtro:</label>
          <select
            value={filter}
            onChange={(e)=>setFilter(e.target.value)}
            className="px-2 py-1 rounded-md border bg-white border-zinc-300 dark:bg-zinc-900 dark:border-zinc-700"
          >
            <option value="all">Todos</option>
            <option value="log">log</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
            <option value="net">network</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nos logs..."
            className="px-2 py-1 rounded-md border bg-white border-zinc-300 dark:bg-zinc-900 dark:border-zinc-700 text-xs"
          />
          <span className="opacity-60 ml-auto">Atalho: Ctrl+`</span>
        </div>

        {/* lista */}
        <div ref={listRef} className="flex-1 overflow-auto px-3 py-2 text-[12px] font-mono leading-5">
          {filtered.length === 0 ? (
            <div className="opacity-60">Sem eventos.</div>
          ) : filtered.map((l) => (
            <LogItem key={l.id} log={l} />
          ))}
        </div>

        {/* input */}
        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <span className="text-xs opacity-60">›</span>
          <input
            value={input}
            onChange={(e)=>setInput(e.target.value)}
            onKeyDown={(e)=>{ if(e.key==="Enter") runCommand(); if(e.key==="Escape") setInput(""); }}
            placeholder='Digite JS e Enter, ou /help'
            className="flex-1 px-2 py-1.5 rounded-md border bg-white border-zinc-300 dark:bg-zinc-900 dark:border-zinc-700 text-sm"
            autoFocus
          />
          <button
            onClick={runCommand}
            className="px-2 py-1 rounded-lg text-xs border border-emerald-400 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
          >
            <div className="flex items-center gap-1"><Play className="w-3.5 h-3.5"/>Run</div>
          </button>
        </div>
      </div>
    );
  }

  // No return principal: sem wrapper full-screen quando fixado
  return (
    <>
      {open && !fixado && (
        <div className="fixed inset-0 z-[1000] pointer-events-auto" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/20 transition" onClick={() => setOpen(false)} />
          <div className="absolute right-4 bottom-4 w-[min(720px,92vw)] h-[min(420px,70vh)] pointer-events-auto">
            <ConsolePanel
              {...{ fixado, netOn, setNetOn, setFixado, setOpen, filter, setFilter, input, setInput, runCommand, listRef, filtered, exportLogs, search, setSearch }}
            />
          </div>
        </div>
      )}

      {open && fixado && (
        <div className="fixed right-4 bottom-4 z-[1000] w-[min(720px,92vw)] h-[min(420px,70vh)]" aria-modal={false}>
          <ConsolePanel
            {...{ fixado, netOn, setNetOn, setFixado, setOpen, filter, setFilter, input, setInput, runCommand, listRef, filtered, exportLogs, search, setSearch }}
          />
        </div>
      )}
    </>
  );
}

function formatArg(a) {
  if (a == null) return String(a);
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  if (typeof a === "object") {
    try { return JSON.stringify(a, replacer, 2); } catch { return String(a); }
  }
  return String(a);
}
function replacer(_k, v) {
  if (typeof v === "bigint") return v.toString();
  return v;
}