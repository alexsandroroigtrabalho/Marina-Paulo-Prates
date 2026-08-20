import { useEffect, useState } from 'react'
import { listarCobrancas, criarCobranca, marcarCobrancaPaga, listarClientes } from '../lib/db'

export default function TelaFinanceiro({ marinaId }) {
  const [cobrancas, setCobrancas] = useState([])
  const [clientes, setClientes] = useState([])
  const [form, setForm] = useState({ cliente_id: '', descricao: '', tipo: 'mensalidade', valor: '', vencimento: '' })

  async function carregar() {
    if (!marinaId) return
    const [c, cl] = await Promise.all([listarCobrancas(marinaId), listarClientes(marinaId)])
    setCobrancas(c); setClientes(cl)
  }

  useEffect(() => { carregar() }, [marinaId])

  async function nova(e) {
    e.preventDefault()
    await criarCobranca({ marina_id: marinaId, ...form })
    setForm({ cliente_id: '', descricao: '', tipo: 'mensalidade', valor: '', vencimento: '' })
    carregar()
  }

  const totalPendente = cobrancas.filter((c) => c.status !== 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const totalRecebido = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)

  return (
    <div>
      <div className="resumo-financeiro">
        <div className="stat-card"><span>Pendente</span><strong>R$ {totalPendente.toFixed(2)}</strong></div>
        <div className="stat-card"><span>Recebido</span><strong>R$ {totalRecebido.toFixed(2)}</strong></div>
      </div>

      <form className="form-inline" onSubmit={nova}>
        <select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
          <option value="">Cliente</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input placeholder="Descrição" required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="mensalidade">Mensalidade</option>
          <option value="servico">Serviço</option>
          <option value="multa">Multa</option>
          <option value="outro">Outro</option>
        </select>
        <input type="number" step="0.01" placeholder="Valor" required value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
        <input type="date" required value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
        <button type="submit">+ Nova cobrança</button>
      </form>

      <table className="tabela">
        <thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {cobrancas.map((c) => (
            <tr key={c.id}>
              <td>{c.clientes?.nome}</td>
              <td>{c.descricao}</td>
              <td>R$ {Number(c.valor).toFixed(2)}</td>
              <td>{c.vencimento}</td>
              <td><span className={`badge status-${c.status}`}>{c.status}</span></td>
              <td>{c.status !== 'pago' && <button onClick={() => marcarCobrancaPaga(c.id).then(carregar)}>Marcar como pago</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dica">Para cobrar via PIX/cartão/boleto automaticamente, use a Edge Function <code>payment</code> (Mercado Pago) — veja <code>supabase/functions/payment</code>.</p>
    </div>
  )
}
