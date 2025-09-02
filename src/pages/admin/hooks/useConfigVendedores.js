// src/pages/admin/hooks/useConfigVendedores.js
import { useEffect, useMemo, useState } from "react";
import {
  fetchConfigVendedoresJSON,
  saveConfigVendedoresJSON,
  mapConfigVendedores,
  patchVendedorNoJSON,
  createVendedorInConfig,   // 👈 novo
} from "@/services/nocodbVendedoresConfig";

export default function useConfigVendedores() {
  const [rowId, setRowId] = useState(null);
  const [json, setJson]   = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { rowId, json } = await fetchConfigVendedoresJSON();
        if (!alive) return;
        setRowId(rowId);
        setJson(json);
      } catch (e) {
        if (alive) setError(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const lista = useMemo(() => mapConfigVendedores(json), [json]);

  const updateVendedor = async (nome, patch) => {
    const { next, changed } = patchVendedorNoJSON(json, nome, patch);
    if (!changed) return;
    setJson(next); // otimista
    await saveConfigVendedoresJSON(rowId, next);
  };

  // 👇 NOVO: criação
  const createVendedor = async (input) => {
    const { next } = await createVendedorInConfig(rowId, json, input);
    setJson(next); // otimista
  };

  return { rowId, json, lista, updateVendedor, createVendedor, loading, error };
}
