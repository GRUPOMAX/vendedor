// src/dev/testRegras.js
import { listRegras } from "@/services/regras/nocodbRegrasComissao";
import { normalizeRegrasFromDb } from "@/lib/normalizeRegras";
import { calcularComissaoTrace } from "@/lib/comissaoEngine";
import { fetchComissoesJSON } from "@/services/nocodbComissoes";

const toCents = (s="") => Number(String(s).replace(/[^\d]+/g, "")||0);
const brl = (c=0) => (Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export async function debugRegras() {
  const { json } = await fetchComissoesJSON();
  const baseMap = json?.comissoes || {};
  const toCents = (s="") => Number(String(s).replace(/[^\d]+/g, "")||0);
  const brl = (c=0) => (Number(c||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const getBase = (cls) => toCents(baseMap?.[cls]?.valor ?? "R$ 0,00");

  const dbRows = await listRegras();
  const regras = normalizeRegrasFromDb(dbRows);

  const casos = [
    { nome:"Pagou taxa (Ouro)",            ctx:{ semTaxa:false, bloqueado:false, clienteAtivo:true }, classe:"Ouro" },
    { nome:"Sem taxa (Ouro)",              ctx:{ semTaxa:true,  bloqueado:false, clienteAtivo:true }, classe:"Ouro" },
    { nome:"Bloq + ativo (Diamante)",      ctx:{ semTaxa:false, bloqueado:true,  clienteAtivo:true }, classe:"Diamante" },
    { nome:"Bloq + inativo (Prata)",       ctx:{ semTaxa:true,  bloqueado:true,  clienteAtivo:false}, classe:"Prata" },
    { nome:"Motivo resistência (Ouro)",    ctx:{ semTaxa:false, bloqueado:false, clienteAtivo:true, motivo:"resistencia" }, classe:"Ouro" },
    { nome:"Motivo transferência (Ouro)",  ctx:{ semTaxa:false, bloqueado:false, clienteAtivo:true, motivo:"transferencia"}, classe:"Ouro" },
  ];

  console.log("=== REGRAS CARREGADAS ===");
  regras.forEach(r=>{
    console.log(`• [${r.Prioridade}] ${r._nome}  ativo=${r.Ativa}  tipo=${r.Tipo}  val=${r.ValorCentavos??""}  perc=${r.Percentual??""} stop=${r.PararAoAplicar}`);
  });

  for (const c of casos) {
    const base = getBase(c.classe);
    const { total, hits } = calcularComissaoTrace({ baseCentavos: base, ctx: c.ctx, regras });

    console.log("\n---", c.nome, "---");
    console.log("Classe:", c.classe, "| Base =", brl(base));
    console.log("Ctx:", JSON.stringify(c.ctx, null, 2));

    if (!hits.length) {
      console.log("TRACE: nenhuma regra aplicável (fica a base).");
    } else {
      console.log("TRACE:");
      hits.forEach(h=>{
        console.log(
          `   → ${h.nome||h.id} | ${h.tipo} | ${brl(h.before)} -> ${brl(h.after)}${h.stop?" (stop)":""}`
        );
      });
    }
    console.log("TOTAL =>", brl(total));
  }
}


// expõe no window
if (typeof window !== "undefined") window.debugRegras = debugRegras;
