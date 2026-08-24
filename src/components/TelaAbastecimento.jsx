import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listarCombustiveis, salvarCombustivel,
  listarPedidosAbastecimento, atualizarStatusAbastecimento,
} from '../lib/db'

// Fluxo simplificado: o operador só escolhe entre 4 status (ver <select>
// abaixo) — "Solicitado"/"Confirmado"/"Entregue" são valores legados (pedidos
// antigos, de antes desta mudança) que continuam com rótulo aqui só pra não
// mostrar o código cru se algum pedido velho ainda estiver com um desses.
const STATUS_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  indisponivel: 'Indisponível',
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

  // Atualização em tempo real: um pedido cancelado pelo cliente direto no
  // Diário de Bordo dele (ver cancelarAbastecimentoCliente em
  // TelaClienteDashboard.jsx) aparece aqui na hora, sem precisar trocar de
  // aba/recarregar a página — mesmo padrão já usado em TelaFinanceiro.jsx
  // pra essa mesma tabela.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`abastecimento-${marinaId}-pedidos`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'pedidos_abastecimento', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

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

      {/* Assim que um pedido é marcado "Pagamento efetuado", ele some desta
          lista — a solicitação já foi concluída, não precisa mais de ação da
          equipe (continua contando normalmente pra Arrecadação detalhada, só
          não aparece mais aqui). "Entregue" é um valor legado (pedidos de
          antes desta mudança) e some do mesmo jeito, pelo mesmo motivo. */}
      {aba === 'pedidos' && (() => {
        const pedidosVisiveis = pedidos.filter((p) => p.status !== 'pago' && p.status !== 'entregue')
        return (
          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Embarcação</th><th>Combustível</th><th>Qtd (L)</th><th>Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pedidosVisiveis.length === 0 && <tr><td colSpan={7}>Nenhum pedido de abastecimento no momento.</td></tr>}
              {pedidosVisiveis.map((p) => (
                <tr key={p.id}>
                  <td>{p.clientes?.nome}</td>
                  <td>{p.embarcacoes?.nome || '-'}</td>
                  <td>{p.combustiveis?.nome}</td>
                  <td>{Number(p.quantidade_litros).toFixed(2)}</td>
                  <td>R$ {Number(p.valor_total).toFixed(2)}</td>
                  <td><span className={`badge status-${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
                  <td>
                    {/* Só estas 4 opções — "Pagamento efetuado" conclui e some
                        da lista (ver pedidosVisiveis acima); "Cancelar" e
                        "Indisponível" avisam o cliente pelo Diário de Bordo dele
                        (ver statusAbastecimentoDiario em TelaClienteDashboard.jsx). */}
                    {p.status !== 'cancelado' && (
                      <select value={p.status} onChange={(e) => atualizarStatusAbastecimento(p.id, e.target.value).then(carregar).catch((err) => alert('Não foi possível atualizar o pedido: ' + err.message))}>
                        <option value="aguardando_pagamento">Aguardando pagamento</option>
                        <option value="pago">Pagamento efetuado</option>
                        <option value="cancelado">Cancelar</option>
                        <option value="indisponivel">Indisponível</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      })()}
    </div>
  )
}
