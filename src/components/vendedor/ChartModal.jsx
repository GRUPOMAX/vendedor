import React, { useEffect } from "react";
import { X as XIcon } from "lucide-react";

/**
 * ChartModal — modal genérico para embutir qualquer conteúdo (gráfico, etc).
 *
 * Props:
 * - isOpen: boolean
 * - onClose: () => void
 * - title?: string
 * - children: ReactNode
 * - maxWidthClass?: string (ex: 'max-w-3xl', 'max-w-5xl')
 */
export default function ChartModal({
  isOpen,
  onClose,
  title = "Gráfico",
  children,
  maxWidthClass = "max-w-7xl",
}) {
  // ESC fecha
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // trava scroll do body
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className={`
          relative z-10
          w-[98vw] md:w-[92vw]         /* + largura responsiva */
          ${maxWidthClass}
          max-h-[94vh]                 /* + altura */
          rounded-2xl border border-border dark:border-dark-border
          bg-card dark:bg-dark-card
          p-4 overflow-hidden shadow-xl
        `}
      >
        <div className="flex items-center justify-between pb-3 border-b border-border dark:border-dark-border">
          <h3 className="text-lg font-semibold text-text dark:text-dark-text">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-background dark:hover:bg-dark-background" aria-label="Fechar modal">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo: só rolagem vertical; esconde horizontal */}
        <div
          className="mt-3 overflow-x-hidden overflow-y-auto custom-scroll"
          style={{ maxHeight: "calc(94vh - 80px)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
