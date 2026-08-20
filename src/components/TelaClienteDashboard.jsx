import { useEffect, useState } from 'react'
import { IconAnchor, IconLogout, IconShip, IconAnchorOff } from '@tabler/icons-react'
import { supabase, db } from '../lib/supabase'
import { listarAgendamentosCliente, solicitarAgendamento } from '../lib/db'

const TIPO_LABEL = {
  retirada: 'Retirada para água',
  retorno: 'Atracação de retorno',
}

const STATUS_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export default function TelaClienteDashboard({ perfil }) {
  const [cliente, setCliente] = useState(null)
  const [reservas, setReservas] = useState([])
  const [cobrancas, setCobrancas] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [modalTipo, setModalTipo] = useState(null) // 'retirada' | 'retorno' | null
  const [formAgendamento, setFormAgendamento] = useState({ embarcacao_id: '', data_hora: '', observacoes: '' })
  const [enviandoAgendamento, setEnviandoAgendamento] = useState(false)

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
  }

  useEffect(() => { carregar() }, [perfil])

  function abrirModal(tipo) {
    setFormAgendamento({ embarcacao_id: embarcacoes[0]?.id || '', data_hora: '', observacoes: '' })
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
      })
      setModalTipo(null)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoAgendamento(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cor-primaria)' }}>
          <IconAnchor /> <strong>Minha marina</strong>
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
    </div>
  )
}
