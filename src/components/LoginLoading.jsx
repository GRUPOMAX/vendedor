import { ShieldCheck, Loader2, Network } from "lucide-react";

/**
 * Telinha de carregamento para o fluxo de login
 * - Minimalista, com blur e microanimações
 * - Mostra mensagem e dica opcional (ex: "Verificando IP...")
 * - Pode exibir IP público (se você já tiver buscado)
 *
 * Props:
 * - visible: boolean (se não for true, não renderiza)
 * - message?: string (default: "Entrando…")
 * - hint?: string (linha extra pequenininha)
 * - ip?: string (mostra badgezinho com IP)
 */
export default function LoginLoading({
  visible,
  message = "Entrando…",
  hint,
  ip,
}) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center
                 bg-white/70 backdrop-blur-md
                 dark:bg-zinc-950/70"
      role="status"
      aria-live="assertive"
      aria-label="Processando login"
    >
      <div
        className="relative w-[92%] max-w-sm rounded-2xl border
                   border-zinc-200/80 bg-white/90 shadow-xl shadow-emerald-500/10
                   dark:bg-zinc-900/90 dark:border-zinc-800"
      >
        {/* Glow sutil */}
        <div className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-60 blur-2xl"
             style={{
               background:
                 "radial-gradient(120px 120px at 50% -10%, rgba(16,185,129,0.25), rgba(255,255,255,0))",
             }}
        />

        <div className="relative p-6">
          {/* Ícone com pulso */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl
                          bg-emerald-500/10 text-emerald-600
                          animate-[pulse_1.8s_ease-in-out_infinite]">
            <ShieldCheck className="h-7 w-7" />
          </div>

          <h2 className="mt-3 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {message}
          </h2>

          {hint ? (
            <p className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {hint}
            </p>
          ) : null}

          {/* Dots animados */}
          <div className="mt-3 flex items-center justify-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-bounce" />
          </div>

          {/* IP opcional */}
          {ip ? (
            <div className="mt-4 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-lg border
                              border-zinc-200 bg-white/70 px-2 py-1 text-[11px] text-zinc-600
                              dark:bg-zinc-900/70 dark:border-zinc-800">
                <Network className="h-3.5 w-3.5" />
                <span>Seu IP: <b className="font-medium">{ip}</b></span>
              </div>
            </div>
          ) : null}

          {/* Spinner discretinho no rodapé */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Processando credenciais</span>
          </div>
        </div>
      </div>
    </div>
  );
}
