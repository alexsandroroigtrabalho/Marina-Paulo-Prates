import { useEffect, useState } from 'react'
import { listarClientes, salvarCliente, listarEmbarcacoes, salvarEmbarcacao, listarCobrancas } from '../lib/db'

export default function TelaClientes({ marinaId }) {
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [abaEmbarcacao, setAbaEmbarcacao] = useState(false)
  const [formCliente, setFormCliente] = useState({ nome: '', email: '', telefone: '', cpf_cnpj: '' })
  const [formEmbarcacao, setFormEmbarcacao] = useState({ cliente_id: '', nome: '', tipo: '', comprimento_m: '' })

  async function carregar() {
    if (!marinaId) return
    const [c, e, cob] = await Promise.all([listarClientes(marinaId), listarEmbarcacoes(marinaId), listarCobrancas(marinaId)])
    setClientes(c); setEmbarcacoes(e); setCobrancas(cob)
  }

  useEffect(() => { carregar() }, [marinaId])

  async function salvarNovoCliente(e) {
    e.preventDefault()
    await salvarCliente({ marina_id: marinaId, ...formCliente })
    setFormCliente({ nome: '', email: '', telefone: '', cpf_cnpj: '' })
    carregar()
  }

  async function salvarNovaEmbarcacao(e) {
    e.preventDefault()
    await salvarEmbarcacao({ marina_id: marinaId, ...formEmbarcacao })
    setFormEmbarcacao({ cliente_id: '', nome: '', tipo: '', comprimento_m: '' })
    carregar()
  }

  async function alternarStatus(cliente) {
    const novoStatus = cliente.status === 'ativo' ? 'inadimplente' : 'ativo'
    await salvarCliente({ id: cliente.id, status: novoStatus })
    carregar()
  }

  const totalArrecadado = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const inadimplentes = clientes.filter((c) => c.status === 'inadimplente').length
  const mensalidades = cobrancas.filter((c) => c.tipo === 'mensalidade')
  const mensalidadeMedia = mensalidades.length
    ? mensalidades.reduce((s, c) => s + Number(c.valor), 0) / mensalidades.length
    : 0

  function embarcacoesDoCliente(clienteId) {
    return embarcacoes.filter((e) => e.cliente_id === clienteId).map((e) => e.nome).join(' · ') || '—'
  }

  return (
    <div>
      <div className="abas">
        <button className={!abaEmbarcacao ? 'ativo' : ''} onClick={() => setAbaEmbarcacao(false)}>Clientes</button>
        <button className={abaEmbarcacao ? 'ativo' : ''} onClick={() => setAbaEmbarcacao(true)}>Embarcações</button>
      </div>

      {!abaEmbarcacao ? (
        <>
          <div className="resumo-financeiro">
            <div className="stat-card">
              <span>Total arrecadado</span>
              <strong>R$ {totalArrecadado.toFixed(2)}</strong>
            </div>
            <div className="stat-card alerta">
              <span>Inadimplentes</span>
              <strong>{inadimplentes}</strong>
            </div>
            <div className="stat-card">
              <span>Mensalidade</span>
              <strong>R$ {mensalidadeMedia.toFixed(2)}</strong>
            </div>
          </div>

          <form className="form-inline" onSubmit={salvarNovoCliente}>
            <input placeholder="Nome" required value={formCliente.nome} onChange={(e) => setFormCliente({ ...formCliente, nome: e.target.value })} />
            <input placeholder="E-mail" value={formCliente.email} onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })} />
            <input placeholder="Telefone" value={formCliente.telefone} onChange={(e) => setFormCliente({ ...formCliente, telefone: e.target.value })} />
            <input placeholder="CPF/CNPJ" value={formCliente.cpf_cnpj} onChange={(e) => setFormCliente({ ...formCliente, cpf_cnpj: e.target.value })} />
            <button type="submit">+ Adicionar cliente</button>
          </form>

          <div className="lista-cards">
            {clientes.map((c, i) => (
              <div key={c.id} className="cliente-card">
                <div className="cabecalho-cliente">
                  <div className="titulo-cliente">
                    <span className="selo-numero">Nº {String(i + 1).padStart(4, '0')}</span>
                    <span className="nome">{c.nome}</span>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={c.status === 'ativo'} onChange={() => alternarStatus(c)} />
                    <span className="trilho" />
                  </label>
                </div>
                <div className="linha"><b>Telefone:</b> {c.telefone || '—'}</div>
                <div className="linha"><b>E-mail:</b> {c.email || '—'}</div>
                <div className="linha"><b>Endereço:</b> {c.endereco || '—'}</div>
                <div className="linha"><b>Carteira de habilitação:</b> {c.cpf_cnpj || '—'}</div>
                <div className="linha"><b>Embarcações:</b> {embarcacoesDoCliente(c.id)}</div>
                <span className={`status-texto ${c.status === 'ativo' ? 'em-dia' : 'pendente'}`}>
                  {c.status === 'ativo' ? 'Pagamento em dia' : 'Pagamento pendente'}
                </span>
              </div>
            ))}
            {clientes.length === 0 && <p className="dica">Nenhum cliente cadastrado ainda.</p>}
          </div>
        </>
      ) : (
        <>
          <form className="form-inline" onSubmit={salvarNovaEmbarcacao}>
            <select required value={formEmbarcacao.cliente_id} onChange={(e) => setFormEmbarcacao({ ...formEmbarcacao, cliente_id: e.target.value })}>
              <option value="">Cliente proprietário</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input placeholder="Nome da embarcação" required value={formEmbarcacao.nome} onChange={(e) => setFormEmbarcacao({ ...formEmbarcacao, nome: e.target.value })} />
            <input placeholder="Tipo (lancha, veleiro...)" value={formEmbarcacao.tipo} onChange={(e) => setFormEmbarcacao({ ...formEmbarcacao, tipo: e.target.value })} />
            <input placeholder="Comprimento (m)" type="number" step="0.01" value={formEmbarcacao.comprimento_m} onChange={(e) => setFormEmbarcacao({ ...formEmbarcacao, comprimento_m: e.target.value })} />
            <button type="submit">+ Adicionar embarcação</button>
          </form>
          <table className="tabela">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Proprietário</th><th>Comprimento</th></tr></thead>
            <tbody>
              {embarcacoes.map((e) => (
                <tr key={e.id}><td>{e.nome}</td><td>{e.tipo}</td><td>{e.clientes?.nome}</td><td>{e.comprimento_m} m</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
