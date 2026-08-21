import { useEffect, useState } from 'react'
import {
  listarVagas, listarClientes, listarEmbarcacoes, criarReserva, listarReservas, encerrarReserva,
  listarAgendamentos, atualizarStatusAgendamento, listarDespachos, listarLaudos, listarPedidosAbastecimento,
} from '../lib/db'

// A cada quantos segundos o painel se atualiza sozinho — pensado para rodar
// numa smart TV na marina, sem alguém precisando ficar dando refresh.
const INTERVALO_ATUALIZACAO_MS = 45000

const STATUS_COR = {
  disponivel: '#12B5C9',
  ocupada: '#0A2756',
  reservada: '#E0A400',
  manutencao: '#B00020',
}

const TIPO_AGENDAMENTO_LABEL = {
  retirada: 'Retirada para água',
  retorno: 'Atracação de retorno',
}

// Colunas da Fila de Rampa — painel visual do fluxo de retirada/retorno.
// "em_andamento" cobre preparo, deslocamento e manobra, sem depender de
// jargão específico de rampa/água — cada marina opera do seu jeito.
const COLUNAS_FILA = [
  { status: 'solicitado', titulo: 'Solicitado' },
  { status: 'confirmado', titulo: 'Confirmado' },
  { status: 'em_andamento', titulo: 'Em andamento' },
  { status: 'concluido', titulo: 'Concluído' },
]

export default function TelaVagas({ marinaId }) {
  const [vagas, setVagas] = useState([])
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [reservas, setReservas] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [vagaSelecionada, setVagaSelecionada] = useState(null)
  const [form, setForm] = useState({ cliente_id: '', embarcacao_id: '', tipo: 'mensal', data_inicio: '', valor: '' })
  const [mostrarCancelados, setMostrarCancelados] = useState(false)
  const [agora, setAgora] = useState(new Date())

  async function carregar() {
    if (!marinaId) return
    const [v, c, e, r, a, d, l, p] = await Promise.all([
      listarVagas(marinaId), listarClientes(marinaId), listarEmbarcacoes(marinaId), listarReservas(marinaId),
      listarAgendamentos(marinaId), listarDespachos(marinaId), listarLaudos(marinaId), listarPedidosAbastecimento(marinaId),
    ])
    setVagas(v); setClientes(c); setEmbarcacoes(e); setReservas(r); setAgendamentos(a)
    setDespachos(d); setLaudos(l); setPedidosAbastecimento(p)
  }

  useEffect(() => { carregar() }, [marinaId])

  // Painel pensado para ficar aberto o dia todo numa smart TV — atualiza
  // sozinho os dados e o relógio, sem depender de alguém clicar em nada.
  useEffect(() => {
    const dados = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    const relogio = setInterval(() => setAgora(new Date()), 1000)
    return () => { clearInterval(dados); clearInterval(relogio) }
  }, [marinaId])

  async function mudarStatusAgendamento(id, status) {
    await atualizarStatusAgendamento(id, status)
    carregar()
  }

  async function reservarVaga(e) {
    e.preventDefault()
    await criarReserva({ marina_id: marinaId, vaga_id: vagaSelecionada.id, ...form })
    setVagaSelecionada(null)
    setForm({ cliente_id: '', embarcacao_id: '', tipo: 'mensal', data_inicio: '', valor: '' })
    carregar()
  }

  // Embarcações "na água agora": a última movimentação concluída de cada
  // embarcação foi uma retirada (sem retorno concluído depois dela).
  const ultimaPorEmbarcacao = {}
  agendamentos.filter((a) => a.status === 'concluido' && a.embarcacao_id).forEach((a) => {
    const atual = ultimaPorEmbarcacao[a.embarcacao_id]
    if (!atual || new Date(a.data_hora) > new Date(atual.data_hora)) ultimaPorEmbarcacao[a.embarcacao_id] = a
  })
  const naAgua = Object.values(ultimaPorEmbarcacao).filter((a) => a.tipo === 'retirada')

  const pedidosServico = [
    ...despachos.filter((d) => !['concluido', 'indeferido', 'cancelado'].includes(d.status)).map((d) => ({ ...d, origem: 'Despacho' })),
    ...laudos.filter((l) => !['emitido', 'cancelado'].includes(l.status)).map((l) => ({ ...l, origem: 'Laudo' })),
  ]

  const abastecimentosAtivos = pedidosAbastecimento.filter((p) => !['entregue', 'cancelado'].includes(p.status))

  return (
    <div>
      <p className="painel-controle-relogio">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} · {agora.toLocaleTimeString('pt-BR')}
      </p>

      <div className="resumo-financeiro">
        <div className="stat-card"><span>Embarcações na água</span><strong>{naAgua.length}</strong></div>
        <div className="stat-card"><span>Pedidos de serviço em aberto</span><strong>{pedidosServico.length}</strong></div>
        <div className="stat-card"><span>Abastecimentos pendentes</span><strong>{abastecimentosAtivos.length}</strong></div>
      </div>

      <h2>Fila de Rampa</h2>
      <p className="dica" style={{ marginTop: -8, marginBottom: 16 }}>
        Acompanhe cada retirada e retorno em tempo real, do pedido do cliente até a conclusão.
      </p>
      <div className="fila-rampa">
        {COLUNAS_FILA.map((coluna) => {
          const itens = agendamentos.filter((a) => a.status === coluna.status)
          return (
            <div key={coluna.status} className="fila-coluna">
              <h4>{coluna.titulo} <span className="contagem">{itens.length}</span></h4>
              {itens.length === 0 && <p className="fila-vazia">Nada por aqui.</p>}
              {itens.map((a) => (
                <div key={a.id} className={`fila-card ${a.tipo === 'retorno' ? 'tipo-retorno' : ''}`}>
                  <div className="fila-card-topo">
                    <span>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</span>
                  </div>
                  <div className="fila-card-meta"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` — ${a.embarcacoes.nome}` : ''}</div>
                  <div className="fila-card-meta">{a.autorizados ? `${a.autorizados.nome} (${a.autorizados.parentesco})` : 'O próprio cliente'} vai buscar/entregar</div>
                  <div className="fila-card-meta">{new Date(a.data_hora).toLocaleString('pt-BR')}</div>
                  <div className="fila-card-acoes">
                    {a.status === 'solicitado' && (
                      <button onClick={() => mudarStatusAgendamento(a.id, 'confirmado')}>Confirmar</button>
                    )}
                    {a.status === 'confirmado' && (
                      <button onClick={() => mudarStatusAgendamento(a.id, 'em_andamento')}>Iniciar atendimento</button>
                    )}
                    {a.status === 'em_andamento' && (
                      <button onClick={() => mudarStatusAgendamento(a.id, 'concluido')}>Concluir</button>
                    )}
                    {a.status !== 'concluido' && a.status !== 'cancelado' && (
                      <button className="cancelar" onClick={() => mudarStatusAgendamento(a.id, 'cancelado')}>Cancelar</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {agendamentos.some((a) => a.status === 'cancelado') && (
        <div style={{ marginBottom: 32 }}>
          <button type="button" className="voltar" onClick={() => setMostrarCancelados(!mostrarCancelados)}>
            {mostrarCancelados ? 'Ocultar' : 'Ver'} cancelados ({agendamentos.filter((a) => a.status === 'cancelado').length})
          </button>
          {mostrarCancelados && (
            <div className="lista-cards" style={{ marginTop: 10 }}>
              {agendamentos.filter((a) => a.status === 'cancelado').map((a) => (
                <div key={a.id} className="cliente-card">
                  <div className="linha"><b>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</b> — {a.clientes?.nome}{a.embarcacoes?.nome ? ` — ${a.embarcacoes.nome}` : ''}</div>
                  <div className="linha">{new Date(a.data_hora).toLocaleString('pt-BR')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="painel-controle-grid">
        <div>
          <h3>Embarcações na água</h3>
          <div className="lista-cards">
            {naAgua.length === 0 && <p className="dica" style={{ marginTop: 0 }}>Nenhuma embarcação na água no momento.</p>}
            {naAgua.map((a) => (
              <div key={a.id} className="cliente-card">
                <div className="linha"><b>{a.embarcacoes?.nome}</b></div>
                <div className="linha">{a.clientes?.nome}</div>
                <div className="linha">Saiu às {new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Pedidos de serviço</h3>
          <div className="lista-cards">
            {pedidosServico.length === 0 && <p className="dica" style={{ marginTop: 0 }}>Nenhum pedido de serviço em aberto.</p>}
            {pedidosServico.map((p) => (
              <div key={`${p.origem}-${p.id}`} className="cliente-card">
                <div className="linha"><b>{p.origem} — {(p.tipo || '').replace('_', ' ')}</b></div>
                <div className="linha">{p.clientes?.nome}{p.embarcacoes?.nome ? ` — ${p.embarcacoes.nome}` : ''}</div>
                <span className={`badge status-${p.status}`}>{(p.status || '').replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Abastecimento</h3>
          <div className="lista-cards">
            {abastecimentosAtivos.length === 0 && <p className="dica" style={{ marginTop: 0 }}>Nenhum pedido de abastecimento pendente.</p>}
            {abastecimentosAtivos.map((p) => (
              <div key={p.id} className="cliente-card">
                <div className="linha"><b>{p.combustiveis?.nome}</b> — {Number(p.quantidade_litros).toFixed(2)} L</div>
                <div className="linha">{p.clientes?.nome}{p.embarcacoes?.nome ? ` — ${p.embarcacoes.nome}` : ''}</div>
                <span className={`badge status-${p.status}`}>{(p.status || '').replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2>Gestão de vagas</h2>
      <div className="grid-vagas">
        {vagas.map((v) => (
          <button
            key={v.id}
            className="vaga-card"
            style={{ borderColor: STATUS_COR[v.status] || '#ccc' }}
            onClick={() => v.status === 'disponivel' && setVagaSelecionada(v)}
          >
            <strong>{v.codigo}</strong>
            <span>{v.setor}</span>
            <span className={`badge status-${v.status}`}>{v.status}</span>
          </button>
        ))}
        {vagas.length === 0 && <p>Nenhuma vaga cadastrada ainda. Cadastre vagas na tabela `vagas` no Supabase.</p>}
      </div>

      {vagaSelecionada && (
        <div className="modal-fundo" onClick={() => setVagaSelecionada(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={reservarVaga}>
            <h3>Reservar vaga {vagaSelecionada.codigo}</h3>
            <select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
              <option value="">Selecione o cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={form.embarcacao_id} onChange={(e) => setForm({ ...form, embarcacao_id: e.target.value })}>
              <option value="">Selecione a embarcação (opcional)</option>
              {embarcacoes.filter((e) => e.cliente_id === form.cliente_id).map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="avulsa">Avulsa</option>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
            <input type="date" required value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
            <input type="number" step="0.01" placeholder="Valor (R$)" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <div className="acoes-modal">
              <button type="button" onClick={() => setVagaSelecionada(null)}>Cancelar</button>
              <button type="submit">Confirmar reserva</button>
            </div>
          </form>
        </div>
      )}

      <h2>Reservas ativas</h2>
      <table className="tabela">
        <thead>
          <tr><th>Vaga</th><th>Cliente</th><th>Embarcação</th><th>Início</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {reservas.map((r) => (
            <tr key={r.id}>
              <td>{r.vagas?.codigo}</td>
              <td>{r.clientes?.nome}</td>
              <td>{r.embarcacoes?.nome || '-'}</td>
              <td>{r.data_inicio}</td>
              <td>{r.status}</td>
              <td>
                {r.status !== 'encerrada' && (
                  <button onClick={() => encerrarReserva(r.id, r.vaga_id).then(carregar)}>Encerrar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
