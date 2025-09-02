// src/pages/admin/components/config/tabs/NovoVendedorTab.jsx
import React, { useMemo, useState } from "react";
import { Save } from "lucide-react";

/* utils de máscara/validação */
const onlyDigits = (s="") => String(s).replace(/\D+/g,"");
const fmtCPF = (d="") =>
  onlyDigits(d).slice(0,11).replace(/(\d{3})(\d)/, "$1.$2")
                           .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
                           .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
const fmtCNPJ = (d="") =>
  onlyDigits(d).slice(0,14).replace(/^(\d{2})(\d)/, "$1.$2")
                           .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
                           .replace(/\.(\d{3})(\d)/, ".$1/$2")
                           .replace(/(\d{4})(\d)/, "$1-$2");
const fmtDoc = (s="") => {
  const d = onlyDigits(s);
  return d.length <= 11 ? fmtCPF(d) : fmtCNPJ(d);
};
const fmtPhoneBR = (s="") => {
  const d = onlyDigits(s).slice(0,11);
  if (d.length <= 10) {
    // (27) 9999-9999
    return d.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3").trim();
  }
  // (27) 99999-9999
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3").trim();
};
const isValidEmail = (s="") => /\S+@\S+\.\S+/.test(s);
const isValidPhone = (s="") => {
  const d = onlyDigits(s);
  return d.length === 10 || d.length === 11;
};
const isValidCPF = (s="") => onlyDigits(s).length === 11;

export default function NovoVendedorTab({ UI, onSubmit, classificacoes = [] }) {
  const defaultClass = classificacoes[0] || "Ouro";

  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    classificacao: defaultClass,
    receberNotificacao: false,
    bloqueado: false,
    pix: "",
    tipo: "CPF",          // 'E-mail' | 'Telefone' | 'CPF'
    nomeCadastro: "",
    cpf: "",
    codigo: "",
    ativo: true,
    metaMensal: "",
  });

  // re-sincroniza classificação default caso as comissões cheguem depois
  React.useEffect(() => {
    if (!form.classificacao && classificacoes.length) {
      setForm(f => ({ ...f, classificacao: classificacoes[0] }));
    }
  }, [classificacoes]);

  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // handlers com máscara
  const onCpfChange = (e) => change("cpf", fmtDoc(e.target.value));
  const onTelefoneChange = (e) => change("telefone", fmtPhoneBR(e.target.value));

  // PIX dinâmico conforme tipo
  const pixPlaceholder = useMemo(() => {
    if (form.tipo === "E-mail") return "nome@dominio.com";
    if (form.tipo === "Telefone") return "(27) 99999-9999";
    return "000.000.000-00";
  }, [form.tipo]);

  const pixInputMode = useMemo(() => {
    if (form.tipo === "E-mail") return "email";
    if (form.tipo === "Telefone") return "tel";
    return "numeric";
  }, [form.tipo]);

  const onPixChange = (e) => {
    const v = e.target.value;
    if (form.tipo === "Telefone") change("pix", fmtPhoneBR(v));
    else if (form.tipo === "CPF") change("pix", fmtCPF(v));
    else change("pix", v); // e-mail sem máscara
  };

  const onTipoPixChange = (e) => {
    const next = e.target.value;
    // ao trocar o tipo, limpa/realinha o valor atual
    let nextPix = "";
    if (next === "Telefone") nextPix = fmtPhoneBR("");
    if (next === "CPF") nextPix = fmtCPF("");
    change("tipo", next);
    change("pix", nextPix);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();

    // validação leve do PIX
    if (form.tipo === "E-mail" && form.pix && !isValidEmail(form.pix)) {
      alert("Chave PIX (e-mail) inválida.");
      return;
    }
    if (form.tipo === "Telefone" && form.pix && !isValidPhone(form.pix)) {
      alert("Chave PIX (telefone) inválida. Use 10 ou 11 dígitos.");
      return;
    }
    if (form.tipo === "CPF" && form.pix && !isValidCPF(form.pix)) {
      alert("Chave PIX (CPF) inválida. Deve ter 11 dígitos.");
      return;
    }

    await onSubmit?.(form);

    // limpa o form após criar (mantém classificação e tipo)
    setForm((f) => ({
      ...f,
      nome: "",
      email: "",
      telefone: "",
      pix: "",
      cpf: "",
      codigo: "",
      nomeCadastro: "",
      metaMensal: "",
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Nome">
          <input
            value={form.nome}
            onChange={(e)=> change("nome", e.target.value)}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
            required
          />
        </Field>

        <Field label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e)=> change("email", e.target.value)}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="Telefone">
          <input
            value={form.telefone}
            onChange={onTelefoneChange}
            inputMode="tel"
            placeholder="(27) 99999-9999"
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="CPF / CNPJ">
          <input
            value={form.cpf}
            onChange={onCpfChange}
            inputMode="numeric"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="Código interno">
          <input
            value={form.codigo}
            onChange={(e)=> change("codigo", e.target.value)}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="Meta mensal (número)">
          <input
            type="number"
            value={form.metaMensal}
            onChange={(e)=> change("metaMensal", e.target.value)}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="Classificação">
          <select
            value={form.classificacao}
            onChange={(e)=> change("classificacao", e.target.value)}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          >
            {(classificacoes.length ? classificacoes : ["Diamante","Ouro","Prata","Bronze"]).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </Field>

        <Field label="Tipo da chave PIX">
          <select
            value={form.tipo}
            onChange={onTipoPixChange}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          >
            <option value="E-mail">E-mail</option>
            <option value="Telefone">Telefone</option>
            <option value="CPF">CPF</option>
          </select>
        </Field>

        <Field label="Chave PIX">
          <input
            value={form.pix}
            onChange={onPixChange}
            inputMode={pixInputMode}
            placeholder={pixPlaceholder}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="Nome no cadastro (IXC)">
          <input
            value={form.nomeCadastro}
            onChange={(e)=> change("nomeCadastro", e.target.value)}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          />
        </Field>

        <Field label="Receber Notificação?">
          <select
            value={String(form.receberNotificacao)}
            onChange={(e)=> change("receberNotificacao", e.target.value === "true")}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </Field>

        <Field label="Bloqueado?">
          <select
            value={String(form.bloqueado)}
            onChange={(e)=> change("bloqueado", e.target.value === "true")}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          >
            <option value="false">Não</option>
            <option value="true">Sim</option>
          </select>
        </Field>

        <Field label="Ativo?">
          <select
            value={String(form.ativo)}
            onChange={(e)=> change("ativo", e.target.value === "true")}
            className="bg-transparent outline-none px-3 py-2 rounded-xl w-full"
            style={{ border:`1px solid ${UI.border}` }}
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </Field>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ border:`1px solid ${UI.emerald.soft}`, color: UI.emerald.strong, background:"rgba(34,197,94,0.12)" }}
        >
          <Save className="w-4 h-4" /> Cadastrar vendedor
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs opacity-75">{label}</span>
      {children}
    </label>
  );
}
