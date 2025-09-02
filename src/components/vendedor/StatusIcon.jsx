// src/components/vendedor/StatusIcon.jsx
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export default function StatusIcon({ cliente }) {
  const pagouTaxa  = (cliente?.["Pagou Taxa"] || '').toLowerCase();
  const bloqueado  = (cliente?.["Bloqueado"] || '').toLowerCase();
  const ativado    = (cliente?.["Ativado"] || '').toLowerCase();
  const desistiu   = (cliente?.["Desistiu"] || '').toLowerCase();
  const autorizado = (cliente?.["Autorizado"] || '').toLowerCase();

  if (desistiu === 'sim') {
    return <XCircle className="text-red-500 w-4 h-4" title="Desistiu" />;
  }

  if (bloqueado === 'sim') {
    return <XCircle className="text-red-500 w-4 h-4" title="Bloqueado" />;
  }

  // 🆕 Caso especial: aprovado + ativado + não pagou taxa → warning + check
  if (
    ativado === 'sim' &&
    autorizado === 'aprovado' &&
    pagouTaxa !== 'sim'
  ) {
    return (
      <div className="flex items-center gap-1">
        <AlertTriangle className="text-yellow-500 w-4 h-4" title="Aprovado sem taxa" />
        <CheckCircle className="text-green-500 w-4 h-4" title="Aprovado" />
      </div>
    );
  }

  if (ativado === 'sim' && pagouTaxa === 'sim') {
    return <CheckCircle className="text-green-500 w-4 h-4" title="OK" />;
  }

  return <AlertTriangle className="text-yellow-500 w-4 h-4" title="Pendência" />;
}
