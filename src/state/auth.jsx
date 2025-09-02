// src/state/auth.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loginAdmin, loginVendedor, previewAclDecision } from "../services/authService";

const WHOAMI_URL = import.meta.env.VITE_WHOAMI_URL || "/whoami";
const API_BASE   = import.meta.env.VITE_API_BASE;

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ——— IP helper (usa /whoami, mas aceita override)
async function getLoginIp(ipOverride) {
  if (ipOverride) return String(ipOverride).trim();
  try {
    const whoUrl = WHOAMI_URL.startsWith("http") ? WHOAMI_URL : `${API_BASE}${WHOAMI_URL}`;
    const r = await fetch(whoUrl, { headers: { Accept: "application/json" } });
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    if (ct.includes("application/json")) {
      try {
        const j = JSON.parse(body);
        return j?.ip || j?.address || j?.clientIp || "";
      } catch {}
    }
    const m = body.match(/(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}/);
    return m ? m[0] : "";
  } catch {
    return "";
  }
}

let hbTimer = null;
function startHeartbeat(email, sessionId, everyMs = 6 * 60 * 1000) {
  stopHeartbeat();
  if (!email) return;
  hbTimer = setInterval(() => {
    fetch(`${API_BASE}/audit/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sessionId }),
    }).catch(() => {});
  }, everyMs);
}
function stopHeartbeat() {
  if (hbTimer) clearInterval(hbTimer);
  hbTimer = null;
}

async function auditLogin({ role, name, email, sessionId, ip, aclDecision }) {
  try {
    await fetch(`${API_BASE}/audit/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name, email, sessionId, ip, aclDecision }),
    });
  } catch {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("vd_user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (!user) {
      localStorage.removeItem("vd_user");
      stopHeartbeat();
      return;
    }

    const u = { ...user };
    if (!u.sessionId) u.sessionId = uuid();

    const auditKey = `vd_user_audit_${u.sessionId}`;
    const alreadyAudited = sessionStorage.getItem(auditKey) === "1";

    localStorage.setItem("vd_user", JSON.stringify(u));

    if (!alreadyAudited) {
      auditLogin({
        role: u.role,
        name: u.name || u.nome,
        email: u.email,
        sessionId: u.sessionId,
        ip: u.ip || "",
        aclDecision: u.aclDecision || "",
      }).finally(() => {
        sessionStorage.setItem(auditKey, "1");
      });
    }

    startHeartbeat(u.email, u.sessionId);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetch(`${API_BASE}/audit/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: u.email, sessionId: u.sessionId }),
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onUnload = () => {
      try {
        const data = JSON.stringify({ email: u.email, sessionId: u.sessionId });
        navigator.sendBeacon?.(`${API_BASE}/audit/ping`, new Blob([data], { type: "application/json" }));
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,

      // Preview opcional (pra usar na tela de login)
      async previewAcl({ role, email, ip }) {
        return previewAclDecision({ role, email, ip });
      },

      async signInAdmin(p) {
        // captura IP (permite p.ip vindo do form)
        const ip = await getLoginIp(p?.ip);
        const u = await loginAdmin({ ...p, ip }); // serviço valida ACL
        setUser({ ...u, loggedAt: Date.now(), ip, aclDecision: "allow" });
        return u;
      },

      async signInVendedor(p) {
        const ip = await getLoginIp(p?.ip);
        const u = await loginVendedor({ ...p, ip });
        setUser({ ...u, loggedAt: Date.now(), ip, aclDecision: "allow" });
        return u;
      },

      signOut() {
        const raw = localStorage.getItem("vd_user");
        const cur = raw ? JSON.parse(raw) : null;
        if (cur?.email) {
          fetch(`${API_BASE}/audit/ping`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cur.email, sessionId: cur.sessionId, event: "logout" }),
          }).catch(() => {});
        }
        setUser(null);
      },
    }),
    [user]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
