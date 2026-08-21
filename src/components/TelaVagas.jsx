import { useEffect, useRef, useState } from 'react'
import {
  listarAgendamentos, atualizarStatusAgendamento, atualizarResgateAgendamento, listarDespachos, listarLaudos,
  listarPedidosAbastecimento, atualizarStatusAbastecimento, listarCombustiveis, salvarCombustivel,
  listarDocumentos,
} from '../lib/db'
import { ativarSons, tocarSinalDescida, tocarSinalRetorno } from '../lib/sons'

// A cada quantos segundos o painel se atualiza sozinho — pensado para rodar
// numa smart TV na marina, sem alguém precisando ficar dando refresh.
const INTERVALO_ATUALIZACAO_MS = 45000

const TIPO_AGENDAMENTO_LABEL = {
  retirada: 'Descida',
  retorno: 'Subida',
}

// Cada notificação da Fila de Rampa só existe em 3 estados — sem etapas
// intermediárias de "confirmado"/"em andamento": o operador dá um clique só
// quando a embarcação de fato desce ou sobe, e o status muda na hora.
function statusLinha(a) {
  if (a.status === 'concluido') return a.tipo === 'retirada' ? 'navegando' : null
  return a.tipo === 'retirada' ? 'aguardando_descida' : 'aguardando_retorno'
}

export default function TelaVagas({ marinaId, onResumo }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [mostrarCancelados, setMostrarCancelados] = useState(false)
  const [modalCombustiveisAberto, setModalCombustiveisAberto] = useState(false)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [formCombustivel, setFormCombustivel] = useState({ nome: '', preco_litro: '', estoque_litros: '' })
  const [agora, setAgora] = useState(new Date())
  const [sonsAtivados, setSonsAtivados] = useState(false)

  async function carregar() {
    if (!marinaId) return
    const [a, d, l, p, c, doc] = await Promise.all([
      listarAgendamentos(marinaId), listarDespachos(marinaId), listarLaudos(marinaId),
      listarPedidosAbastecimento(marinaId), listarCombustiveis(marinaId), listarDocumentos(marinaId),
    ])
    setAgendamentos(a); setDespachos(d); setLaudos(l); setPedidosAbastecimento(p); setCombustiveis(c); setDocumentos(doc)
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

  // O único status que o painel altera aqui é "entregue" — o pedido só
  // aparece no painel depois de já estar pago via Pix (ver abastecimentosAtivos).
  async function marcarAbastecimentoEntregue(id) {
    await atualizarStatusAbastecimento(id, 'entregue')
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

  // Linhas ativas da Fila de Rampa: só o que ainda está aguardando descida ou
  // retorno. Assim que vira "Navegando" a notificação sai daqui sozinha e
  // passa a aparecer na tabela "Navegando" logo abaixo.
  const linhasFila = agendamentos
    .filter((a) => a.status !== 'cancelado' && statusLinha(a) === (a.tipo === 'retirada' ? 'aguardando_descida' : 'aguardando_retorno'))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))

  // Só aparece no painel o pedido já pago via Pix — não existe aqui opção de
  // marcar "aguardando pagamento" ou "pago", isso é automático quando o
  // pagamento real for confirmado. A única ação do operador é dar baixa
  // (marcar entregue) depois de abastecer.
  const abastecimentosAtivos = pedidosAbastecimento.filter((p) => p.status === 'pago')
  // Pedidos sem vínculo com nenhuma descida/subida atualmente visível na Fila
  // de Rampa (pedido antigo, pedido feito antes de existir o agendamento, ou
  // cujo agendamento já foi concluído/cancelado) — ainda precisam aparecer em
  // algum lugar pra não passar batido.
  const idsAgendamentosNaFila = new Set(linhasFila.map((a) => a.id))
  const abastecimentosSemVinculo = abastecimentosAtivos.filter((p) => !p.agendamento_id || !idsAgendamentosNaFila.has(p.agendamento_id))

  // Histórico de manobras: toda descida ou subida já confirmada, mais recente
  // primeiro — vira o registro permanente assim que o operador confirma a
  // notificação na Fila de Rampa (não some quando a embarcação volta, como
  // acontece com a tabela Navegando).
  const historicoManobras = agendamentos
    .filter((a) => a.status === 'concluido')
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))

  // Documentação da embarcação: Regular (nada vencido) ou Pendente (algo
  // vencido, ou nenhum documento cadastrado ainda) — resumo de 1 palavra pra
  // caber numa linha só na Fila de Rampa.
  function statusDocumentacao(embarcacaoId) {
    const docs = documentos.filter((d) => d.embarcacao_id === embarcacaoId)
    if (docs.length === 0) return 'pendente'
    const temVencido = docs.some((d) => d.data_validade && new Date(d.data_validade) < agora)
    return temVencido ? 'pendente' : 'regular'
  }

  // Repassa os contadores pro cabeçalho (Layout), que os mostra ao lado do
  // nome da marina — economiza a linha inteira que os cards ocupavam aqui.
  useEffect(() => {
    onResumo?.({ naAgua: naAgua.length, servicos: pedidosServico.length, abastecimentos: abastecimentosAtivos.length })
  }, [naAgua.length, pedidosServico.length, abastecimentosAtivos.length])

  // Sinal sonoro: toca sozinho assim que uma notificação NOVA entra na Fila
  // de Rampa — apito longo pra descida, três apitos curtos pra retorno. Na
  // primeira carga do painel não toca nada (senão dispararia pra tudo que já
  // estava esperando quando a TV foi ligada) — só a partir da atualização
  // seguinte, comparando com o que já tinha sido visto.
  const idsConhecidosRef = useRef(null)
  const idsLinhaFilaAtual = linhasFila.map((a) => a.id).sort().join(',')
  useEffect(() => {
    const idsAtuais = new Set(linhasFila.map((a) => a.id))
    if (idsConhecidosRef.current === null) {
      idsConhecidosRef.current = idsAtuais
      return
    }
    linhasFila.forEach((a) => {
      if (!idsConhecidosRef.current.has(a.id)) {
        if (a.tipo === 'retirada') tocarSinalDescida()
        else tocarSinalRetorno()
      }
    })
    idsConhecidosRef.current = idsAtuais
  }, [idsLinhaFilaAtual])

  function ativarSonsPainel() {
    ativarSons()
    setSonsAtivados(true)
  }

  // Linha da Fila de Rampa (notificação aguardando descida ou retorno).
  function linhaNotificacao(a) {
    const status = statusLinha(a)
    const doc = statusDocumentacao(a.embarcacao_id)
    const abastecimentosDaLinha = abastecimentosAtivos.filter((p) => p.agendamento_id === a.id)
    return (
      <tr key={a.id}>
        <td><span className={`luz ${a.tipo === 'retirada' ? 'luz-verde' : 'luz-vermelha'}`} title={a.tipo === 'retirada' ? 'Descida' : 'Subida'} /></td>
        <td>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</td>
        <td><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
        <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
        <td><span className={`badge status-${doc}`}>{doc === 'regular' ? 'Regular' : 'Pendente'}</span></td>
        <td>
          {abastecimentosDaLinha.length === 0 && '—'}
          {abastecimentosDaLinha.map((p) => (
            <div key={p.id} className="fila-abastecimento-linha">
              <span>⛽ {p.combustiveis?.nome} — {Number(p.quantidade_litros).toFixed(0)} L</span>
              <span className="badge status-pago">Pago</span>
              <button type="button" onClick={() => marcarAbastecimentoEntregue(p.id)}>Marcar entregue</button>
            </div>
          ))}
        </td>
        <td>
          <div className="fila-tabela-acoes">
            {status === 'aguardando_descida' && (
              <button onClick={() => mudarStatusAgendamento(a.id, 'concluido')}>Confirmar saída</button>
            )}
            {status === 'aguardando_retorno' && (
              <button onClick={() => mudarStatusAgendamento(a.id, 'concluido')}>Confirmar retorno</button>
            )}
            <button className="cancelar" onClick={() => mudarStatusAgendamento(a.id, 'cancelado')}>Cancelar</button>
          </div>
        </td>
      </tr>
    )
  }

  // Status da embarcação navegando: 3 estados. "Solicita resgate" é um alerta
  // manual (fica assim até alguém desmarcar) e tem prioridade sobre o resto;
  // sem isso, o relógio decide sozinho — Navegando (verde) até completar 2h
  // de atraso sobre a previsão de retorno, daí vira Excedeu retorno (vermelho).
  function statusNavegando(a) {
    if (a.resgate_solicitado) return { classe: 'resgate', texto: 'Solicita resgate' }
    if (a.previsao_retorno) {
      const previsto = new Date(a.previsao_retorno).getTime()
      if (agora.getTime() >= previsto + 2 * 60 * 60 * 1000) return { classe: 'excedeu_retorno', texto: 'Excedeu retorno' }
    }
    return { classe: 'navegando', texto: 'Navegando' }
  }

  async function alternarResgate(id, valorAtual) {
    await atualizarResgateAgendamento(id, !valorAtual)
    carregar()
  }

  // Linha de "Navegando" — só o essencial: quem está com a embarcação, desde
  // quando, e a previsão de retorno (com o status mudando sozinho se
  // atrasar). Sem a natureza do pedido, sem o indicativo luminoso e sem
  // informação de abastecimento — isso já fica na Fila de Rampa, antes de sair
  // pra água.
  function linhaNavegando(a) {
    const status = statusNavegando(a)
    return (
      <tr key={a.id}>
        <td><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
        <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
        <td>{a.previsao_retorno ? new Date(a.previsao_retorno).toLocaleString('pt-BR') : 'Sem previsão informada'}</td>
        <td>
          <button
            type="button"
            className={`badge status-${status.classe}`}
            title={a.resgate_solicitado ? 'Clique para cancelar o alerta' : 'Clique para marcar Solicita resgate'}
            onClick={() => alternarResgate(a.id, a.resgate_solicitado)}
          >
            {status.texto}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div>
      <p className="painel-controle-relogio">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} · {agora.toLocaleTimeString('pt-BR')}
      </p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Fila de Rampa</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="voltar" onClick={ativarSonsPainel} title="O navegador só libera o som depois de um clique — ative uma vez ao abrir o painel">
            {sonsAtivados ? '🔔 Sons ativados' : '🔔 Ativar sons'}
          </button>
          <button type="button" className="voltar" onClick={() => setModalHistoricoAberto(true)}>
            Histórico de manobras
          </button>
          <button type="button" className="voltar" onClick={() => setModalCombustiveisAberto(true)}>
            Gerenciar combustíveis
          </button>
        </div>
      </div>

      <table className="tabela tabela-fila">
        <thead>
          <tr>
            <th></th>
            <th>Pedido</th>
            <th>Responsável</th>
            <th>Horário</th>
            <th>Documentação</th>
            <th>Abastecimento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhasFila.length === 0 && <tr><td colSpan={7}>Nenhuma notificação de descida ou subida no momento.</td></tr>}
          {linhasFila.map((a) => linhaNotificacao(a))}
        </tbody>
      </table>

      <h2>Navegando</h2>
      <table className="tabela tabela-fila" style={{ marginBottom: 32 }}>
        <thead>
          <tr>
            <th>Responsável</th>
            <th>Horário de saída</th>
            <th>Previsão de retorno</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {naAgua.length === 0 && <tr><td colSpan={4}>Nenhuma embarcação na água no momento.</td></tr>}
          {naAgua.map((a) => linhaNavegando(a))}
        </tbody>
      </table>

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

      {abastecimentosSemVinculo.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3>Abastecimento sem descida/subida em aberto</h3>
          <p className="dica" style={{ marginTop: 0 }}>Pedido feito sem uma retirada/retorno correspondente na Fila de Rampa no momento.</p>
          <div className="lista-cards">
            {abastecimentosSemVinculo.map((p) => (
              <div key={p.id} className="cliente-card">
                <div className="linha"><b>{p.combustiveis?.nome}</b> — {Number(p.quantidade_litros).toFixed(2)} L</div>
                <div className="linha">{p.clientes?.nome}{p.embarcacoes?.nome ? ` — ${p.embarcacoes.nome}` : ''}</div>
                <span className="badge status-pago">Pago</span>
                <button type="button" onClick={() => marcarAbastecimentoEntregue(p.id)}>Marcar entregue</button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {modalHistoricoAberto && (
        <div className="modal-fundo" onClick={() => setModalHistoricoAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', maxWidth: 720 }}>
            <h3>Histórico de manobras</h3>
            <p className="dica">Toda descida e subida já confirmada na Fila de Rampa, mais recente primeiro.</p>

            <table className="tabela tabela-fila">
              <thead>
                <tr>
                  <th></th>
                  <th>Pedido</th>
                  <th>Responsável</th>
                  <th>Horário</th>
                </tr>
              </thead>
              <tbody>
                {historicoManobras.length === 0 && <tr><td colSpan={4}>Nenhuma manobra confirmada ainda.</td></tr>}
                {historicoManobras.map((a) => (
                  <tr key={a.id}>
                    <td><span className={`luz ${a.tipo === 'retirada' ? 'luz-verde' : 'luz-vermelha'}`} title={a.tipo === 'retirada' ? 'Descida' : 'Subida'} /></td>
                    <td>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</td>
                    <td><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
                    <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalHistoricoAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
