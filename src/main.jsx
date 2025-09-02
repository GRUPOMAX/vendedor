// src/main.jsx (ou index.jsx)
import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  createHashRouter,
  RouterProvider,
} from "react-router-dom";

import App from "./App.jsx";
import Login from "./pages/Login.jsx";
import HomeRedirect from "./routes/HomeRedirect.jsx";
import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import VendedorDashboard from "./pages/VendedorDashboard.jsx";
import UploadComprovantePage from "./pages/admin/UploadComprovantePage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { AuthProvider } from "./state/auth.jsx";
import { ThemeProvider } from "./state/ThemeContext.jsx";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Detecta GitHub Pages automaticamente (ou permite forçar via env)
const isGhPagesHost = /\.github\.io$/.test(window.location.hostname);
const forceHash = String(import.meta.env.VITE_FORCE_HASH || "").trim() === "1";
const useHash = isGhPagesHost || forceHash;

// Árvore de rotas (compartilhada entre Browser e Hash)
const routes = [
  { path: "/login", element: <Login /> },
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: (
          <ProtectedRoute allow={["admin", "vendedor"]}>
            <HomeRedirect />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin",
        element: (
          <ProtectedRoute allow={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "vendedor",
        element: (
          <ProtectedRoute allow={["vendedor"]}>
            <VendedorDashboard />
          </ProtectedRoute>
        ),
      },

      // 👇 PÚBLICA: página de upload do comprovante (sem ProtectedRoute)
      { path: "admin/upload-comprovante", element: <UploadComprovantePage /> },

      // 404 opcional
      { path: "*", element: <div style={{ padding: 24 }}>404</div> },
    ],
  },
];

const router = useHash
  ? createHashRouter(routes)     // -> URLs ficam #/admin...
  : createBrowserRouter(routes); // -> URLs “limpas” em dev/servidor próprio

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
