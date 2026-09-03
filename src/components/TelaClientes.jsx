import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
// listarCobrancas saiu daqui junto com o cartão "Total arrecadado": a
// cobrança passou para o RV Finance (SaaS separado). A função continua em
// lib/db.js e a tabela `cobrancas` segue no banco, com os dados intactos.
import { listarClientes, salvarCliente, removerCliente, removerClienteComVinculos, listarEmbarcacoes, salvarEmbarcacao, removerEmbarcacao } from '../lib/db'
import { statusAcessoCliente } from '../lib/statusPagamento'
import { maskCpf, maskTelefone } from '../lib/mascaras'
import EditarClienteModal from './EditarClienteModal'

const TIPOS_EMBARCACAO = ['Barco', 'Veleiro', 'Jet Ski', 'Iate']
const EMBARCACAO_VAZIA = { tipo: 'Barco', nome: '', registro: '', comprimento_m: '' }
const CLIENTE_VAZIO = { nome: '', email: '', telefone: '', cpf_cnpj: '', documento_identidade: '', cha_validade: '', endereco: '', observacoes: '' }

// Documentação (CHA) — indicador automático no card do cliente, exclusivo
// do Painel do Administrador (ver migration_cha_validade.sql: cha_validade
// só pode ser lida/alterada por aqui; some do Diário de Bordo e da visão do
// cliente de propósito, então esta função e o campo que ela lê não têm
// equivalente em TelaClienteDashboard.jsx). Compara só a DATA (meio-dia
// local, sem hora) — "T00:00:00" evita o fuso tratar a string "AAAA-MM-DD"
// (sem indicação de fuso) como UTC e adiantar/atrasar um dia perto da
// virada, mesmo cuidado já usado com datetime-local em outras telas.
function statusChaCliente(cliente) {
  if (!cliente.cha_validade) return { texto: 'CHA não cadastrada', classe: 'cha-sem-dado' }
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const validade = new Date(`${cliente.cha_validade}T00:00:00`)
  return validade >= hoje
    ? { texto: 'REGULAR', classe: 'cha-regular' }
    : { texto: 'VENCIDO', classe: 'cha-vencido' }
}

export default function TelaClientes({ marinaId }) {
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
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
  // Cliente aberto no modal de edição (EditarClienteModal.jsx) — null quando
  // fechado. Guarda o registro inteiro (não só o id) pra pré-preencher o
  // form sem precisar buscar de novo em `clientes`.
  const [clienteEditando, setClienteEditando] = useState(null)
  // Edição inline de nome/registro de uma embarcação já cadastrada, direto
  // na linha (nome e nº de inscrição editáveis lado a lado + "Salvar") — ver
  // salvarEdicaoEmbarcacao abaixo. A exclusão agora tem botão próprio
  // ("- Embarcação", ver removerEmbarcacaoInline) em vez de depender de
  // apagar o nome e salvar; removerEmbarcacao (soft-delete, ver lib/db.js e
  // migration_embarcacao_ativa.sql) é a mesma função dos dois jeitos.
  const [nomesEmbarcacaoEditados, setNomesEmbarcacaoEditados] = useState({})
  const [registrosEmbarcacaoEditados, setRegistrosEmbarcacaoEditados] = useState({})
  const [salvandoEdicaoEmbarcacaoId, setSalvandoEdicaoEmbarcacaoId] = useState(null)
  // A mensalidade configurada (marinas.config_json.valorMensalidade) não é
  // mais lida aqui: a cobrança passou para o RV Finance. A configuração
  // continua existindo no banco, só deixou de aparecer nesta tela — por isso
  // também caiu o canal realtime que ouvia UPDATE em marina.marinas.

  async function carregar() {
    if (!marinaId) return
    const [c, e] = await Promise.all([listarClientes(marinaId), listarEmbarcacoes(marinaId)])
    setClientes(c); setEmbarcacoes(e)
  }

  useEffect(() => { carregar() }, [marinaId])

  // Atualização automática em tempo real: o cadastro e o acesso do cliente
  // podem mudar por outro administrador logado em outra tela, ou por
  // alterações feitas direto no banco. Sem isto, o Painel de Controle de
  // Clientes só refletiria essas mudanças depois de um F5 manual — mesma
  // lógica já usada no painel do cliente.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`clientes-${marinaId}-status`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'clientes', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      // Embarcação cadastrada/editada pelo próprio cliente direto no Diário
      // de Bordo (TelaClienteDashboard.jsx → "Minha conta" → Embarcações)
      // também precisa aparecer aqui sem F5 — sincronização bidirecional:
      // ver migration_cha_validade.sql / comentário no App sobre o pedido
      // "Admin ↔ Diário de Bordo". Antes desta linha só a tabela `clientes`
      // era ouvida; embarcações novas só apareciam depois de recarregar.
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'embarcacoes', filter: `marina_id=eq.${marinaId}` }, () => carregar())
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
        // nasce completo e com acesso liberado — não há mais nada de pagamento
        // a confirmar antes de usar a agenda (isso é do RV Finance agora).
        cadastro_confirmado: true,
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

  // A liberação manual de acesso (acesso_liberado_manual) saiu daqui junto
  // com a cobrança, que passou para o RV Finance — só fazia sentido como
  // exceção a um pagamento pendente. A coluna continua no banco com os
  // dados preservados; a suspensão de acesso acima é administrativa e fica.

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

  function embarcacoesDoCliente(clienteId) {
    return embarcacoes.filter((e) => e.cliente_id === clienteId)
  }

  // Salva nome e/ou nº de inscrição editados inline na linha da embarcação.
  // Apagar o nome e salvar ainda exclui (mesma trava de segurança de antes),
  // mas a exclusão normal agora passa pelo botão próprio "- Embarcação" (ver
  // removerEmbarcacaoInline logo abaixo) — os dois lados (Painel do
  // Administrador e Diário de Bordo) enxergam a mudança na hora um do outro
  // via o Realtime já assinado em `embarcacoes`.
  async function salvarEdicaoEmbarcacao(emb) {
    const novoNome = (nomesEmbarcacaoEditados[emb.id] ?? emb.nome).trim()
    const novoRegistro = (registrosEmbarcacaoEditados[emb.id] ?? (emb.registro || '')).trim()
    if (novoNome === emb.nome && novoRegistro === (emb.registro || '')) return
    if (!novoNome && !confirm(`Excluir a embarcação "${emb.nome}"? Essa ação não pode ser desfeita.`)) return
    setSalvandoEdicaoEmbarcacaoId(emb.id)
    try {
      if (novoNome) {
        await salvarEmbarcacao({ id: emb.id, nome: novoNome, registro: novoRegistro || null })
      } else {
        await removerEmbarcacao(emb.id)
      }
      setNomesEmbarcacaoEditados((atual) => {
        const copia = { ...atual }
        delete copia[emb.id]
        return copia
      })
      setRegistrosEmbarcacaoEditados((atual) => {
        const copia = { ...atual }
        delete copia[emb.id]
        return copia
      })
      await carregar()
    } catch (err) {
      alert('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvandoEdicaoEmbarcacaoId(null)
    }
  }

  // "- Embarcação": exclusão num clique só, sem precisar apagar o nome
  // primeiro — mesma confirmação de segurança e o mesmo soft-delete
  // (removerEmbarcacao, ver lib/db.js) de sempre.
  async function removerEmbarcacaoInline(emb) {
    if (!confirm(`Excluir a embarcação "${emb.nome}"? Essa ação não pode ser desfeita.`)) return
    setSalvandoEdicaoEmbarcacaoId(emb.id)
    try {
      await removerEmbarcacao(emb.id)
      await carregar()
    } catch (err) {
      alert('Não foi possível excluir: ' + err.message)
    } finally {
      setSalvandoEdicaoEmbarcacaoId(null)
    }
  }

  return (
    <div>
      <div className="abas">
        <button className={aba === 'clientes' ? 'ativo' : ''} onClick={() => setAba('clientes')}>Clientes</button>
        <button className={aba === 'adicionar' ? 'ativo' : ''} onClick={() => setAba('adicionar')}>Adicionar cliente</button>
      </div>

      {aba === 'clientes' ? (
        <>
          {/* Os cartões de "Pagamentos pendentes", de mensalidade configurada
              e de "Total arrecadado" saíram: cobrança e pagamento passaram
              para o RV Finance. As colunas (pagamento_confirmado,
              pagamento_confirmado_em, acesso_liberado_manual) e a tabela
              `cobrancas` continuam no banco, apenas não são mais exibidas
              nesta tela. */}

          <div className="lista-cards">
            {clientes.map((c, i) => {
              const acesso = statusAcessoCliente(c)
              const documentacao = statusChaCliente(c)
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
                  <div className="linha"><b>CPF:</b> {c.cpf_cnpj || '—'}</div>
                  <div className="linha"><b>CHA:</b> {c.documento_identidade || '—'}</div>
                  <div className="linha" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <b>Embarcações:</b>
                    {embarcacoesDoCliente(c.id).length === 0 && clienteExpandido !== c.id && '—'}
                    {embarcacoesDoCliente(c.id).map((emb) => {
                      const nomeAtual = nomesEmbarcacaoEditados[emb.id] ?? emb.nome
                      const registroAtual = registrosEmbarcacaoEditados[emb.id] ?? (emb.registro || '')
                      const alterado = nomeAtual.trim() !== emb.nome || registroAtual.trim() !== (emb.registro || '')
                      return (
                        <div key={emb.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {/* size (não width) faz a caixa acompanhar o
                                tamanho do nome digitado, em vez de esticar
                                pro resto da linha — mínimo de 6 pra não
                                colapsar com o campo vazio. */}
                            <input size={Math.max(nomeAtual.length, 6)} placeholder="Nome da embarcação" value={nomeAtual}
                              onChange={(e) => setNomesEmbarcacaoEditados({ ...nomesEmbarcacaoEditados, [emb.id]: e.target.value })} />
                            <button type="button" className="voltar" disabled={!alterado || salvandoEdicaoEmbarcacaoId === emb.id}
                              onClick={() => salvarEdicaoEmbarcacao(emb)}>
                              {salvandoEdicaoEmbarcacaoId === emb.id ? 'Salvando...' : 'Salvar'}
                            </button>
                          </div>
                          <input style={{ width: 130 }} placeholder="Nº de inscrição" value={registroAtual}
                            onChange={(e) => setRegistrosEmbarcacaoEditados({ ...registrosEmbarcacaoEditados, [emb.id]: e.target.value })} />
                          <button type="button" className="voltar" style={{ alignSelf: 'flex-start' }} disabled={salvandoEdicaoEmbarcacaoId === emb.id}
                            onClick={() => removerEmbarcacaoInline(emb)}>
                            Remover embarcação
                          </button>
                        </div>
                      )
                    })}
                    {/* "+ Embarcação"/"Remover embarcação" ficam aqui, junto
                        da lista — o botão que existia lá embaixo, ao lado de
                        "Remover cliente", saiu por ser redundante com este.
                        A exclusão tem botão próprio (removerEmbarcacaoInline);
                        apagar o nome e Salvar continua excluindo também, como
                        rede de segurança (ver salvarEdicaoEmbarcacao). */}
                    {clienteExpandido === c.id ? (
                      <form className="form-inline" style={{ marginTop: 4 }} onSubmit={(e) => salvarEmbarcacaoExtra(e, c.id)}>
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
                        <button type="button" className="voltar" onClick={() => setClienteExpandido(null)}>Cancelar</button>
                      </form>
                    ) : (
                      <button type="button" className="voltar" style={{ alignSelf: 'flex-start' }} onClick={() => abrirFormEmbarcacaoExtra(c.id)}>
                        + Embarcação
                      </button>
                    )}
                  </div>
                  {/* Validade da CHA e o selo "Documentação" abaixo são
                      exclusivos deste painel — não aparecem em "Minha conta"
                      nem no Diário de Bordo (ver migration_cha_validade.sql). */}
                  <div className="linha"><b>Validade da CHA:</b> {c.cha_validade ? new Date(`${c.cha_validade}T00:00:00`).toLocaleDateString('pt-BR') : '—'}</div>

                  <div className="linha" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', marginTop: 8 }}>
                    <span className={`status-texto ${c.cadastro_confirmado ? 'em-dia' : 'pendente'}`}>Cadastro: {c.cadastro_confirmado ? 'Realizado' : 'Pendente'}</span>

                    {/* A chave de pagamento e o selo de liberação manual saíram
                        daqui: a cobrança passou para o RV Finance. As colunas
                        seguem no banco, só não são mais mostradas nem editadas
                        nesta tela. */}
                    <span className={`status-texto ${acesso.classe}`}>Acesso à Agenda: {acesso.texto}</span>
                    <span className={`badge status-${documentacao.classe}`}>Documentação: {documentacao.texto}</span>
                  </div>

                  <div className="cliente-card-acoes">
                    <button type="button" className="botao-secundario" onClick={() => setClienteEditando(c)}>
                      Editar
                    </button>
                    <button type="button" className="botao-secundario" onClick={() => alternarSuspensao(c)}>
                      {c.acesso_suspenso ? 'Reativar acesso' : 'Suspender acesso'}
                    </button>
                    <button type="button" className="botao-secundario perigo" onClick={() => removerClienteConfirmado(c)} disabled={removendoId === c.id}>
                      {removendoId === c.id ? 'Removendo...' : 'Remover cliente'}
                    </button>
                  </div>
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
          <input placeholder="Telefone" inputMode="numeric" maxLength={15} value={formCliente.telefone}
            onChange={(e) => setFormCliente({ ...formCliente, telefone: maskTelefone(e.target.value) })} />
          <input placeholder="CPF" inputMode="numeric" maxLength={14} value={formCliente.cpf_cnpj}
            onChange={(e) => setFormCliente({ ...formCliente, cpf_cnpj: maskCpf(e.target.value) })} />
          <input placeholder="Nº da Carteira de Habilitação de Amador (CHA)" value={formCliente.documento_identidade}
            onChange={(e) => setFormCliente({ ...formCliente, documento_identidade: e.target.value })} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--cor-primaria)', fontWeight: 600 }}>
            Data de validade da CHA
            <input type="date" style={{ fontWeight: 400 }} value={formCliente.cha_validade}
              onChange={(e) => setFormCliente({ ...formCliente, cha_validade: e.target.value })} />
          </label>
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

      <EditarClienteModal
        cliente={clienteEditando}
        onFechar={() => setClienteEditando(null)}
        onSalvo={carregar}
      />
    </div>
  )
}
