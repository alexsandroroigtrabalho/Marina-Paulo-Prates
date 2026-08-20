import { useEffect, useState } from 'react'
import {
  listarVagas, listarClientes, listarEmbarcacoes, criarReserva, listarReservas, encerrarReserva,
  listarAgendamentos, atualizarStatusAgendamento,
} from '../lib/db'

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

export default function TelaVagas({ marinaId }) {
  const [vagas, setVagas] = useState([])
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [reservas, setReservas] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [vagaSelecionada, setVagaSelecionada] = useState(null)
  const [form, setForm] = useState({ cliente_id: '', embarcacao_id: '', tipo: 'mensal', data_inicio: '', valor: '' })

  async function carregar() {
    if (!marinaId) return
    const [v, c, e, r, a] = await Promise.all([
      listarVagas(marinaId), listarClientes(marinaId), listarEmbarcacoes(marinaId), listarReservas(marinaId),
      listarAgendamentos(marinaId),
    ])
    setVagas(v); setClientes(c); setEmbarcacoes(e); setReservas(r); setAgendamentos(a)
  }

  useEffect(() => { carregar() }, [marinaId])

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

  return (
    <div>
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

      <h2>Solicitações de retirada / retorno</h2>
      <table className="tabela">
        <thead>
          <tr><th>Tipo</th><th>Cliente</th><th>Embarcação</th><th>Data/hora</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {agendamentos.length === 0 && (
            <tr><td colSpan={6}>Nenhuma solicitação de agendamento ainda.</td></tr>
          )}
          {agendamentos.map((a) => (
            <tr key={a.id}>
              <td>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</td>
              <td>{a.clientes?.nome}</td>
              <td>{a.embarcacoes?.nome || '-'}</td>
              <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
              <td>{a.status}</td>
              <td style={{ display: 'flex', gap: 6 }}>
                {a.status === 'solicitado' && (
                  <button onClick={() => mudarStatusAgendamento(a.id, 'confirmado')}>Confirmar</button>
                )}
                {a.status === 'confirmado' && (
                  <button onClick={() => mudarStatusAgendamento(a.id, 'concluido')}>Concluir</button>
                )}
                {a.status !== 'concluido' && a.status !== 'cancelado' && (
                  <button onClick={() => mudarStatusAgendamento(a.id, 'cancelado')}>Cancelar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
