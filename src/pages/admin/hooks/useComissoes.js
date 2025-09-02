// src/pages/admin/hooks/useComissoes.js
import { useEffect, useMemo, useState } from "react";
import { fetchComissoesJSON, mapComissoesLista, saveComissoesLista } from "@/services/nocodbComissoes";

export default function useComissoes() {
  const [rowId, setRowId] = useState(null);
  const [json, setJson]   = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const { rowId, json } = await fetchComissoesJSON();
        if (!alive) return;
        setRowId(rowId);
        setJson(json);
      } catch (e) {
        if (!alive) return;
        setError(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const lista = useMemo(() => mapComissoesLista(json), [json]);

  const saveLista = async (rows) => {
    const next = await saveComissoesLista(rowId, rows);
    setJson(next); // otimista
  };

  return { rowId, json, lista, loading, error, saveLista };
}
