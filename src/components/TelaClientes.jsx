import { useEffect, useState } from 'react'
import { listarClientes, salvarCliente, removerCliente, listarEmbarcacoes, salvarEmbarcacao, listarCobrancas } from '../lib/db'

const TIPOS_EMBARCACAO = ['Barco', 'Veleiro', 'Jet Ski', 'Iate']
const EMBARCACAO_VAZIA = { tipo: 'Barco', nome: '', registro: '', comprimento_m: '' }
const CLIENTE_VAZIO = { nome: '', email: '', telefone: '', cpf_cnpj: '', endereco: '', observacoes: '' }

// Rótulo do acesso à Agenda: deriva sempre de pagamento_confirmado +
// acesso_suspenso — não existe um 4º campo guardando isso separado, pra não
// correr o risco de o rótulo e a trava real (ver policy "cliente_cria_agendamento"
// no schema.sql) ficarem dessincronizados.
function statusAcesso(cliente) {
  if (cliente.acesso_suspenso) return { texto: 'Suspenso', classe: 'cancelado' }
  if (cliente.pagamento_confirmado) return { texto: 'Liberado', classe: 'em-dia' }
  return { texto: 'Aguardando pagamento', classe: 'pendente' }
}

export default function TelaClientes({ marinaId }) {
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [aba, setAba] = useState('clientes') // 'clientes' | 'adicionar'

  const [formCliente, setFormCliente] = useState({ ...CLIENTE_VAZIO })
  const [formEmbarcacoes, setFormEmbarcacoes] = useState([{ ...EMBARCACAO_VAZIA }])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  // Form compacto embutido em cada card, pra dar de adicionar embarcação a
  // um cliente que já existe sem precisar de uma aba separada.
  const [clienteExpandido, setClienteExpandido] = useState(null)
  const [formEmbarcacaoExtra, setFormEmbarcacaoExtra] = useState({ ...EMBARCACAO_VAZIA })
  const [salvandoExtra, setSalvandoExtra] = useState(false)
  const [removendoId, setRemovendoId] = useState(null)

  async function carregar() {
    if (!marinaId) return
    const [c, e, cob] = await Promise.all([listarClientes(marinaId), listarEmbarcacoes(marinaId), listarCobrancas(marinaId)])
    setClientes(c); setEmbarcacoes(e); setCobrancas(cob)
  }

  useEffect(() => { carregar() }, [marinaId])

  function atualizarEmbarcacaoForm(i, campo, valor) {
    const copia = [...formEmbarcacoes]
    copia[i] = { ...copia[i], [campo]: valor }
    setFormEmbarcacoes(copia)
  }

  function removerEmbarcacaoForm(i) {
    setFormEmbarcacoes(formEmbarcacoes.filter((_, idx) => idx !== i))
  }

  async function salvarNovoCliente(e) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      const novoCliente = await salvarCliente({
        marina_id: marinaId,
        ...formCliente,
        // Quem cadastra aqui é a própria administração, então o cadastro já
        // nasce completo; o pagamento é que começa pendente até ser
        // confirmado (ver bloco "Status de cadastro e pagamento").
        cadastro_confirmado: true,
        pagamento_confirmado: false,
        acesso_suspenso: false,
      })
      for (const emb of formEmbarcacoes) {
        if (!emb.nome) continue
        await salvarEmbarcacao({
          marina_id: marinaId,
          cliente_id: novoCliente.id,
          nome: emb.nome,
          tipo: emb.tipo,
          registro: emb.registro || null,
          comprimento_m: emb.comprimento_m || null,
        })
      }
      setFormCliente({ ...CLIENTE_VAZIO })
      setFormEmbarcacoes([{ ...EMBARCACAO_VAZIA }])
      setAba('clientes')
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function alternarPagamento(cliente) {
    await salvarCliente({ id: cliente.id, pagamento_confirmado: !cliente.pagamento_confirmado })
    carregar()
  }

  async function alternarSuspensao(cliente) {
    await salvarCliente({ id: cliente.id, acesso_suspenso: !cliente.acesso_suspenso })
    carregar()
  }

  // Remoção definitiva do cadastro. Pede confirmação por ser irreversível;
  // se o cliente tiver embarcações, cobranças ou outros registros
  // vinculados, o banco recusa a remoção (chave estrangeira) e mostramos
  // uma mensagem orientando a usar "Suspender acesso" nesse caso.
  async function removerClienteConfirmado(cliente) {
    const confirmado = window.confirm(
      `Remover ${cliente.nome} definitivamente? Essa ação não pode ser desfeita.`
    )
    if (!confirmado) return
    setRemovendoId(cliente.id)
    try {
      await removerCliente(cliente.id)
      await carregar()
    } catch (err) {
      if (err.code === '23503' || /foreign key/i.test(err.message || '')) {
        alert('Não é possível remover: este cliente ainda tem embarcações, cobranças ou outros registros vinculados. Remova-os primeiro ou use "Suspender acesso" em vez de remover.')
      } else {
        alert('Não foi possível remover o cliente: ' + err.message)
      }
    } finally {
      setRemovendoId(null)
    }
  }

  function abrirFormEmbarcacaoExtra(clienteId) {
    setFormEmbarcacaoExtra({ ...EMBARCACAO_VAZIA })
    setClienteExpandido(clienteExpandido === clienteId ? null : clienteId)
  }

  async function salvarEmbarcacaoExtra(e, clienteId) {
    e.preventDefault()
    if (!formEmbarcacaoExtra.nome) return
    setSalvandoExtra(true)
    try {
      await salvarEmbarcacao({
        marina_id: marinaId,
        cliente_id: clienteId,
        nome: formEmbarcacaoExtra.nome,
        tipo: formEmbarcacaoExtra.tipo,
        registro: formEmbarcacaoExtra.registro || null,
        comprimento_m: formEmbarcacaoExtra.comprimento_m || null,
      })
      setClienteExpandido(null)
      await carregar()
    } finally {
      setSalvandoExtra(false)
    }
  }

  const totalArrecadado = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const pagamentosPendentes = clientes.filter((c) => !c.pagamento_confirmado).length
  const mensalidades = cobrancas.filter((c) => c.tipo === 'mensalidade')
  const mensalidadeMedia = mensalidades.length
    ? mensalidades.reduce((s, c) => s + Number(c.valor), 0) / mensalidades.length
    : 0

  function embarcacoesDoCliente(clienteId) {
    return embarcacoes.filter((e) => e.cliente_id === clienteId)
  }

  return (
    <div>
      <div className="abas">
        <button className={aba === 'clientes' ? 'ativo' : ''} onClick={() => setAba('clientes')}>Clientes</button>
        <button className={aba === 'adicionar' ? 'ativo' : ''} onClick={() => setAba('adicionar')}>Adicionar cliente</button>
      </div>

      {aba === 'clientes' ? (
        <>
          <div className="resumo-financeiro">
            <div className="stat-card">
              <span>Total arrecadado</span>
              <strong>R$ {totalArrecadado.toFixed(2)}</strong>
            </div>
            <div className="stat-card alerta">
              <span>Pagamentos pendentes</span>
              <strong>{pagamentosPendentes}</strong>
            </div>
            <div className="stat-card">
              <span>Mensalidade</span>
              <strong>R$ {mensalidadeMedia.toFixed(2)}</strong>
            </div>
          </div>

          <div className="lista-cards">
            {clientes.map((c, i) => {
              const acesso = statusAcesso(c)
              return (
                <div key={c.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente">
                      <span className="selo-numero">Nº {String(i + 1).padStart(4, '0')}</span>
                      <span className="nome">{c.nome}</span>
                    </div>
                  </div>
                  <div className="linha"><b>Telefone:</b> {c.telefone || '—'}</div>
                  <div className="linha"><b>E-mail:</b> {c.email || '—'}</div>
                  <div className="linha"><b>Endereço:</b> {c.endereco || '—'}</div>
                  <div className="linha"><b>Carteira de habilitação:</b> {c.cpf_cnpj || '—'}</div>
                  <div className="linha">
                    <b>Embarcações:</b> {embarcacoesDoCliente(c.id).map((e) => e.nome).join(' · ') || '—'}
                  </div>

                  <div className="linha" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
                    <span className={`status-texto ${c.cadastro_confirmado ? 'em-dia' : 'pendente'}`}>Cadastro: {c.cadastro_confirmado ? 'Realizado' : 'Pendente'}</span>
                    <span className={`status-texto ${c.pagamento_confirmado ? 'em-dia' : 'pendente'}`}>
                      Pagamento: {c.pagamento_confirmado ? 'Efetuado' : 'Pendente'}
                    </span>
                    <span className={`status-texto ${acesso.classe}`}>Acesso à Agenda: {acesso.texto}</span>
                  </div>

                  <div className="acoes-modal" style={{ marginTop: 10, justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" onClick={() => alternarPagamento(c)}>
                      {c.pagamento_confirmado ? 'Marcar pagamento como pendente' : 'Confirmar pagamento'}
                    </button>
                    <button type="button" onClick={() => alternarSuspensao(c)}>
                      {c.acesso_suspenso ? 'Reativar acesso' : 'Suspender acesso'}
                    </button>
                    <button type="button" onClick={() => removerClienteConfirmado(c)} disabled={removendoId === c.id}>
                      {removendoId === c.id ? 'Removendo...' : 'Remover cliente'}
                    </button>
                    <button type="button" className="voltar" onClick={() => abrirFormEmbarcacaoExtra(c.id)}>
                      {clienteExpandido === c.id ? 'Cancelar' : '+ Embarcação'}
                    </button>
                  </div>

                  {clienteExpandido === c.id && (
                    <form className="form-inline" style={{ marginTop: 10 }} onSubmit={(e) => salvarEmbarcacaoExtra(e, c.id)}>
                      <select value={formEmbarcacaoExtra.tipo} onChange={(e) => setFormEmbarcacaoExtra({ ...formEmbarcacaoExtra, tipo: e.target.value })}>
                        {TIPOS_EMBARCACAO.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <input placeholder="Nome da embarcação" required value={formEmbarcacaoExtra.nome}
                        onChange={(e) => setFormEmbarcacaoExtra({ ...formEmbarcacaoExtra, nome: e.target.value })} />
                      <input placeholder="Nº de inscrição" value={formEmbarcacaoExtra.registro}
                        onChange={(e) => setFormEmbarcacaoExtra({ ...formEmbarcacaoExtra, registro: e.target.value })} />
                      <input placeholder="Comprimento (m)" type="number" step="0.01" value={formEmbarcacaoExtra.comprimento_m}
                        onChange={(e) => setFormEmbarcacaoExtra({ ...formEmbarcacaoExtra, comprimento_m: e.target.value })} />
                      <button type="submit" disabled={salvandoExtra}>{salvandoExtra ? 'Salvando...' : 'Salvar embarcação'}</button>
                    </form>
                  )}
                </div>
              )
            })}
            {clientes.length === 0 && <p className="dica">Nenhum cliente cadastrado ainda.</p>}
          </div>
        </>
      ) : (
        <form className="card-login" style={{ width: '100%', maxWidth: 560 }} onSubmit={salvarNovoCliente}>
          <h3 style={{ margin: 0 }}>Dados do cliente</h3>
          <input placeholder="Nome" required value={formCliente.nome}
            onChange={(e) => setFormCliente({ ...formCliente, nome: e.target.value })} />
          <input placeholder="E-mail" type="email" value={formCliente.email}
            onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })} />
          <input placeholder="Telefone" value={formCliente.telefone}
            onChange={(e) => setFormCliente({ ...formCliente, telefone: e.target.value })} />
          <input placeholder="Carteira de habilitação / CPF" value={formCliente.cpf_cnpj}
            onChange={(e) => setFormCliente({ ...formCliente, cpf_cnpj: e.target.value })} />
          <input placeholder="Endereço completo" value={formCliente.endereco}
            onChange={(e) => setFormCliente({ ...formCliente, endereco: e.target.value })} />
          <input placeholder="Observações (opcional)" value={formCliente.observacoes}
            onChange={(e) => setFormCliente({ ...formCliente, observacoes: e.target.value })} />

          <p style={{ margin: '8px 0 0', fontWeight: 600, color: 'var(--cor-primaria)' }}>Embarcação(ões) / jet ski(s)</p>
          {formEmbarcacoes.map((emb, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--cor-fundo)', borderRadius: 10 }}>
              <select value={emb.tipo} onChange={(e) => atualizarEmbarcacaoForm(i, 'tipo', e.target.value)}>
                {TIPOS_EMBARCACAO.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input placeholder="Nome da embarcação" value={emb.nome} onChange={(e) => atualizarEmbarcacaoForm(i, 'nome', e.target.value)} />
              <input placeholder="Nº de inscrição" value={emb.registro} onChange={(e) => atualizarEmbarcacaoForm(i, 'registro', e.target.value)} />
              <input placeholder="Comprimento (m)" type="number" step="0.01" value={emb.comprimento_m}
                onChange={(e) => atualizarEmbarcacaoForm(i, 'comprimento_m', e.target.value)} />
              {formEmbarcacoes.length > 1 && (
                <button type="button" className="voltar" style={{ alignSelf: 'flex-start' }} onClick={() => removerEmbarcacaoForm(i)}>
                  Remover esta embarcação
                </button>
              )}
            </div>
          ))}
          <button type="button" className="voltar" style={{ alignSelf: 'flex-start' }}
            onClick={() => setFormEmbarcacoes([...formEmbarcacoes, { ...EMBARCACAO_VAZIA }])}>
            + Adicionar outra embarcação/jet
          </button>

          {erro && <div className="erro">{erro}</div>}
          <button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : '+ Adicionar cliente'}</button>
        </form>
      )}
    </div>
  )
}
