import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listarCombustiveis, salvarCombustivel,
  listarPedidosAbastecimento, atualizarStatusAbastecimento,
} from '../lib/db'
import { STATUS_ABASTECIMENTO_OPCOES, STATUS_ABASTECIMENTO_LABEL as STATUS_LABEL, abastecimentoConcluido, ehCompletarTanque } from '../lib/statusAbastecimento'

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
        const pedidosVisiveis = pedidos.filter((p) => !abastecimentoConcluido(p.status))
        return (
          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Embarcação</th><th>Data/Horário</th><th>Combustível</th><th>Qtd (L)</th><th>Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pedidosVisiveis.length === 0 && <tr><td colSpan={8}>Nenhum pedido de abastecimento no momento.</td></tr>}
              {pedidosVisiveis.map((p) => (
                <tr key={p.id}>
                  <td>{p.clientes?.nome}</td>
                  <td>{p.embarcacoes?.nome || '-'}</td>
                  <td>{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                  {/* "Completar tanque" (ver lib/statusAbastecimento.js): o
                      cliente não informou litros, então não tem quantidade/
                      valor fechado ainda — mostra "—"/"A combinar" em vez de
                      "0.00"/"R$ 0.00" (placeholders só pras colunas NOT NULL
                      do banco, ver enviarAbastecimento em
                      TelaClienteDashboard.jsx), com o combustível marcado
                      pra ficar claro que é esse tipo de pedido. */}
                  <td>{p.combustiveis?.nome}{ehCompletarTanque(p) ? ' · Completar tanque' : ''}</td>
                  <td>{ehCompletarTanque(p) ? '—' : Number(p.quantidade_litros).toFixed(2)}</td>
                  <td>{ehCompletarTanque(p) ? 'A combinar' : `R$ ${Number(p.valor_total).toFixed(2)}`}</td>
                  <td><span className={`badge status-${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
                  <td>
                    {/* Só estas 4 opções — "Pagamento efetuado" conclui e some
                        da lista (ver pedidosVisiveis acima); "Cancelar" e
                        "Indisponível" avisam o cliente pelo Diário de Bordo dele
                        (ver statusAbastecimentoDiario em TelaClienteDashboard.jsx).
                        Este é o único lugar do sistema onde o status muda —
                        a seção "Combustível" do Painel de Controle (ver
                        TelaVagas.jsx) só exibe o mesmo valor, sem controle
                        nenhum de alteração ali. Fonte única do rótulo/opções
                        em lib/statusAbastecimento.js, pra nunca ficarem
                        dessincronizadas. */}
                    {p.status !== 'cancelado' && (
                      <select value={p.status} onChange={(e) => atualizarStatusAbastecimento(p.id, e.target.value).then(carregar).catch((err) => alert('Não foi possível atualizar o pedido: ' + err.message))}>
                        {/* Pedido recém-chegado ainda em 'solicitado' (ou algum
                            valor legado, ex.: 'confirmado') — mostra a situação
                            atual certa até o operador escolher uma das 4 ações
                            reais abaixo; não reaparece depois que ele agir. */}
                        {!STATUS_ABASTECIMENTO_OPCOES.some((o) => o.valor === p.status) && (
                          <option value={p.status} disabled>{STATUS_LABEL[p.status] || p.status}</option>
                        )}
                        {STATUS_ABASTECIMENTO_OPCOES.map((o) => (
                          <option key={o.valor} value={o.valor}>{o.label}</option>
                        ))}
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
