import { emitDev } from "./commandBus";

// lista inicial; dá pra ir adicionando mais objetos aqui depois
const rules = [
  // ON
  {
    test: (s) => /^(show|mostrar)\s+debug\s+vendas?$/i.test(s),
    run: () => {
      emitDev("debug:vendas", { visible: true });
      return "Debug de vendas: ON";
    },
  },
  // OFF
  {
    test: (s) => /^(hide|esconder|off)\s+debug\s+vendas?$/i.test(s),
    run: () => {
      emitDev("debug:vendas", { visible: false });
      return "Debug de vendas: OFF";
    },

     
  },

    {
      // transfer ABC-123
      // transfer ABC-123 to Fabio
      test: (s) => /^transfer\s+([A-Za-z0-9\-_]+)(?:\s+to\s+(.+))?$/i.test(s),
      run: ({ input }) => {
        const m = input.match(/^transfer\s+([A-Za-z0-9\-_]+)(?:\s+to\s+(.+))?$/i);
        const protocolo = m?.[1];
        const nome = (m?.[2] || "").trim();
        if (!protocolo) return "Uso: transfer <protocolo> [to <nome>]";

        emitDev("transfer:venda", { protocolo, sugestao: nome ? { nome } : undefined });
        return `Abrindo modal de transferência para ${protocolo}${nome ? ` → destino sugerido: ${nome}` : ""}`;
      },
    },

];

export function runCustomCommands(input, ctx) {
  const s = String(input).trim();
  for (const rule of rules) {
    if (rule.test(s)) return rule.run({ input: s, ctx });
  }
  return null; // não tratado
}

// API para extender conforme crescer a lista
export function registerCommand(test, run) {
  rules.push({ test, run });
}
