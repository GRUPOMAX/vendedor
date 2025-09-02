import { useState, useEffect } from "react";
import { useAuth } from "../state/auth";
import {
  ShieldCheck,
  UserRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Network
} from "lucide-react";
import LoginLoading from "../components/LoginLoading";


const API_BASE = import.meta.env.VITE_API_BASE;

export default function Login() {
  const { signInAdmin, signInVendedor } = useAuth();
  const [tab, setTab] = useState("admin");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [who, setWho] = useState(null);
  const [pubIp, setPubIp] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    try {
      const delay = new Promise((res) => setTimeout(res, 1500)); // ⏱️ 1.5s de delay mínimo

      if (tab === "admin") {
        await Promise.all([
          signInAdmin({
            email: fd.get("email")?.trim(),
            senha: fd.get("senha")?.trim(),
          }),
          delay,
        ]);
      } else {
        await Promise.all([
          signInVendedor({
            vendedor: fd.get("vendedor")?.trim(),
            email: fd.get("emailVend")?.trim()?.toLowerCase(),
          }),
          delay,
        ]);
      }

      window.location.href = "/";
    } catch (err) {
      setMsg(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  // força sempre o modo claro
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/whoami`);
        const j = await r.json();
        if (alive) setWho(j);
      } catch {}
      try {
        if (!alive) return;
        const r2 = await fetch("https://api.ipify.org?format=json");
        const j2 = await r2.json();
        if (alive) setPubIp(j2?.ip || null);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-[100vh] grid place-items-center bg-gradient-to-br from-emerald-500/10 via-transparent to-emerald-600/10 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-4 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-900">
            Acesso ao Dashboard
          </h1>
          <p className="text-sm text-zinc-500">
            Entre como <span className="font-medium">Administrador</span> ou{" "}
            <span className="font-medium">Vendedor</span>
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white/80 shadow-xl shadow-emerald-500/5 backdrop-blur-sm">
          {/* Tabs */}
          <div className="flex p-1 gap-1">
            <Tab
              active={tab === "admin"}
              onClick={() => setTab("admin")}
              icon={<ShieldCheck className="w-4 h-4" />}
              label="Admin"
            />
            <Tab
              active={tab === "vendedor"}
              onClick={() => setTab("vendedor")}
              icon={<UserRound className="w-4 h-4" />}
              label="Vendedor"
            />
          </div>

          {/* IP Badge */}
          {(who?.ip || pubIp) && (
            <div className="px-5 pt-2">
              <div
                className="inline-flex items-center gap-2 text-[11px] px-2 py-1 rounded-lg 
                           border border-zinc-200 text-zinc-600 bg-white/70"
                title={who?.xForwardedFor ? `XFF: ${who.xForwardedFor}` : ""}
              >
                <Network className="w-3.5 h-3.5" />
                <span>
                  Seu IP:{" "}
                  <b className="font-medium">
                    {who?.ip && who.ip !== "::1" && who.ip !== "127.0.0.1"
                      ? who.ip
                      : (pubIp || who?.ip)}
                  </b>
                </span>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="p-5 pt-2 space-y-3">
            {tab === "admin" ? (
              <>
                <Field label="Email">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="username"
                      className="w-full pl-10 pr-3 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      placeholder="admin@empresa.com.br"
                    />
                  </div>
                </Field>

                <Field label="Senha">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      name="senha"
                      type={showPwd ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      className="w-full pl-10 pr-10 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600"
                      aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label="Vendedor">
                  <input
                    name="vendedor"
                    placeholder="ex: joao silva"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  />
                </Field>

                <Field label="Email do Vendedor">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      name="emailVend"
                      type="email"
                      required
                      className="w-full pl-10 pr-3 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      placeholder="vendedor@empresa.com.br"
                    />
                  </div>
                </Field>
              </>
            )}

            {msg ? (
              <div className="rounded-xl border border-red-300/40 bg-red-50/70 text-red-700 text-sm px-3 py-2">
                {msg}
              </div>
            ) : null}

            <button
              disabled={loading}
              className="group w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium
                bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800
                disabled:opacity-60 disabled:cursor-not-allowed
                shadow-sm shadow-emerald-600/30 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-zinc-500">
          © {new Date().getFullYear()} Max Fibra — Segurança • Simplicidade • Velocidade
        </p>
      </div>
          <LoginLoading
            visible={loading}
            message="Entrando…"
            hint={tab === "admin"
              ? "Validando administrador e regras de acesso"
              : "Validando vendedor e permissões"}
            ip={(who?.ip && who.ip !== "::1" && who.ip !== "127.0.0.1") ? who.ip : (pubIp || undefined)}
          />
    </div>
  );
}

/* —————————— Mini componentes —————————— */

function Tab({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm",
        active
          ? "bg-white text-zinc-900 shadow-sm border border-zinc-200"
          : "text-zinc-600 hover:bg-zinc-50 border border-transparent",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-600">{label}</label>
      {children}
    </div>
  );
}
