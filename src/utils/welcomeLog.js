// src/utils/welcomeLog.js
export function welcomeLog({ role = "USER", name = "", email = "" } = {}) {
  const when = new Date().toLocaleString("pt-BR");
  const title = role?.toUpperCase() === "ADMIN" ? "Admin · Dashboard" : "Vendedor · Dashboard";

  // Estilos base
  const badge = "padding:4px 8px;border-radius:999px;background:#10b981;color:#0b1b14;font-weight:700";
  const sub   = "color:#10b981;font-weight:600";
  const mono  = "color:#0ea5e9;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

  // Banner compacto + dados
  console.log("%cMAXBOARD", badge, {});
  console.log("%c" + title, sub);
  console.log(
    "%cUsuário:%c %s   %cEmail:%c %s   %cPerfil:%c %s   %cQuando:%c %s",
    sub, "", name || "-", sub, "", email || "-", sub, "", role || "-", sub, "", when
  );

  // Um toque divertido (opcional)
  console.log("%c✔ Login efetuado com sucesso. Boa gestão!","color:#16a34a;font-weight:600");
}
