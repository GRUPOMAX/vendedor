import React, { useEffect, useState } from "react";
import { Outlet, NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "./state/auth";
import { useTheme } from "./state/ThemeContext";
import DevConsole from "./components/dev/DevConsole";
import { onDev } from "./dev/commandBus";
import { debugRegras } from "@/dev/testRegras";

import TransferirVendaModal from "../src/pages/admin/components/TransferirVendaModal";

function ActiveLink({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `opacity-80 hover:opacity-100 transition text-text dark:text-dark-text ${
          isActive ? "underline underline-offset-4" : ""
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function App() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [openTransfer, setOpenTransfer] = useState(false);
  const [transferInfo, setTransferInfo] = useState({ protocolo: "", sugestao: {} });
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  useEffect(() => {
    return onDev("transfer:venda", ({ protocolo, sugestao = {} }) => {
      setTransferInfo({ protocolo, sugestao });
      setOpenTransfer(true);
    });
  }, []);

  return (
    // injeta classe 'dark' na árvore
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="min-h-screen bg-background dark:bg-dark-background text-text dark:text-dark-text">
        {/* HEADER GLOBAL — só DESKTOP */}
        <header className="hidden sm:block border-b border-border dark:border-dark-border">
          <div className="max-w-6xl mx-auto flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <Link to="/" className="font-bold hover:opacity-90 text-text dark:text-dark-text">
                Vendas Dashboard 2.0
              </Link>
              {user?.role === "admin" && <ActiveLink to="/admin">Admin</ActiveLink>}
              {user?.role === "vendedor" && <ActiveLink to="/vendedor">Vendedor</ActiveLink>}
            </div>

            {/* Ações do topo — apenas DESKTOP */}
            <div className="text-sm hidden sm:flex items-center gap-3">
              {user ? (
                <>
                  <span
                    title={user.email}
                    className="opacity-80 max-w-[240px] truncate text-text dark:text-dark-text"
                  >
                    {user.role} · {user.name}
                  </span>
                  <button
                    onClick={handleSignOut}
                    type="button"
                    className="bg-background dark:bg-dark-card text-text dark:text-dark-text rounded-xl px-3 py-1.5 font-medium hover:opacity-90"
                  >
                    Sair
                  </button>
                  <button
                    onClick={toggleTheme}
                    type="button"
                    className="bg-background dark:bg-dark-card text-text dark:text-dark-text rounded-xl px-3 py-1.5 font-medium hover:opacity-90"
                  >
                    {theme === "dark" ? "☀️ Claro" : "🌙 Escuro"}
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="underline opacity-80 hover:opacity-100 text-text dark:text-dark-text"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* CONTEÚDO */}
        <main className="max-w-6xl mx-auto p-4">
          <Outlet />
        </main>

        <DevConsole
          expose={{
            versao: "2.0",
            user,
            theme,
            debugRegras,
            navigate,
            ...(window.api ? { api: window.api } : {}),
            ...(window.store ? { store: window.store } : {}),
          }}
        />

        <TransferirVendaModal
          open={openTransfer}
          onClose={() => setOpenTransfer(false)}
          protocolo={transferInfo.protocolo}
          sugestaoDestino={transferInfo.sugestao}
          onSuccess={(res) => {
            console.log("Transfer OK:", res);
          }}
        />
      </div>

      {/* Host p/ portais dos modais */}
      <div id="modals" />
    </div>
  );
}
