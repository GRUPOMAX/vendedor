import { useEffect, useState } from "react";
import { baixarJsonVendedor } from "../services/api";
import Layout from "../components/Layout";
import styles from "./Dashboard.module.css";
import {
  getControlePorVendedor,
  createControleVendas,
  updateControleVendas
} from "../services/controleVendas";

const meses = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro"
];

const Dashboard = () => {
  const [vendas, setVendas] = useState([]);
  const [vendedor, setVendedor] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [abertos, setAbertos] = useState({});
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth());
  const [buscaProtocolo, setBuscaProtocolo] = useState("");
  const [controle, setControle] = useState({});
  const [recordId, setRecordId] = useState(null);

  const ultimaAtualizacao = vendas.length
    ? vendas.map((v) => v.dataHora).sort().reverse()[0]
    : null;

  useEffect(() => {
    const vendedorSalvo = JSON.parse(localStorage.getItem("vendedor"));
    if (!vendedorSalvo || !vendedorSalvo.email) {
      window.location.href = "/";
      return;
    }

    setVendedor(vendedorSalvo);

    const nomeSanitizado = vendedorSalvo.nome.toLowerCase().replace(/\s+/g, "_");
    const emailSanitizado = vendedorSalvo.email.toLowerCase().replace(/[@.]/g, "_");
    const nomeArquivo = `${nomeSanitizado}__${emailSanitizado}.json`;

    const carregarVendas = () => {
      fetch(baixarJsonVendedor(`/api/vendedor-json/${nomeArquivo}`))
        .then((res) => res.json())
        .then((dados) => {
          if (Array.isArray(dados)) setVendas(dados);
        })
        .catch(() => setVendas([]))
        .finally(() => setCarregando(false));
    };

    const carregarControle = async () => {
      const existente = await getControlePorVendedor(vendedorSalvo.nome);
      if (existente) {
        setControle(existente.DadosClientesVendedores || {});
        setRecordId(existente.Id);
      } else {
        const novo = await createControleVendas({
          Title: vendedorSalvo.nome,
          DadosClientesVendedores: {}
        });
        setControle({});
        setRecordId(novo.Id);
      }
    };

    carregarVendas();
    carregarControle();
    const interval = setInterval(carregarVendas, 30000);
    return () => clearInterval(interval);
  }, []);

  const toggleAberto = (chave) => {
    setAbertos((prev) => {
      const jáEstáAberto = prev[chave];
      return jáEstáAberto ? {} : { [chave]: true };
    });
  };
  
  

  
  
  
  
  

  const filtrarVendas = () => {
    return vendas.filter((venda) => {
      const [dia, mes] = venda.dataHora.split(",")[0].split("/");
      const correspondeMes = mesSelecionado === "" || Number(mes) - 1 === Number(mesSelecionado);
      const correspondeBusca = venda.protocolo?.toLowerCase().includes(buscaProtocolo.toLowerCase());
      return correspondeMes && correspondeBusca;
    });
  };

  const calcularComissao = (status) => {
    const pagou = status["Pagou Taxa"] === "SIM";
    const ativo = status["Ativado"] === "SIM";
    const bloqueado = status["Bloqueado"] === "SIM";
    const desistiu = status["Desistiu"] === "SIM";
  
    if (desistiu || bloqueado) return 0;
    if (!pagou && ativo) return 5;
    if (pagou && ativo && !bloqueado) return 25;
    return 0;
  };

  const vendasFiltradas = filtrarVendas(); // <-- define antes de usar

  

  const totalComissoes = vendasFiltradas.reduce((total, venda) => {
    const statusCliente = controle[venda.cpf] || {};
    return total + calcularComissao(statusCliente);
  }, 0);
  


  const handleCheckboxChange = async (cpf, campo, checked) => {
    if (!recordId) {
      console.warn("Tentando salvar sem recordId ainda disponível!");
      return;
    }
  
    const atualizado = {
      ...controle,
      [cpf]: {
        ...controle[cpf],
        [campo]: checked ? "SIM" : "NAO"
      }
    };
    setControle(atualizado);
  
    await updateControleVendas(recordId, {
      DadosClientesVendedores: atualizado
    });
  };
  

  if (!vendedor) return null;
  if (carregando) return <div style={{ padding: "2rem" }}>🔄 Carregando...</div>;

  return (
    <Layout
    vendedor={vendedor}
    ultimaAtualizacao={ultimaAtualizacao}
    totalComissoes={totalComissoes} // <-- adiciona aqui
  >
      <div className={styles.container}>
        <div className={styles.filtros}>
          <div className={styles.filtroLinha}>
            <label className={styles.filtroLabel}>
              <span>📅</span> Filtro por mês:
              <select
                className={styles.select}
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(e.target.value)}
              >
                <option value="">Todos</option>
                {meses.map((mes, index) => (
                  <option key={index} value={index}>{mes}</option>
                ))}
              </select>
            </label>

            <label className={styles.filtroLabel}>
              <span>🔍</span> Buscar por protocolo:
              <input
                type="text"
                className={styles.input}
                placeholder="Digite o protocolo..."
                value={buscaProtocolo}
                onChange={(e) => setBuscaProtocolo(e.target.value)}
              />
            </label>
          </div>

          {mesSelecionado !== "" && (
            <p className={styles.totalMes}>
              ✅ <strong>{vendasFiltradas.length}</strong> vendas encontradas para <strong>{meses[mesSelecionado]}</strong>
            </p>
          )}
        </div>

        {vendasFiltradas.length === 0 ? (
          <p className={styles.emptyText}>Nenhuma venda registrada com esse filtro.</p>
        ) : (
          <div className={styles.grid}>
            {vendasFiltradas.map((venda, index) => {
              const chaveUnica = `${venda.cpf}_${venda.dataHora}`;
              const isOpen = abertos[chaveUnica] || false;
              const status = controle[venda.cpf] || {};

              return (
                <div key={chaveUnica} className={styles.cardWrapper}>
                <div className={styles.cardHeader} onClick={() => toggleAberto(chaveUnica)}>
                  <span><strong>{venda.nome}</strong></span>
                  <span>{venda.dataHora}</span>
                </div>

                {isOpen && (
                  <div className={isOpen ? styles.cardBody : styles.cardBodyHidden}>
                    <>
                      <p><strong>Protocolo:</strong> {venda.protocolo}</p>
                      <p><strong>CPF:</strong> {venda.cpf}</p>
                      <p><strong>Telefone:</strong> {venda.telefone1}</p>

                      <p>
                        <strong>Comissão:</strong>{" "}
                        <span style={{ color: "#2e7d32" }}>
                          R$ {calcularComissao(status).toFixed(2).replace(".", ",")}
                        </span>
                      </p>

                      <div className={styles.checkboxGroup}>
                        {['Pagou Taxa', 'Bloqueado', 'Ativado', 'Desistiu'].map((campo) => (
                          <label key={campo}>
                            <input
                              type="checkbox"
                              checked={status[campo] === 'SIM'}
                              onChange={(e) => handleCheckboxChange(venda.cpf, campo, e.target.checked)}
                            /> {campo}
                          </label>
                        ))}
                      </div>
                    </>
                  </div>
                )}


                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;