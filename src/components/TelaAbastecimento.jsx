import { useEffect, useState } from 'react'
import {
  listarCombustiveis, salvarCombustivel,
  listarPedidosAbastecimento, atualizarStatusAbastecimento,
} from '../lib/db'

const STATUS_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export default function TelaAbastecimento({ marinaId }) {
  const [aba, setAba] = useState('pedidos') // pedidos | combustiveis
  const [combustiveis, setCombustiveis] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [formCombustivel, setFormCombustivel] = useState({ nome: '', preco_litro: '', estoque_litros: '' })

  async function carregar() {
    if (!marinaId) return
    const [c, p] = await Promise.all([listarCombustiveis(marinaId), listarPedidosAbastecimento(marinaId)])
    setCombustiveis(c); setPedidos(p)
  }

  useEffect(() => { carregar() }, [marinaId])

  async function salvarNovoCombustivel(e) {
    e.preventDefault()
    try {
      await salvarCombustivel({ marina_id: marinaId, ...formCombustivel })
      setFormCombustivel({ nome: '', preco_litro: '', estoque_litros: '' })
      await carregar()
    } catch (err) {
      alert('Não foi possível adicionar o combustível: ' + err.message)
    }
  }

  async function atualizarCampoCombustivel(combustivel, campo, valor) {
    try {
      await salvarCombustivel({ id: combustivel.id, marina_id: marinaId, nome: combustivel.nome, ativo: combustivel.ativo, [campo]: valor })
      await carregar()
    } catch (err) {
      alert('Não foi possível salvar essa alteração: ' + err.message)
    }
  }

  return (
    <div>
      <div className="abas">
        <button className={aba === 'pedidos' ? 'ativo' : ''} onClick={() => setAba('pedidos')}>Pedidos de abastecimento</button>
        <button className={aba === 'combustiveis' ? 'ativo' : ''} onClick={() => setAba('combustiveis')}>Combustíveis (estoque e preço)</button>
      </div>

      {aba === 'combustiveis' && (
        <>
          <form className="form-inline" onSubmit={salvarNovoCombustivel}>
            <input required placeholder="Nome (ex: Gasolina, Diesel Marítimo)" value={formCombustivel.nome}
              onChange={(e) => setFormCombustivel({ ...formCombustivel, nome: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Preço por litro (R$)" value={formCombustivel.preco_litro}
              onChange={(e) => setFormCombustivel({ ...formCombustivel, preco_litro: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Estoque (litros)" value={formCombustivel.estoque_litros}
              onChange={(e) => setFormCombustivel({ ...formCombustivel, estoque_litros: e.target.value })} />
            <button type="submit">+ Adicionar combustível</button>
          </form>

          <table className="tabela">
            <thead><tr><th>Combustível</th><th>Preço/litro</th><th>Estoque (L)</th><th>Ativo</th></tr></thead>
            <tbody>
              {combustiveis.length === 0 && <tr><td colSpan={4}>Nenhum combustível cadastrado ainda.</td></tr>}
              {combustiveis.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>
                    <input type="number" step="0.01" defaultValue={c.preco_litro} style={{ width: 90 }}
                      onBlur={(e) => Number(e.target.value) !== Number(c.preco_litro) && atualizarCampoCombustivel(c, 'preco_litro', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.01" defaultValue={c.estoque_litros} style={{ width: 90 }}
                      onBlur={(e) => Number(e.target.value) !== Number(c.estoque_litros) && atualizarCampoCombustivel(c, 'estoque_litros', e.target.value)} />
                  </td>
                  <td>
                    <label className="toggle">
                      <input type="checkbox" checked={c.ativo} onChange={(e) => atualizarCampoCombustivel(c, 'ativo', e.target.checked)} />
                      <span className="trilho" />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {aba === 'pedidos' && (
        <table className="tabela">
          <thead><tr><th>Cliente</th><th>Embarcação</th><th>Combustível</th><th>Qtd (L)</th><th>Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {pedidos.length === 0 && <tr><td colSpan={7}>Nenhum pedido de abastecimento ainda.</td></tr>}
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td>{p.clientes?.nome}</td>
                <td>{p.embarcacoes?.nome || '-'}</td>
                <td>{p.combustiveis?.nome}</td>
                <td>{Number(p.quantidade_litros).toFixed(2)}</td>
                <td>R$ {Number(p.valor_total).toFixed(2)}</td>
                <td><span className={`badge status-${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
                <td>
                  {p.status !== 'entregue' && p.status !== 'cancelado' && (
                    <select value={p.status} onChange={(e) => atualizarStatusAbastecimento(p.id, e.target.value).then(carregar).catch((err) => alert('Não foi possível atualizar o pedido: ' + err.message))}>
                      <option value="solicitado">Solicitado</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="aguardando_pagamento">Aguardando pagamento</option>
                      <option value="pago">Pago</option>
                      <option value="entregue">Entregue</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
