import { useEffect, useState } from 'react'
import { listarOrdensServico, criarOrdemServico, atualizarStatusOS, listarEmbarcacoes, listarClientes } from '../lib/db'
import { STATUS_MANUTENCAO, labelStatusManutencao } from '../lib/statusManutencao'

const TIPOS = ['limpeza', 'manutencao_motor', 'jet_ski', 'guincho', 'combustivel', 'pintura', 'outro']

export default function TelaManutencao({ marinaId }) {
  const [ordens, setOrdens] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [clientes, setClientes] = useState([])
  const [form, setForm] = useState({ embarcacao_id: '', cliente_id: '', tipo_servico: 'limpeza', descricao: '', prioridade: 'normal' })

  async function carregar() {
    if (!marinaId) return
    const [o, e, c] = await Promise.all([listarOrdensServico(marinaId), listarEmbarcacoes(marinaId), listarClientes(marinaId)])
    setOrdens(o); setEmbarcacoes(e); setClientes(c)
  }

  useEffect(() => { carregar() }, [marinaId])

  async function nova(e) {
    e.preventDefault()
    await criarOrdemServico({ marina_id: marinaId, ...form })
    setForm({ embarcacao_id: '', cliente_id: '', tipo_servico: 'limpeza', descricao: '', prioridade: 'normal' })
    carregar()
  }

  return (
    <div>
      <form className="form-inline" onSubmit={nova}>
        <select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
          <option value="">Cliente</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select required value={form.embarcacao_id} onChange={(e) => setForm({ ...form, embarcacao_id: e.target.value })}>
          <option value="">Embarcação</option>
          {embarcacoes.filter((e) => e.cliente_id === form.cliente_id).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <select value={form.tipo_servico} onChange={(e) => setForm({ ...form, tipo_servico: e.target.value })}>
          {TIPOS.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
          <option value="baixa">Baixa</option>
          <option value="normal">Normal</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
        <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
        <button type="submit">+ Abrir ordem de serviço</button>
      </form>

      <table className="tabela">
        <thead><tr><th>Embarcação</th><th>Cliente</th><th>Tipo</th><th>Prioridade</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {ordens.map((o) => (
            <tr key={o.id}>
              <td>{o.embarcacoes?.nome}</td>
              <td>{o.clientes?.nome}</td>
              <td>{o.tipo_servico?.replace('_', ' ')}</td>
              <td>{o.prioridade}</td>
              <td><span className={`badge status-manut-${o.status}`}>{labelStatusManutencao(o.status)}</span></td>
              <td>
                {/* Sempre editável — inclusive depois de "Concluído", caso o
                    administrador precise reabrir ou corrigir o status. A
                    troca já salva na hora (onChange chama atualizarStatusOS
                    direto, sem precisar de um botão "Salvar" separado). */}
                <select value={o.status} onChange={(e) => atualizarStatusOS(o.id, e.target.value).then(carregar)}>
                  {STATUS_MANUTENCAO.map((s) => (
                    <option key={s.valor} value={s.valor}>{s.label}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
