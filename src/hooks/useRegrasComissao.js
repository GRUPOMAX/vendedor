// src/hooks/useRegrasComissao.js
import { useEffect, useState } from "react";
import { listRegras, createRegra, updateRegra, deleteRegra } from "../services/regras/nocodbRegrasComissao";

export default function useRegrasComissao() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const list = await listRegras();
        if (alive) setItems(list);
      } catch (e) { if (alive) setError(String(e.message || e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const add    = async (data) => { const r = await createRegra(data); setItems((xs)=>[...xs, r]); };
  const patch  = async (id, p) => { await updateRegra(id, p); setItems((xs)=> xs.map(x=> x.Id===id? {...x, ...p} : x)); };
  const remove = async (id)   => { await deleteRegra(id); setItems((xs)=> xs.filter(x=> x.Id!==id)); };

  return { items, loading, error, add, patch, remove };
}
