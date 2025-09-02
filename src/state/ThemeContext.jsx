// ThemeContext.jsx
import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

const palette = {
  emerald: {
    soft:   "#22c55e",
    strong: "#16a34a",
    solid:  "#10b981",
  },
  amber:  "#eab308",
  slate4: "#94a3b8",
  slate6: "#475569",
  zinc1:  "#f4f4f5",
  zinc2:  "#e4e4e7",
  zinc8:  "#27272a",
  zinc9:  "#18181b",
};

function getUI(theme) {
  const isDark = theme === "dark";
  return {
    theme,
    isDark,

    // texto
    text:  isDark ? "#e5e7eb" : "#111827",
    muted: isDark ? "#a1a1aa" : "#4b5563",

    // contêiner / borda (SEM transparência)
    cardBg:  isDark ? "#18181b" : "#ffffff",   // <- sólido
    surface: isDark ? "#111113" : "#fafafa",   // opcional para cards internos
    border:  isDark ? "#27272a" : "#e4e4e7",

    // tabelas
    tableHeadBg: isDark ? "#111113" : "#f6f6f7",

    // charts
    grid:        isDark ? "#2a2a2a" : "#e5e7eb",
    tooltipBg:   isDark ? "#0a0a0a" : "#ffffff",
    tooltipBr:   isDark ? "#2a2a2a" : "#e4e4e7",
    tooltipText: isDark ? "#e5e7eb" : "#111827",
    cursor:      isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",

    // primária (emerald)
    emerald: { soft:"#22c55e", strong:"#16a34a", solid:"#10b981" },
    primaryGrad: `linear-gradient(90deg, #22c55e, #16a34a)`,
    chartPieColors: ["#22c55e", "#eab308", isDark ? "#94a3b8" : "#475569"],
  };
}


export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useUI() {
  const { theme } = useTheme();
  return getUI(theme);
}
