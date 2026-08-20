import { useEffect, useState } from 'react'
import { IconAnchor, IconLogout, IconShip, IconAnchorOff, IconFileCertificate, IconGasStation, IconUsers, IconTrash } from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, db } from '../lib/supabase'
import {
  listarAgendamentosCliente, solicitarAgendamento, listarLaudosCliente, solicitarLaudo, listarDespachosCliente,
  listarCombustiveis, listarPedidosAbastecimentoCliente, solicitarAbastecimento,
  listarAutorizados, adicionarAutorizado, atualizarAutorizado, removerAutorizado,
} from '../lib/db'

const PARENTESCOS = ['filho(a)', 'conjuge', 'socio', 'funcionario', 'outro']

const TIPO_LABEL = {
  retirada: 'Retirada para água',
  retorno: 'Atracação de retorno',
}

const STATUS_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  emitido: 'Emitido',
  cancelado: 'Cancelado',
  protocolado: 'Protocolado',
  em_analise: 'Em análise',
  exigencia: 'Exigência pendente',
  aprovado: 'Aprovado',
  indeferido: 'Indeferido',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  entregue: 'Entregue',
}

const FINALIDADES_LAUDO = ['seguro', 'financiamento', 'transferencia_propriedade', 'regularizacao', 'outro']

export default function TelaClienteDashboard({ perfil }) {
  const [cliente, setCliente] = useState(null)
  const [reservas, setReservas] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [abastecimentos, setAbastecimentos] = useState([])
  const [autorizados, setAutorizados] = useState([])
  const [modalAutorizadosAberto, setModalAutorizadosAberto] = useState(false)
  const [formAutorizado, setFormAutorizado] = useState({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
  const [salvandoAutorizado, setSalvandoAutorizado] = useState(false)
  const [modalTipo, setModalTipo] = useState(null) // 'retirada' | 'retorno' | null
  const [formAgendamento, setFormAgendamento] = useState({ embarcacao_id: '', data_hora: '', observacoes: '' })
  const [enviandoAgendamento, setEnviandoAgendamento] = useState(false)
  const [modalLaudoAberto, setModalLaudoAberto] = useState(false)
  const [formLaudo, setFormLaudo] = useState({ embarcacao_id: '', tipo: 'vistoria', finalidade: 'seguro', observacoes: '' })
  const [enviandoLaudo, setEnviandoLaudo] = useState(false)
  const [modalAbastecimentoAberto, setModalAbastecimentoAberto] = useState(false)
  const [formAbastecimento, setFormAbastecimento] = useState({ embarcacao_id: '', combustivel_id: '', quantidade_litros: '' })
  const [enviandoAbastecimento, setEnviandoAbastecimento] = useState(false)
  const [pedidoGerado, setPedidoGerado] = useState(null) // pedido recém-criado, para mostrar o QR

  async function carregar() {
    const { data: cli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
    setCliente(cli)
    if (!cli) return
    const { data: res } = await db.from('reservas').select('*, vagas(codigo)').eq('cliente_id', cli.id)
    setReservas(res || [])
    const { data: cob } = await db.from('cobrancas').select('*').eq('cliente_id', cli.id)
    setCobrancas(cob || [])
    const { data: emb } = await db.from('embarcacoes').select('*').eq('cliente_id', cli.id)
    setEmbarcacoes(emb || [])
    setAgendamentos(await listarAgendamentosCliente(cli.id))
    setLaudos(await listarLaudosCliente(cli.id))
    setDespachos(await listarDespachosCliente(cli.id))
    setCombustiveis((await listarCombustiveis(cli.marina_id)).filter((c) => c.ativo))
    setAbastecimentos(await listarPedidosAbastecimentoCliente(cli.id))
    setAutorizados(await listarAutorizados(cli.id))
  }

  useEffect(() => { carregar() }, [perfil])

  function abrirModal(tipo) {
    setFormAgendamento({ embarcacao_id: embarcacoes[0]?.id || '', data_hora: '', observacoes: '', autorizado_id: '' })
    setModalTipo(tipo)
  }

  async function enviarAgendamento(e) {
    e.preventDefault()
    if (!cliente) return
    setEnviandoAgendamento(true)
    try {
      await solicitarAgendamento({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formAgendamento.embarcacao_id || null,
        tipo: modalTipo,
        data_hora: formAgendamento.data_hora,
        observacoes: formAgendamento.observacoes || null,
        autorizado_id: formAgendamento.autorizado_id || null,
      })
      setModalTipo(null)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoAgendamento(false)
    }
  }

  function abrirModalAutorizados() {
    setFormAutorizado({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
    setModalAutorizadosAberto(true)
  }

  async function enviarNovoAutorizado(e) {
    e.preventDefault()
    if (!cliente) return
    setSalvandoAutorizado(true)
    try {
      await adicionarAutorizado({ marina_id: cliente.marina_id, cliente_id: cliente.id, ...formAutorizado })
      setFormAutorizado({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setSalvandoAutorizado(false)
    }
  }

  async function alternarAutorizado(autorizado) {
    await atualizarAutorizado(autorizado.id, { ativo: !autorizado.ativo })
    carregar()
  }

  async function excluirAutorizado(id) {
    if (!confirm('Remover esta pessoa autorizada?')) return
    await removerAutorizado(id)
    carregar()
  }

  function abrirModalLaudo() {
    setFormLaudo({ embarcacao_id: embarcacoes[0]?.id || '', tipo: 'vistoria', finalidade: 'seguro', observacoes: '' })
    setModalLaudoAberto(true)
  }

  async function enviarLaudo(e) {
    e.preventDefault()
    if (!cliente) return
    setEnviandoLaudo(true)
    try {
      await solicitarLaudo({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formLaudo.embarcacao_id,
        tipo: formLaudo.tipo,
        finalidade: formLaudo.finalidade,
        observacoes: formLaudo.observacoes || null,
      })
      setModalLaudoAberto(false)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoLaudo(false)
    }
  }

  function abrirModalAbastecimento() {
    setFormAbastecimento({ embarcacao_id: embarcacoes[0]?.id || '', combustivel_id: combustiveis[0]?.id || '', quantidade_litros: '' })
    setModalAbastecimentoAberto(true)
  }

  async function enviarAbastecimento(e) {
    e.preventDefault()
    if (!cliente) return
    const combustivel = combustiveis.find((c) => c.id === formAbastecimento.combustivel_id)
    if (!combustivel) return
    const litros = Number(formAbastecimento.quantidade_litros)
    const valorTotal = litros * Number(combustivel.preco_litro)
    setEnviandoAbastecimento(true)
    try {
      // QR "Pix copia e cola" de demonstração — o pagamento real será conectado
      // quando a marina configurar sua própria conta Mercado Pago.
      const qrDemo = `00020126DEMO-PIX-MARINA5204000053039865406${valorTotal.toFixed(2)}5802BR5913Marina Manager6009DEMO-QR`
      const pedido = await solicitarAbastecimento({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formAbastecimento.embarcacao_id || null,
        combustivel_id: combustivel.id,
        quantidade_litros: litros,
        preco_litro_no_pedido: combustivel.preco_litro,
        valor_total: valorTotal,
        status: 'aguardando_pagamento',
        qr_code: qrDemo,
        qr_code_demo: true,
      })
      setModalAbastecimentoAberto(false)
      setPedidoGerado({ ...pedido, combustivelNome: combustivel.nome })
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoAbastecimento(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cor-primaria)' }}>
          <IconAnchor /> <strong>Marina Paulo Prates</strong>
        </div>
        <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} onClick={() => supabase.auth.signOut()}>
          <IconLogout size={16} /> Sair
        </button>
      </header>

      {!cliente && <p>Seu cadastro ainda está em análise pela administração da marina.</p>}

      {cliente && (
        <>
          <h2>Olá, {cliente.nome}</h2>
          <p style={{ color: cliente.status === 'ativo' ? 'var(--cor-secundaria)' : 'var(--cor-alerta)' }}>
            Status: {cliente.status}
          </p>

          <div style={{ display: 'flex', gap: 10, margin: '4px 0 20px' }}>
            <button className="btn-primario" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => abrirModal('retirada')}>
              <IconShip size={18} /> Solicitar retirada
            </button>
            <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => abrirModal('retorno')}>
              <IconAnchorOff size={18} /> Agendar retorno
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={abrirModalLaudo}>
              <IconFileCertificate size={18} /> Solicitar laudo técnico
            </button>
            <button className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={abrirModalAbastecimento} disabled={combustiveis.length === 0}>
              <IconGasStation size={18} /> Pedir abastecimento
            </button>
          </div>

          <button className="btn-outline" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 20 }}
            onClick={abrirModalAutorizados}>
            <IconUsers size={18} /> Pessoas autorizadas ({autorizados.filter((a) => a.ativo).length})
          </button>

          {abastecimentos.length > 0 && (
            <>
              <h3>Meus abastecimentos</h3>
              <div className="lista-cards">
                {abastecimentos.map((p) => (
                  <div key={p.id} className="cliente-card">
                    <div className="linha"><b>{p.combustiveis?.nome}</b> — {Number(p.quantidade_litros).toFixed(2)} L{p.embarcacoes?.nome ? ` — ${p.embarcacoes.nome}` : ''}</div>
                    <div className="linha">Total: R$ {Number(p.valor_total).toFixed(2)}</div>
                    <span className={`status-texto ${p.status === 'pago' || p.status === 'entregue' ? 'em-dia' : 'pendente'}`}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {(laudos.length > 0 || despachos.length > 0) && (
            <>
              <h3>Laudos e regularização</h3>
              <div className="lista-cards">
                {laudos.map((l) => (
                  <div key={`laudo-${l.id}`} className="cliente-card">
                    <div className="linha"><b>Laudo — {l.tipo}</b>{l.embarcacoes?.nome ? ` — ${l.embarcacoes.nome}` : ''}</div>
                    <div className="linha">Finalidade: {l.finalidade || '-'}</div>
                    <span className={`status-texto ${l.status === 'emitido' ? 'em-dia' : 'pendente'}`}>
                      {STATUS_LABEL[l.status] || l.status}
                    </span>
                  </div>
                ))}
                {despachos.map((d) => (
                  <div key={`despacho-${d.id}`} className="cliente-card">
                    <div className="linha"><b>Despacho — {d.tipo?.replace('_', ' ')}</b>{d.embarcacoes?.nome ? ` — ${d.embarcacoes.nome}` : ''}</div>
                    <div className="linha">{d.orgao}{d.numero_protocolo ? ` · Protocolo ${d.numero_protocolo}` : ''}</div>
                    <span className={`status-texto ${d.status === 'concluido' || d.status === 'aprovado' ? 'em-dia' : 'pendente'}`}>
                      {STATUS_LABEL[d.status] || d.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3>Meus agendamentos</h3>
          <div className="lista-cards">
            {agendamentos.length === 0 && <p className="dica">Nenhum agendamento solicitado ainda.</p>}
            {agendamentos.map((a) => (
              <div key={a.id} className="cliente-card">
                <div className="linha"><b>{TIPO_LABEL[a.tipo] || a.tipo}</b>{a.embarcacoes?.nome ? ` — ${a.embarcacoes.nome}` : ''}</div>
                <div className="linha">{new Date(a.data_hora).toLocaleString('pt-BR')}</div>
                <span className={`status-texto ${a.status === 'confirmado' || a.status === 'concluido' ? 'em-dia' : 'pendente'}`}>
                  {STATUS_LABEL[a.status] || a.status}
                </span>
              </div>
            ))}
          </div>

          <h3>Minhas reservas</h3>
          <div className="lista-cards">
            {reservas.length === 0 && <p className="dica">Nenhuma reserva ainda.</p>}
            {reservas.map((r) => (
              <div key={r.id} className="cliente-card">
                <div className="linha"><b>Vaga:</b> {r.vagas?.codigo}</div>
                <div className="linha"><b>Início:</b> {r.data_inicio}</div>
                <span className={`status-texto ${r.status === 'confirmada' ? 'em-dia' : 'pendente'}`}>{r.status}</span>
              </div>
            ))}
          </div>

          <h3>Minhas cobranças</h3>
          <div className="lista-cards">
            {cobrancas.length === 0 && <p className="dica">Nenhuma cobrança ainda.</p>}
            {cobrancas.map((c) => (
              <div key={c.id} className="cliente-card">
                <div className="linha"><b>{c.descricao}</b></div>
                <div className="linha">Vencimento: {c.vencimento} — R$ {Number(c.valor).toFixed(2)}</div>
                <span className={`status-texto ${c.status === 'pago' ? 'em-dia' : 'pendente'}`}>
                  {c.status === 'pago' ? 'Pagamento em dia' : 'Pagamento pendente'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {modalTipo && (
        <div className="modal-fundo" onClick={() => setModalTipo(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarAgendamento}>
            <h3>{modalTipo === 'retirada' ? 'Solicitar retirada para água' : 'Agendar atracação de retorno'}</h3>
            {embarcacoes.length > 0 ? (
              <select required value={formAgendamento.embarcacao_id}
                onChange={(e) => setFormAgendamento({ ...formAgendamento, embarcacao_id: e.target.value })}>
                <option value="">Selecione a embarcação</option>
                {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <p className="dica">Você ainda não tem embarcações cadastradas.</p>
            )}
            <input type="datetime-local" required
              value={formAgendamento.data_hora}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, data_hora: e.target.value })} />
            <select value={formAgendamento.autorizado_id}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, autorizado_id: e.target.value })}>
              <option value="">Quem vai buscar/entregar: eu mesmo</option>
              {autorizados.filter((a) => a.ativo).map((a) => (
                <option key={a.id} value={a.id}>{a.nome} ({a.parentesco})</option>
              ))}
            </select>
            <input placeholder="Observações (opcional)"
              value={formAgendamento.observacoes}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, observacoes: e.target.value })} />
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalTipo(null)}>Cancelar</button>
              <button type="submit" disabled={enviandoAgendamento}>{enviandoAgendamento ? 'Enviando...' : 'Confirmar solicitação'}</button>
            </div>
          </form>
        </div>
      )}

      {modalLaudoAberto && (
        <div className="modal-fundo" onClick={() => setModalLaudoAberto(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarLaudo}>
            <h3>Solicitar laudo técnico</h3>
            <p className="dica">Laudo emitido por engenheiro responsável da marina — vale para seguro, financiamento, transferência ou regularização.</p>
            {embarcacoes.length > 0 ? (
              <select required value={formLaudo.embarcacao_id}
                onChange={(e) => setFormLaudo({ ...formLaudo, embarcacao_id: e.target.value })}>
                <option value="">Selecione a embarcação</option>
                {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <p className="dica">Você ainda não tem embarcações cadastradas.</p>
            )}
            <select value={formLaudo.tipo} onChange={(e) => setFormLaudo({ ...formLaudo, tipo: e.target.value })}>
              <option value="vistoria">Vistoria</option>
              <option value="avaliacao">Avaliação</option>
              <option value="transferencia">Transferência</option>
              <option value="seguro">Seguro</option>
              <option value="outro">Outro</option>
            </select>
            <select value={formLaudo.finalidade} onChange={(e) => setFormLaudo({ ...formLaudo, finalidade: e.target.value })}>
              {FINALIDADES_LAUDO.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
            </select>
            <input placeholder="Observações (opcional)"
              value={formLaudo.observacoes}
              onChange={(e) => setFormLaudo({ ...formLaudo, observacoes: e.target.value })} />
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalLaudoAberto(false)}>Cancelar</button>
              <button type="submit" disabled={enviandoLaudo}>{enviandoLaudo ? 'Enviando...' : 'Confirmar solicitação'}</button>
            </div>
          </form>
        </div>
      )}

      {modalAbastecimentoAberto && (
        <div className="modal-fundo" onClick={() => setModalAbastecimentoAberto(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarAbastecimento}>
            <h3>Pedir abastecimento</h3>
            {embarcacoes.length > 0 ? (
              <select required value={formAbastecimento.embarcacao_id}
                onChange={(e) => setFormAbastecimento({ ...formAbastecimento, embarcacao_id: e.target.value })}>
                <option value="">Selecione a embarcação</option>
                {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <p className="dica">Você ainda não tem embarcações cadastradas.</p>
            )}
            <select required value={formAbastecimento.combustivel_id}
              onChange={(e) => setFormAbastecimento({ ...formAbastecimento, combustivel_id: e.target.value })}>
              <option value="">Selecione o combustível</option>
              {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome} — R$ {Number(c.preco_litro).toFixed(2)}/L</option>)}
            </select>
            <input type="number" min="1" step="0.5" required placeholder="Quantidade (litros)"
              value={formAbastecimento.quantidade_litros}
              onChange={(e) => setFormAbastecimento({ ...formAbastecimento, quantidade_litros: e.target.value })} />
            {formAbastecimento.combustivel_id && formAbastecimento.quantidade_litros > 0 && (
              <p className="dica">
                Total estimado: <b>R$ {(Number(formAbastecimento.quantidade_litros) * Number(combustiveis.find((c) => c.id === formAbastecimento.combustivel_id)?.preco_litro || 0)).toFixed(2)}</b>
              </p>
            )}
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAbastecimentoAberto(false)}>Cancelar</button>
              <button type="submit" disabled={enviandoAbastecimento}>{enviandoAbastecimento ? 'Gerando...' : 'Gerar QR de pagamento'}</button>
            </div>
          </form>
        </div>
      )}

      {pedidoGerado && (
        <div className="modal-fundo" onClick={() => setPedidoGerado(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Escaneie para pagar</h3>
            <p className="dica">{pedidoGerado.combustivelNome} — {Number(pedidoGerado.quantidade_litros).toFixed(2)} L</p>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
              <QRCodeSVG value={pedidoGerado.qr_code} size={200} />
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--cor-primaria)', margin: '4px 0' }}>
              R$ {Number(pedidoGerado.valor_total).toFixed(2)}
            </p>
            <p className="dica" style={{ color: 'var(--cor-alerta)' }}>
              QR de demonstração — o pagamento real via Pix ainda não está conectado. Seu pedido já foi registrado para a marina.
            </p>
            <button className="btn-primario" style={{ width: '100%' }} onClick={() => setPedidoGerado(null)}>Fechar</button>
          </div>
        </div>
      )}

      {modalAutorizadosAberto && (
        <div className="modal-fundo" onClick={() => setModalAutorizadosAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Pessoas autorizadas</h3>
            <p className="dica">Quem pode retirar ou devolver sua embarcação em seu nome (ex: filho, sócio, funcionário).</p>

            <div className="lista-cards" style={{ marginBottom: 12 }}>
              {autorizados.length === 0 && <p className="dica">Nenhuma pessoa autorizada cadastrada ainda.</p>}
              {autorizados.map((a) => (
                <div key={a.id} className="cliente-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div className="linha"><b>{a.nome}</b> — {a.parentesco}</div>
                    <div className="linha">{a.documento || 'sem documento'}{a.telefone ? ` · ${a.telefone}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="toggle">
                      <input type="checkbox" checked={a.ativo} onChange={() => alternarAutorizado(a)} />
                      <span className="trilho" />
                    </label>
                    <button type="button" className="voltar" onClick={() => excluirAutorizado(a.id)}><IconTrash size={16} /></button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={enviarNovoAutorizado} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input required placeholder="Nome completo" value={formAutorizado.nome}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, nome: e.target.value })} />
              <select value={formAutorizado.parentesco} onChange={(e) => setFormAutorizado({ ...formAutorizado, parentesco: e.target.value })}>
                {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input placeholder="CPF ou RG (opcional)" value={formAutorizado.documento}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, documento: e.target.value })} />
              <input placeholder="Telefone (opcional)" value={formAutorizado.telefone}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, telefone: e.target.value })} />
              <button type="submit" disabled={salvandoAutorizado}>{salvandoAutorizado ? 'Adicionando...' : '+ Adicionar autorizado'}</button>
            </form>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAutorizadosAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
