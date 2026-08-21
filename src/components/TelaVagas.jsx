import { useEffect, useState } from 'react'
import {
  listarAgendamentos, atualizarStatusAgendamento, listarDespachos, listarLaudos,
  listarPedidosAbastecimento, atualizarStatusAbastecimento, listarCombustiveis, salvarCombustivel,
} from '../lib/db'

// A cada quantos segundos o painel se atualiza sozinho — pensado para rodar
// numa smart TV na marina, sem alguém precisando ficar dando refresh.
const INTERVALO_ATUALIZACAO_MS = 45000

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

const STATUS_ABASTECIMENTO_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

// Próximo status sugerido para o pedido de abastecimento, num clique só —
// evita ficar abrindo tela separada só pra avançar o status.
const PROXIMO_STATUS_ABASTECIMENTO = {
  solicitado: 'confirmado',
  confirmado: 'aguardando_pagamento',
  aguardando_pagamento: 'pago',
  pago: 'entregue',
}

export default function TelaVagas({ marinaId }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [mostrarCancelados, setMostrarCancelados] = useState(false)
  const [modalCombustiveisAberto, setModalCombustiveisAberto] = useState(false)
  const [formCombustivel, setFormCombustivel] = useState({ nome: '', preco_litro: '', estoque_litros: '' })
  const [agora, setAgora] = useState(new Date())

  async function carregar() {
    if (!marinaId) return
    const [a, d, l, p, c] = await Promise.all([
      listarAgendamentos(marinaId), listarDespachos(marinaId), listarLaudos(marinaId),
      listarPedidosAbastecimento(marinaId), listarCombustiveis(marinaId),
    ])
    setAgendamentos(a); setDespachos(d); setLaudos(l); setPedidosAbastecimento(p); setCombustiveis(c)
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

  async function mudarStatusAbastecimento(id, status) {
    await atualizarStatusAbastecimento(id, status)
    carregar()
  }

  async function salvarNovoCombustivel(e) {
    e.preventDefault()
    await salvarCombustivel({ marina_id: marinaId, ...formCombustivel })
    setFormCombustivel({ nome: '', preco_litro: '', estoque_litros: '' })
    carregar()
  }

  async function atualizarCampoCombustivel(combustivel, campo, valor) {
    await salvarCombustivel({ id: combustivel.id, marina_id: marinaId, nome: combustivel.nome, ativo: combustivel.ativo, [campo]: valor })
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
  // Pedidos sem vínculo com nenhuma descida/subida atualmente visível na Fila
  // de Rampa (pedido antigo, ou feito antes de existir o agendamento) — ainda
  // precisam aparecer em algum lugar pra não passar batido.
  const idsAgendamentosVisiveis = new Set(agendamentos.map((a) => a.id))
  const abastecimentosSemVinculo = abastecimentosAtivos.filter((p) => !p.agendamento_id || !idsAgendamentosVisiveis.has(p.agendamento_id))

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Fila de Rampa</h2>
          <p className="dica" style={{ marginTop: 0, marginBottom: 16 }}>
            Acompanhe cada retirada e retorno em tempo real, do pedido do cliente até a conclusão — com o abastecimento
            pedido para aquela descida ou subida direto no card.
          </p>
        </div>
        <button type="button" className="voltar" onClick={() => setModalCombustiveisAberto(true)} style={{ marginBottom: 16 }}>
          Gerenciar combustíveis
        </button>
      </div>

      <div className="fila-rampa">
        {COLUNAS_FILA.map((coluna) => {
          const itens = agendamentos.filter((a) => a.status === coluna.status)
          return (
            <div key={coluna.status} className="fila-coluna">
              <h4>{coluna.titulo} <span className="contagem">{itens.length}</span></h4>
              {itens.length === 0 && <p className="fila-vazia">Nada por aqui.</p>}
              {itens.map((a) => {
                const abastecimentosDoCard = pedidosAbastecimento.filter((p) => p.agendamento_id === a.id)
                return (
                  <div key={a.id} className={`fila-card ${a.tipo === 'retorno' ? 'tipo-retorno' : ''}`}>
                    <div className="fila-card-topo">
                      <span>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</span>
                    </div>
                    <div className="fila-card-meta"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` — ${a.embarcacoes.nome}` : ''}</div>
                    <div className="fila-card-meta">{a.autorizados ? `${a.autorizados.nome} (${a.autorizados.parentesco})` : 'O próprio cliente'} vai buscar/entregar</div>
                    <div className="fila-card-meta">{new Date(a.data_hora).toLocaleString('pt-BR')}</div>
                    {abastecimentosDoCard.length > 0 && (
                      <div className="fila-card-abastecimento">
                        {abastecimentosDoCard.map((p) => (
                          <div key={p.id} className="fila-card-abastecimento-item">
                            <span>⛽ {p.combustiveis?.nome} — {Number(p.quantidade_litros).toFixed(0)} L</span>
                            <span className={`badge status-${p.status}`}>{STATUS_ABASTECIMENTO_LABEL[p.status] || p.status}</span>
                            {PROXIMO_STATUS_ABASTECIMENTO[p.status] && (
                              <button type="button" onClick={() => mudarStatusAbastecimento(p.id, PROXIMO_STATUS_ABASTECIMENTO[p.status])}>
                                Marcar {STATUS_ABASTECIMENTO_LABEL[PROXIMO_STATUS_ABASTECIMENTO[p.status]].toLowerCase()}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
                )
              })}
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

        {abastecimentosSemVinculo.length > 0 && (
          <div>
            <h3>Abastecimento sem descida/subida em aberto</h3>
            <p className="dica" style={{ marginTop: 0 }}>Pedido feito sem uma retirada/retorno correspondente na Fila de Rampa no momento.</p>
            <div className="lista-cards">
              {abastecimentosSemVinculo.map((p) => (
                <div key={p.id} className="cliente-card">
                  <div className="linha"><b>{p.combustiveis?.nome}</b> — {Number(p.quantidade_litros).toFixed(2)} L</div>
                  <div className="linha">{p.clientes?.nome}{p.embarcacoes?.nome ? ` — ${p.embarcacoes.nome}` : ''}</div>
                  <span className={`badge status-${p.status}`}>{STATUS_ABASTECIMENTO_LABEL[p.status] || p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modalCombustiveisAberto && (
        <div className="modal-fundo" onClick={() => setModalCombustiveisAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', maxWidth: 640 }}>
            <h3>Gerenciar combustíveis</h3>
            <p className="dica">Preço e estoque usados no pedido de abastecimento feito pelo cliente pelo app.</p>

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

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalCombustiveisAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
