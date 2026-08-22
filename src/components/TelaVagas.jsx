import { useEffect, useRef, useState } from 'react'
import {
  listarAgendamentos, atualizarStatusAgendamento, atualizarResgateAgendamento,
  listarPedidosAbastecimento, atualizarStatusAbastecimento, listarCombustiveis, salvarCombustivel,
  listarDocumentos, buscarMarina, atualizarConfigMarina,
} from '../lib/db'
import { ativarSons, tocarSinalDescida, tocarSinalRetorno } from '../lib/sons'

// Apitos: quantidade padrão de sinais sonoros pra cada tipo de manobra,
// usada até a marina configurar a própria (Painel de Controle → engrenagem
// → "Configurar apitos", guardado em marinas.config_json).
const APITOS_PADRAO = { descida: 1, retorno: 3 }

// A cada quantos segundos o painel se atualiza sozinho — pensado para rodar
// numa smart TV na marina, sem alguém precisando ficar dando refresh. Quanto
// menor, mais rápido uma notificação nova aparece (e o apito toca), à custa
// de mais requisições ao banco — 10s é um bom equilíbrio pro volume de uma
// marina (bem tranquilo pro Supabase aguentar).
const INTERVALO_ATUALIZACAO_MS = 10000

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

export default function TelaVagas({ marinaId, onAcoes }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [mostrarCancelados, setMostrarCancelados] = useState(false)
  const [modalCombustiveisAberto, setModalCombustiveisAberto] = useState(false)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [formCombustivel, setFormCombustivel] = useState({ nome: '', preco_litro: '', estoque_litros: '' })
  const [agora, setAgora] = useState(new Date())
  const [sonsAtivados, setSonsAtivados] = useState(false)
  const [configApitos, setConfigApitos] = useState(APITOS_PADRAO)
  const [modalApitosAberto, setModalApitosAberto] = useState(false)
  const [formApitos, setFormApitos] = useState(APITOS_PADRAO)
  const [salvandoApitos, setSalvandoApitos] = useState(false)

  // Carrega a quantidade de apitos configurada pela marina (se ainda não
  // configurou nada, fica no padrão: 1 apito longo na descida, 3 curtos no
  // retorno — igual já era antes de existir essa configuração).
  useEffect(() => {
    if (!marinaId) return
    buscarMarina(marinaId).then((m) => {
      const cfg = m?.config_json || {}
      setConfigApitos({
        descida: cfg.apitosDescida ?? APITOS_PADRAO.descida,
        retorno: cfg.apitosRetorno ?? APITOS_PADRAO.retorno,
      })
    })
  }, [marinaId])

  function abrirConfigApitos() {
    setFormApitos(configApitos)
    setModalApitosAberto(true)
  }

  async function salvarConfigApitos(e) {
    e.preventDefault()
    setSalvandoApitos(true)
    try {
      const novoConfig = {
        descida: Math.max(1, Number(formApitos.descida) || 1),
        retorno: Math.max(1, Number(formApitos.retorno) || 1),
      }
      await atualizarConfigMarina(marinaId, { apitosDescida: novoConfig.descida, apitosRetorno: novoConfig.retorno })
      setConfigApitos(novoConfig)
      setModalApitosAberto(false)
    } finally {
      setSalvandoApitos(false)
    }
  }

  // Conta quantas vezes carregar() já terminou de verdade — usado pra
  // distinguir "página acabou de abrir, dados ainda nem chegaram" (0) de
  // "primeira leva de dados reais acabou de chegar" (1) de "isso é uma
  // atualização de verdade, pode ter notificação nova" (2+). Sem isso, o som
  // tocava sozinho ao abrir a página pra tudo que já estava esperando.
  const cargasCompletadasRef = useRef(0)

  async function carregar() {
    if (!marinaId) return
    const [a, p, c, doc] = await Promise.all([
      listarAgendamentos(marinaId),
      listarPedidosAbastecimento(marinaId), listarCombustiveis(marinaId), listarDocumentos(marinaId),
    ])
    setAgendamentos(a); setPedidosAbastecimento(p); setCombustiveis(c); setDocumentos(doc)
    cargasCompletadasRef.current += 1
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

  // Sinal sonoro: toca sozinho assim que uma notificação NOVA entra na Fila
  // de Rampa — apito longo pra descida, três apitos curtos pra retorno. Não
  // toca nada nem no instante em que a página abre (dados ainda vazios) nem
  // na primeira leva de dados reais que chega logo em seguida (senão
  // dispararia pra tudo que já estava esperando quando a TV foi ligada) — só
  // a partir da atualização seguinte, comparando com o que já tinha sido visto.
  const idsConhecidosRef = useRef(null)
  const idsLinhaFilaAtual = linhasFila.map((a) => a.id).sort().join(',')
  useEffect(() => {
    const idsAtuais = new Set(linhasFila.map((a) => a.id))
    if (idsConhecidosRef.current === null || cargasCompletadasRef.current <= 1) {
      idsConhecidosRef.current = idsAtuais
      return
    }
    linhasFila.forEach((a) => {
      if (!idsConhecidosRef.current.has(a.id)) {
        if (a.tipo === 'retirada') tocarSinalDescida(configApitos.descida)
        else tocarSinalRetorno(configApitos.retorno)
      }
    })
    idsConhecidosRef.current = idsAtuais
  }, [idsLinhaFilaAtual, configApitos])

  function ativarSonsPainel() {
    ativarSons()
    setSonsAtivados(true)
  }

  // Repassa as ações do painel (ativar sons, histórico, combustíveis) pro
  // menu de engrenagem no cabeçalho (Layout), do lado do nome do usuário —
  // esses botões não moram mais fixos em cima da Fila de Rampa.
  useEffect(() => {
    onAcoes?.({
      sonsAtivados,
      ativarSons: ativarSonsPainel,
      abrirHistorico: () => setModalHistoricoAberto(true),
      abrirCombustiveis: () => setModalCombustiveisAberto(true),
      abrirConfigApitos,
    })
  }, [sonsAtivados, configApitos])

  // Linha da Fila de Rampa (notificação aguardando descida ou retorno).
  function linhaNotificacao(a) {
    const status = statusLinha(a)
    const doc = statusDocumentacao(a.embarcacao_id)
    const abastecimentosDaLinha = abastecimentosAtivos.filter((p) => p.agendamento_id === a.id)
    return (
      <tr key={a.id}>
        <td className={`pedido ${a.tipo === 'retirada' ? 'tipo-descida' : 'tipo-subida'}`}>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</td>
        <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
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
        <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
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
      <img
        src="/rv-invictus-logo.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="pagina-cliente-logo"
      />

      <p className="painel-controle-relogio">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} · {agora.toLocaleTimeString('pt-BR')}
      </p>

      <h2 style={{ margin: '0 0 16px' }}>Fila de Rampa</h2>

      <table className="tabela tabela-fila">
        <thead>
          <tr>
            <th>Pedido</th>
            <th className="col-responsavel">Responsável</th>
            <th>Horário</th>
            <th>Documentação</th>
            <th>Abastecimento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {linhasFila.length === 0 && <tr><td colSpan={6}>Nenhuma notificação de descida ou subida no momento.</td></tr>}
          {linhasFila.map((a) => linhaNotificacao(a))}
        </tbody>
      </table>

      <h2>Navegando</h2>
      <table className="tabela tabela-fila" style={{ marginBottom: 32 }}>
        <thead>
          <tr>
            <th className="col-responsavel">Responsável</th>
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
                  <th>Pedido</th>
                  <th className="col-responsavel">Responsável</th>
                  <th>Horário</th>
                </tr>
              </thead>
              <tbody>
                {historicoManobras.length === 0 && <tr><td colSpan={3}>Nenhuma manobra confirmada ainda.</td></tr>}
                {historicoManobras.map((a) => (
                  <tr key={a.id}>
                    <td className={`pedido ${a.tipo === 'retirada' ? 'tipo-descida' : 'tipo-subida'}`}>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</td>
                    <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
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

      {modalApitosAberto && (
        <div className="modal-fundo" onClick={() => setModalApitosAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3>Configurar apitos</h3>
            <p className="dica">Quantas vezes o sinal sonoro toca ao confirmar cada manobra na Fila de Rampa. Vale para toda a equipe.</p>

            <form className="form-vertical" onSubmit={salvarConfigApitos}>
              <label>
                Apitos na saída (descida)
                <input required type="number" min={1} step={1} value={formApitos.descida}
                  onChange={(e) => setFormApitos({ ...formApitos, descida: e.target.value })} />
              </label>
              <label>
                Apitos na chegada (retorno)
                <input required type="number" min={1} step={1} value={formApitos.retorno}
                  onChange={(e) => setFormApitos({ ...formApitos, retorno: e.target.value })} />
              </label>

              <div className="acoes-modal">
                <button type="button" onClick={() => setModalApitosAberto(false)}>Cancelar</button>
                <button type="submit" disabled={salvandoApitos}>{salvandoApitos ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
