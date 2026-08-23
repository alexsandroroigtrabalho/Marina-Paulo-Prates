import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarClientes, salvarCliente, removerCliente, removerClienteComVinculos, listarEmbarcacoes, salvarEmbarcacao, listarCobrancas, buscarMarina } from '../lib/db'
import { statusAcessoCliente } from '../lib/statusPagamento'
import ChavePagamento from './ChavePagamento'

const TIPOS_EMBARCACAO = ['Barco', 'Veleiro', 'Jet Ski', 'Iate']
const EMBARCACAO_VAZIA = { tipo: 'Barco', nome: '', registro: '', comprimento_m: '' }
const CLIENTE_VAZIO = { nome: '', email: '', telefone: '', cpf_cnpj: '', endereco: '', observacoes: '' }

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
  // Valor da mensalidade configurado em Painel de Controle → Configurações
  // → Financeiro (marinas.config_json.valorMensalidade) — mostrado aqui
  // como referência, não é mais uma média calculada das cobranças.
  const [valorMensalidadeConfig, setValorMensalidadeConfig] = useState(null)

  async function carregar() {
    if (!marinaId) return
    const [c, e, cob] = await Promise.all([listarClientes(marinaId), listarEmbarcacoes(marinaId), listarCobrancas(marinaId)])
    setClientes(c); setEmbarcacoes(e); setCobrancas(cob)
  }

  function carregarConfigMarina() {
    if (!marinaId) return
    buscarMarina(marinaId).then((m) => setValorMensalidadeConfig(m?.config_json?.valorMensalidade ?? null))
  }

  useEffect(() => { carregar() }, [marinaId])
  useEffect(() => { carregarConfigMarina() }, [marinaId])

  // Atualização em tempo real da mensalidade configurada — muda assim que o
  // administrador salva um novo valor em Configurações, sem F5.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`clientes-${marinaId}-config-marina`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'marina', table: 'marinas', filter: `id=eq.${marinaId}` }, () => carregarConfigMarina())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  // Atualização automática em tempo real: além do próprio administrador
  // mexendo na chave de pagamento, o status também pode mudar sozinho (o
  // reset automático de dia 5 — ver função marina.resetar_pagamentos_mensal
  // no banco) ou por outro administrador logado em outra tela. Sem isto,
  // o Painel de Controle de Clientes só refletiria essas mudanças depois de
  // um F5 manual — mesma lógica já usada no painel do cliente.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`clientes-${marinaId}-status`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'clientes', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

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

  async function alternarSuspensao(cliente) {
    try {
      await salvarCliente({ id: cliente.id, acesso_suspenso: !cliente.acesso_suspenso })
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar o acesso: ' + err.message)
    }
  }

  // Liberação manual da Agenda (e das demais áreas que dependem de
  // pagamento) mesmo sem o pagamento confirmado — não mexe em
  // pagamento_confirmado, só destrava o acesso à parte. Pede confirmação
  // nos dois sentidos (liberar e revogar), já que muda o que o cliente
  // consegue fazer no app.
  async function alternarLiberacaoManual(cliente) {
    const mensagem = cliente.acesso_liberado_manual
      ? `Revogar a liberação manual de acesso de ${cliente.nome}? A Agenda voltará a depender da confirmação de pagamento.`
      : `Liberar o acesso de ${cliente.nome} à Agenda e às demais áreas que dependem de pagamento, mesmo sem o pagamento confirmado?\n\n` +
        'O status financeiro não é alterado automaticamente — o pagamento continua marcado como pendente até a administração confirmá-lo.'
    if (!window.confirm(mensagem)) return
    try {
      await salvarCliente({ id: cliente.id, acesso_liberado_manual: !cliente.acesso_liberado_manual })
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar a liberação manual: ' + err.message)
    }
  }

  // Remoção definitiva do cadastro. Pede confirmação por ser irreversível.
  // Se o cliente tiver embarcações, cobranças ou outros registros
  // vinculados, o banco recusa a remoção só do cadastro (chave estrangeira)
  // — nesse caso oferecemos ao administrador a opção de remover também
  // todos esses vínculos junto (apaga o histórico inteiro do cliente), ou
  // cancelar e usar "Suspender acesso" em vez de remover.
  async function removerClienteConfirmado(cliente) {
    const confirmado = window.confirm(
      `Remover ${cliente.nome} definitivamente? Essa ação não pode ser desfeita.`
    )
    if (!confirmado) return

    setRemovendoId(cliente.id)
    try {
      await removerCliente(cliente.id)
      await carregar()
      return
    } catch (err) {
      const temVinculos = err.code === '23503' || /foreign key/i.test(err.message || '')
      if (!temVinculos) {
        alert('Não foi possível remover o cliente: ' + err.message)
        setRemovendoId(null)
        return
      }
    }

    const removerTudo = window.confirm(
      `${cliente.nome} tem embarcações, cobranças, ordens de serviço ou outros registros vinculados — por isso não dá pra remover só o cadastro.\n\n` +
      'Clique em OK para remover o cliente E todos esses vínculos (apaga todo o histórico dele, ação irreversível), ' +
      'ou em Cancelar para manter tudo como está e usar "Suspender acesso" em vez de remover.'
    )
    if (!removerTudo) {
      setRemovendoId(null)
      return
    }

    try {
      await removerClienteComVinculos(cliente.id)
      await carregar()
    } catch (err) {
      alert('Não foi possível remover o cliente e os vínculos: ' + err.message)
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
    } catch (err) {
      alert('Não foi possível salvar a embarcação: ' + err.message)
    } finally {
      setSalvandoExtra(false)
    }
  }

  const totalArrecadado = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const pagamentosPendentes = clientes.filter((c) => !c.pagamento_confirmado).length

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
              <span>Mensalidade (valor configurado)</span>
              <strong>{valorMensalidadeConfig != null ? `R$ ${Number(valorMensalidadeConfig).toFixed(2)}` : 'Não configurado'}</strong>
            </div>
          </div>

          <div className="lista-cards">
            {clientes.map((c, i) => {
              const acesso = statusAcessoCliente(c)
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

                  <div className="linha" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', marginTop: 8 }}>
                    <span className={`status-texto ${c.cadastro_confirmado ? 'em-dia' : 'pendente'}`}>Cadastro: {c.cadastro_confirmado ? 'Realizado' : 'Pendente'}</span>

                    {/* Chave de pagamento — mesmo componente usado na aba Financeiro
                        (ChavePagamento), pra nunca dessincronizar rótulo/cor entre as
                        duas telas. Sempre um clique manual e explícito do administrador. */}
                    <ChavePagamento cliente={c} onAtualizado={carregar} />

                    <span className={`status-texto ${acesso.classe}`}>Acesso à Agenda: {acesso.texto}</span>
                    {/* Indicador dedicado, além do rótulo acima, pra deixar bem visível
                        que o acesso está liberado sem pagamento confirmado — some
                        sozinho assim que o pagamento é confirmado ou a liberação é
                        revogada. */}
                    {c.acesso_liberado_manual && !c.pagamento_confirmado && !c.acesso_suspenso && (
                      <span className="status-texto pendente" title="Acesso liberado manualmente pela administração, sem confirmação de pagamento">
                        🔓 Liberado manualmente sem pagamento
                      </span>
                    )}
                  </div>

                  <div className="acoes-modal" style={{ marginTop: 10, justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" onClick={() => alternarLiberacaoManual(c)}>
                      {c.acesso_liberado_manual ? 'Revogar liberação manual' : 'Liberar acesso sem confirmação de pagamento'}
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
