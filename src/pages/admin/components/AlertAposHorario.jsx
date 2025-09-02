// components/AlertAposHorario.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Alerta que:
 * - Mostra pré-aviso com contagem regressiva antes do horário limite (opcional)
 * - Mostra alerta após o horário limite, com botão de "Entendi" que vale até o fim do dia
 * - Atualiza sozinho (alinha com o minuto; durante o pré-aviso atualiza por segundo)
 * - Animações suaves (respeita prefers-reduced-motion)
 *
 * Props:
 *  - horaLimite: number (0-23) | default 15
 *  - minutoLimite: number (0-59) | default 30
 *  - preAvisoMinutos: number | default 0 (0 = desliga pré-aviso)
 *  - storageKey: string | default "alerta_fichas_cutoff_dismissed"
 *  - className: string
 */
export default function AlertAposHorario({
  horaLimite = 15,
  minutoLimite = 30,
  preAvisoMinutos = 0,
  storageKey = "alerta_fichas_cutoff_dismissed",
  className = ""
}) {
  const [agora, setAgora] = useState(() => new Date());
  const [dismissedHoje, setDismissedHoje] = useState(false);
  const intervalRef = useRef(null);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // yyyy-mm-dd local (chave do dia)
  const hojeKey = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  // Lê/atualiza dismissed do dia (se a combinação cutoff mudar, reseta)
  const cutoffKey = useMemo(
    () => `${horaLimite.toString().padStart(2, "0")}:${minutoLimite.toString().padStart(2, "0")}`,
    [horaLimite, minutoLimite]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const flag = parsed?.[hojeKey]?.[cutoffKey] ?? false;
      setDismissedHoje(Boolean(flag));
    } catch {
      setDismissedHoje(false);
    }
  }, [storageKey, hojeKey, cutoffKey]);

  const marcarDismiss = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[hojeKey] = { ...(parsed[hojeKey] || {}), [cutoffKey]: true };
      localStorage.setItem(storageKey, JSON.stringify(parsed));
      setDismissedHoje(true);
    } catch {
      setDismissedHoje(true);
    }
  };

  // determina estados de hora
  const cutoff = useMemo(() => {
    const d = new Date(agora);
    d.setHours(horaLimite, minutoLimite, 0, 0);
    return d;
  }, [agora, horaLimite, minutoLimite]);

  const msParaCutoff = cutoff.getTime() - agora.getTime();
  const passouDoHorario = msParaCutoff <= 0;

  // pré-aviso
  const mostrarPreAviso =
    preAvisoMinutos > 0 && msParaCutoff > 0 && msParaCutoff <= preAvisoMinutos * 60 * 1000;

  // decide se mostra alerta principal
  const mostrar = passouDoHorario && !dismissedHoje;

  // formato
  const horaFmt = `${String(horaLimite).padStart(2, "0")}:${String(minutoLimite).padStart(2, "0")}h`;

  // Gerencia cadência de atualização:
  // - fora da janela de pré-aviso: alinha no minuto e depois atualiza a cada 30s
  // - dentro do pré-aviso: atualiza a cada 1s para contagem regressiva mais fluida
  useEffect(() => {
    const tick = () => setAgora(new Date());
    const clearAny = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    tick();

    if (mostrarPreAviso) {
      // contagem por segundo
      clearAny();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      // alinha com o minuto e mantém 30s
      clearAny();
      const alignTimeout = setTimeout(() => {
        tick();
        intervalRef.current = setInterval(tick, 30000);
      }, 60000 - (Date.now() % 60000));

      return () => {
        clearTimeout(alignTimeout);
        clearAny();
      };
    }

    return () => clearAny();
  }, [mostrarPreAviso]);

  // força atualização quando a aba volta a ficar visível
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && setAgora(new Date());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Helpers pré-aviso
  const totalPreAvisoMs = preAvisoMinutos * 60 * 1000;
  const minutosRestantes = Math.max(1, Math.ceil(msParaCutoff / 60000));
  const progresso = mostrarPreAviso
    ? Math.min(1, Math.max(0, 1 - msParaCutoff / totalPreAvisoMs))
    : 0;

  // Variantes de animação
  const enter = prefersReduced
    ? {}
    : { initial: { y: -8, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -8, opacity: 0 } };

  return (
    <div className={`mb-4 ${className}`}>
      {/* Pré-aviso com contagem + progress bar */}
      <AnimatePresence initial={false}>
        {mostrarPreAviso && (
          <motion.div
            {...enter}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="mb-3 rounded-xl border border-amber-300 bg-amber-50/80 dark:bg-amber-900/30 dark:border-amber-600 text-amber-800 dark:text-amber-200 overflow-hidden"
            role="status"
            aria-live="polite"
          >
            <div className="p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <div className="text-xs sm:text-sm leading-relaxed">
                <span className="font-medium">Pré-aviso:</span> a partir de{" "}
                <strong>{horaFmt}</strong> as fichas que subirem só aparecerão no sistema no dia
                seguinte.{" "}
                <span className="opacity-80">
                  Faltam <strong>{minutosRestantes} min</strong>.
                </span>
              </div>
            </div>

            {/* Barra de progresso do pré-aviso */}
            <div
              className="h-1.5 bg-amber-200/60 dark:bg-amber-800/50"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progresso * 100)}
              aria-label="Tempo restante para o horário limite"
            >
              <div
                className="h-full bg-amber-400 dark:bg-amber-500"
                style={{ width: `${progresso * 100}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alerta principal (após horário) */}
      <AnimatePresence initial={false}>
        {mostrar && (
          <motion.div
            {...enter}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="p-3 rounded-xl border border-amber-400 bg-amber-100/70 dark:bg-amber-900/40 dark:border-amber-500 text-amber-900 dark:text-amber-100 flex items-start gap-3"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="text-sm leading-relaxed">
              As fichas que subirem <strong>após {horaFmt}</strong> só aparecerão no sistema{" "}
              <strong>no dia seguinte</strong>.
              <div className="mt-1 opacity-70 text-xs">
                (Se você dispensar, o aviso volta amanhã.)
              </div>
            </div>

            <button
              onClick={marcarDismiss}
              className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-amber-300/70 hover:bg-amber-50 dark:hover:bg-amber-900/60 transition"
              title="Ocultar até amanhã"
            >
              <X className="w-3 h-3" />
              Entendi
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
