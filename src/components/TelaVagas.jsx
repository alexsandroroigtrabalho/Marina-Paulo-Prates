import { useEffect, useRef, useState } from 'react'
import { IconSun, IconCloud, IconCloudRain, IconCloudSnow, IconCloudStorm, IconTemperature, IconWind } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import {
  listarAgendamentos, atualizarStatusAgendamento, atualizarStatusResgate, encerrarNavegacao,
  listarPedidosAbastecimento, atualizarStatusAbastecimento, listarCombustiveis, salvarCombustivel,
  listarDocumentos, buscarMarina, atualizarConfigMarina, enviarRelatorioDocumentosAgora,
} from '../lib/db'
import { ativarSons, destravarAudioNaProximaInteracao, tocarSinalDescida, tocarSinalRetorno, tocarApitoSos } from '../lib/sons'
import { buscarClimaAtual } from '../lib/clima'
import { STATUS_RESGATE, labelStatusResgate } from '../lib/statusResgate'
import { ultimaMovimentacaoPorEmbarcacao } from '../lib/agendamentos'
import ConfiguracoesPainel from './ConfiguracoesPainel'

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

// Clima muda bem mais devagar que a Fila de Rampa — 15 min é o bastante
// pra manter a temperatura/vento atuais sem gastar chamada à toa na API
// gratuita (Open-Meteo).
const INTERVALO_CLIMA_MS = 15 * 60 * 1000

const ICONE_CLIMA = { sol: IconSun, nuvem: IconCloud, chuva: IconCloudRain, neve: IconCloudSnow, tempestade: IconCloudStorm }

const TIPO_AGENDAMENTO_LABEL = {
  retirada: 'Descida',
  retorno: 'Subida',
}

// Uma notificação da Fila de Rampa continua "aguardando" (some da lista só
// quando concluída) em qualquer status que não seja 'concluido' — inclui o
// novo "Recebido" (status='confirmado', ver STATUS_FILA_OPCOES/campo Status
// abaixo), que fica no meio do caminho entre "Solicitado" e o status final
// (Navegando/Recolhido) sem sair da Fila de Rampa.
function statusLinha(a) {
  if (a.status === 'concluido') return a.tipo === 'retirada' ? 'navegando' : null
  return a.tipo === 'retirada' ? 'aguardando_descida' : 'aguardando_retorno'
}

// Campo Status da Fila de Rampa: um <select> só, com os 3 estados possíveis
// pra cada tipo de solicitação — o operador escolhe direto aqui, sem botão
// "Confirmar" separado. "Solicitado" reaproveita o status que já vem do
// pedido do cliente; "Recebido" usa o status 'confirmado' (já existia no
// banco, nunca usado até aqui); o status final reaproveita 'concluido' — na
// descida vira "Navegando" (a notificação sai da Fila de Rampa e passa a
// aparecer na tabela "Navegando" logo abaixo, como já acontecia); na subida
// vira "Recolhido" (a notificação simplesmente some da Fila de Rampa, mesmo
// comportamento de sempre quando um retorno é confirmado).
const STATUS_FILA_OPCOES = {
  retirada: [
    { valor: 'solicitado', label: 'Solicitado' },
    { valor: 'confirmado', label: 'Recebido' },
    { valor: 'concluido', label: 'Navegando' },
  ],
  retorno: [
    { valor: 'solicitado', label: 'Solicitado' },
    { valor: 'confirmado', label: 'Recebido' },
    { valor: 'concluido', label: 'Recolhido' },
  ],
}

// Cor do campo Status: tom terroso (mesmo de sempre) pra "Solicitado",
// amarelo (mesmo tom já usado em Manutenção "Em andamento") pra "Recebido",
// e o mesmo verde de ".status-navegando" (tabela Navegando) pro status
// final — ver .select-status-fila no index.css.
function classeStatusFila(status) {
  if (status === 'confirmado') return 'recebido'
  if (status === 'concluido') return 'navegando'
  return 'solicitado'
}

export default function TelaVagas({ marinaId, perfil, onAcoes }) {
  const ehAdmin = perfil?.role === 'admin'
  const [agendamentos, setAgendamentos] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [mostrarCancelados, setMostrarCancelados] = useState(false)
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false)
  const [formCombustivel, setFormCombustivel] = useState({ nome: '', preco_litro: '', estoque_litros: '' })
  const [agora, setAgora] = useState(new Date())
  const [clima, setClima] = useState(null)
  const [localizacaoClima, setLocalizacaoClima] = useState(null)
  // Aviso sonoro: vem ligado por padrão para todo mundo. É uma configuração
  // central da marina (marinas.config_json → avisoSonoroAtivado), não mais
  // um toggle local por sessão — só o administrador pode desligar/religar,
  // pelo Painel de Controle → Configurações, e a troca vale na hora para
  // todo mundo (ver carregarConfigMarina + assinatura Realtime abaixo).
  const [sonsAtivados, setSonsAtivados] = useState(true)
  const [salvandoAvisoSonoro, setSalvandoAvisoSonoro] = useState(false)
  const alarmeResgateRef = useRef(null)
  const [configApitos, setConfigApitos] = useState(APITOS_PADRAO)
  const [formApitos, setFormApitos] = useState(APITOS_PADRAO)
  const [salvandoApitos, setSalvandoApitos] = useState(false)

  // Configurações do sistema — todas centralizadas no Painel de Controle
  // (ver ConfiguracoesPainel.jsx). Mensalidade e o e-mail do relatório de
  // documentos vencidos moram no mesmo marinas.config_json que os apitos,
  // então entram na mesma leitura/gravação abaixo.
  const [formMensalidade, setFormMensalidade] = useState('')
  const [salvandoMensalidade, setSalvandoMensalidade] = useState(false)
  const [emailRelatorio, setEmailRelatorio] = useState('')
  const [salvandoEmailRelatorio, setSalvandoEmailRelatorio] = useState(false)
  const [ultimoEnvioRelatorio, setUltimoEnvioRelatorio] = useState(null)
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false)
  const [mensagemRelatorio, setMensagemRelatorio] = useState('')

  // Carrega a configuração da marina (apitos, valor da mensalidade, e-mail
  // do relatório de documentos) — tudo em marinas.config_json. Se ainda não
  // configurou nada, apitos ficam no padrão (1 longo na descida, 3 curtos no
  // retorno) e os demais campos ficam vazios.
  function carregarConfigMarina() {
    if (!marinaId) return
    buscarMarina(marinaId).then((m) => {
      const cfg = m?.config_json || {}
      const apitos = {
        descida: cfg.apitosDescida ?? APITOS_PADRAO.descida,
        retorno: cfg.apitosRetorno ?? APITOS_PADRAO.retorno,
      }
      setConfigApitos(apitos)
      setFormApitos(apitos)
      setSonsAtivados(cfg.avisoSonoroAtivado ?? true)
      setFormMensalidade(cfg.valorMensalidade != null ? String(cfg.valorMensalidade) : '')
      setEmailRelatorio(cfg.emailRelatorioDocumentos || '')
      setUltimoEnvioRelatorio(cfg.ultimoEnvioRelatorioDocumentos || null)
      // Localidade do clima (ver lib/clima.js) — configurada pelo
      // administrador em Configurações → Agenda; sem isso, buscarClimaAtual
      // já cai sozinha no padrão de Torres/RS.
      setLocalizacaoClima(
        cfg.climaLatitude != null && cfg.climaLongitude != null
          ? { latitude: cfg.climaLatitude, longitude: cfg.climaLongitude, local: cfg.climaLocal }
          : null
      )
    })
  }
  useEffect(() => { carregarConfigMarina() }, [marinaId])

  // Atualização em tempo real: uma configuração alterada por outro
  // administrador (em outra aba/sessão) aparece aqui na hora, sem F5 — mesmo
  // padrão já usado em clientes/agendamentos/etc.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`config-marina-${marinaId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'marina', table: 'marinas', filter: `id=eq.${marinaId}` }, () => carregarConfigMarina())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

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
    } catch (err) {
      alert('Não foi possível salvar os apitos: ' + err.message)
    } finally {
      setSalvandoApitos(false)
    }
  }

  async function salvarValorMensalidade(e) {
    e.preventDefault()
    setSalvandoMensalidade(true)
    try {
      await atualizarConfigMarina(marinaId, { valorMensalidade: Number(formMensalidade) })
    } catch (err) {
      alert('Não foi possível salvar a mensalidade: ' + err.message)
    } finally {
      setSalvandoMensalidade(false)
    }
  }

  async function salvarEmailRelatorio(e) {
    e.preventDefault()
    setSalvandoEmailRelatorio(true)
    setMensagemRelatorio('')
    try {
      await atualizarConfigMarina(marinaId, { emailRelatorioDocumentos: emailRelatorio })
      setMensagemRelatorio('E-mail salvo. O relatório diário passa a ser enviado para este endereço.')
    } catch (err) {
      setMensagemRelatorio(`Não foi possível salvar: ${err.message}`)
    } finally {
      setSalvandoEmailRelatorio(false)
    }
  }

  async function enviarRelatorioAgora() {
    setEnviandoRelatorio(true)
    setMensagemRelatorio('')
    try {
      const resultado = await enviarRelatorioDocumentosAgora(marinaId)
      setUltimoEnvioRelatorio(new Date().toISOString())
      setMensagemRelatorio(
        resultado?.documentos > 0
          ? `Relatório enviado com ${resultado.documentos} documento(s) vencido(s)/a vencer.`
          : 'Relatório enviado — nenhum documento vencido ou a vencer nos próximos 30 dias.'
      )
    } catch (err) {
      setMensagemRelatorio(`Não foi possível enviar: ${err.message}`)
    } finally {
      setEnviandoRelatorio(false)
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

  // Atualização em tempo real da Fila de Rampa/Navegando: além do polling de
  // 10s (pensado pra smart TV sem ninguém mexendo), qualquer mudança em
  // agendamentos — inclusive uma subida confirmada direto por outro
  // administrador logado em outra sessão — aparece aqui na hora, sem
  // esperar o próximo ciclo do polling. Mesmo padrão já usado nas demais
  // telas do sistema.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`vagas-${marinaId}-agendamentos`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  // Painel pensado para ficar aberto o dia todo numa smart TV — atualiza
  // sozinho os dados e o relógio, sem depender de alguém clicar em nada.
  useEffect(() => {
    const dados = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    const relogio = setInterval(() => setAgora(new Date()), 1000)
    return () => { clearInterval(dados); clearInterval(relogio) }
  }, [marinaId])

  // Temperatura/clima/vento da localidade configurada pela marina (padrão:
  // Torres/RS, até alguém configurar — ver lib/clima.js), atualizados
  // sozinhos junto com o resto do painel. Se a chamada falhar (sem internet
  // no momento, API fora do ar), simplesmente não mostra o widget — não
  // trava nem atrapalha o resto do Painel de Controle.
  useEffect(() => {
    function atualizarClima() {
      buscarClimaAtual(localizacaoClima).then(setClima).catch(() => setClima(null))
    }
    atualizarClima()
    const intervalo = setInterval(atualizarClima, INTERVALO_CLIMA_MS)
    return () => clearInterval(intervalo)
  }, [localizacaoClima?.latitude, localizacaoClima?.longitude])

  async function mudarStatusAgendamento(id, status) {
    try {
      await atualizarStatusAgendamento(id, status)
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar a notificação: ' + err.message)
    }
  }

  // O único status que o painel altera aqui é "entregue" — o pedido só
  // aparece no painel depois de já estar pago via Pix (ver abastecimentosAtivos).
  async function marcarAbastecimentoEntregue(id) {
    try {
      await atualizarStatusAbastecimento(id, 'entregue')
      await carregar()
    } catch (err) {
      alert('Não foi possível marcar o abastecimento como entregue: ' + err.message)
    }
  }

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

  // Embarcações "na água agora": a última movimentação concluída de cada
  // embarcação foi uma retirada (sem retorno concluído depois dela). Lógica
  // compartilhada com o painel do cliente — ver ultimaMovimentacaoPorEmbarcacao
  // em lib/agendamentos.js (desempata por created_at quando duas
  // movimentações têm o mesmo data_hora, senão uma retirada recém-confirmada
  // podia não aparecer aqui).
  //
  // Exceção: se a equipe já marcou o resgate dessa retirada como "Resgatado"
  // (fim do atendimento de S.O.S., ver definirStatusResgate), a embarcação sai
  // da tela "Navegando" na hora — o resgate encerrou a navegação mesmo sem
  // passar pelo fluxo normal de "Confirmar retorno" (o cliente resgatado
  // nem sempre chega a pedir a subida pelo app). Só afeta essa tabela do
  // Painel de Controle; o histórico de manobras e o painel do cliente
  // continuam mostrando/usando essa retirada normalmente.
  const naAgua = Object.values(ultimaMovimentacaoPorEmbarcacao(agendamentos))
    .filter((a) => a.tipo === 'retirada' && a.resgate_status !== 'resgatado')

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
      // Só toca o apito se o aviso sonoro estiver habilitado — desabilitado,
      // a notificação continua aparecendo na Fila de Rampa normalmente, só
      // sem o som.
      if (!idsConhecidosRef.current.has(a.id) && sonsAtivados) {
        if (a.tipo === 'retirada') tocarSinalDescida(configApitos.descida)
        else tocarSinalRetorno(configApitos.retorno)
      }
    })
    idsConhecidosRef.current = idsAtuais
  }, [idsLinhaFilaAtual, configApitos, sonsAtivados])

  // Alarme de "Solicitação de resgate": enquanto qualquer embarcação na água
  // estiver nesse status inicial, o painel toca o apito de SOS em loop (não
  // é um aviso único como descida/retorno) — para assim que o administrador
  // CONFIRMA o pedido (clique que avança pra "Pedido recebido", ver
  // avancarResgate) ou quando o aviso sonoro é desabilitado. Depois de
  // confirmado, o alerta continua visível (badge/seletor vermelho) até virar
  // "Resgatado", só sem o apito contínuo.
  const temResgateAtivo = naAgua.some((a) => a.resgate_status === 'solicitado')
  useEffect(() => {
    if (temResgateAtivo && sonsAtivados) {
      if (!alarmeResgateRef.current) {
        tocarApitoSos()
        alarmeResgateRef.current = setInterval(tocarApitoSos, 2500)
      }
    } else if (alarmeResgateRef.current) {
      clearInterval(alarmeResgateRef.current)
      alarmeResgateRef.current = null
    }
  }, [temResgateAtivo, sonsAtivados])

  // Garante que o intervalo do alarme de resgate seja limpo se a página for
  // fechada/trocada enquanto ele ainda estiver tocando.
  useEffect(() => () => {
    if (alarmeResgateRef.current) clearInterval(alarmeResgateRef.current)
  }, [])

  // Liga/desliga o aviso sonoro para TODO o sistema — só o administrador
  // pode chamar isso (botão já vem desabilitado para os demais perfis em
  // ConfiguracoesPainel.jsx, e a policy do banco recusaria a escrita mesmo
  // que alguém tentasse contornar a tela). Grava em marinas.config_json;
  // a assinatura Realtime já existente nessa tabela propaga a troca na hora
  // para o painel do administrador e para as demais sessões conectadas.
  async function alternarAvisoSonoro() {
    if (!ehAdmin || salvandoAvisoSonoro) return
    const novoValor = !sonsAtivados
    setSalvandoAvisoSonoro(true)
    try {
      await atualizarConfigMarina(marinaId, { avisoSonoroAtivado: novoValor })
      setSonsAtivados(novoValor)
      if (novoValor) ativarSons()
    } catch (err) {
      alert('Não foi possível salvar o aviso sonoro: ' + err.message)
    } finally {
      setSalvandoAvisoSonoro(false)
    }
  }

  // Cada navegador só libera áudio depois de alguma interação do próprio
  // usuário na página (política padrão dos navegadores). Como o aviso
  // sonoro agora vem ligado por padrão pra todo mundo — sem um botão manual
  // de "Ativar sons" —, este efeito destrava o áudio silenciosamente assim
  // que a pessoa clicar/tocar em qualquer coisa no painel, uma vez por sessão.
  useEffect(() => { destravarAudioNaProximaInteracao() }, [])

  // Repassa as ações do painel (aviso sonoro, histórico, combustíveis) pro
  // botão de engrenagem no cabeçalho (Layout), do lado do nome do usuário —
  // agora abre direto a tela única "Configurações do sistema" (antes era um
  // menu dropdown com os itens soltos; todos migraram pra lá, ver
  // ConfiguracoesPainel.jsx).
  useEffect(() => {
    onAcoes?.({ abrirConfiguracoes: () => setModalConfiguracoesAberto(true) })
  }, [])

  // Linha da Fila de Rampa (notificação aguardando descida ou retorno).
  function linhaNotificacao(a) {
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
          <select
            className={`badge select-status-fila status-${classeStatusFila(a.status)}`}
            value={a.status}
            title="Status da solicitação"
            onChange={(e) => mudarStatusAgendamento(a.id, e.target.value)}
          >
            {STATUS_FILA_OPCOES[a.tipo].map((o) => (
              <option key={o.valor} value={o.valor}>{o.label}</option>
            ))}
          </select>
        </td>
        <td>
          <div className="fila-tabela-acoes">
            <button className="cancelar" onClick={() => mudarStatusAgendamento(a.id, 'cancelado')}>Cancelar</button>
          </div>
        </td>
      </tr>
    )
  }

  // Status da embarcação navegando: um alerta de resgate ativo (ver
  // lib/statusResgate.js) tem prioridade sobre o resto; sem isso, o relógio
  // decide sozinho — Navegando (verde) até completar 2h de atraso sobre a
  // previsão de retorno, daí vira Excedeu retorno (vermelho).
  function statusNavegando(a) {
    if (a.resgate_status) return { classe: `resgate-${a.resgate_status}`, texto: labelStatusResgate(a.resgate_status) }
    if (a.previsao_retorno) {
      const previsto = new Date(a.previsao_retorno).getTime()
      if (agora.getTime() >= previsto + 2 * 60 * 60 * 1000) return { classe: 'excedeu_retorno', texto: 'Excedeu retorno' }
    }
    return { classe: 'navegando', texto: 'Navegando' }
  }

  // Clique no badge do resgate — comportamento depende do estado atual:
  //  - Sem alerta (Navegando/Excedeu retorno): marca "Solicitação de
  //    resgate" manualmente (a equipe percebeu que a embarcação precisa de
  //    ajuda, sem esperar o cliente acionar o S.O.S. pelo app).
  //  - "Solicitação de resgate": confirma o recebimento do pedido — avança
  //    automaticamente pra "Pedido recebido" (continua vermelho) e para o
  //    apito contínuo de SOS.
  // A opção "Resgatado" (fechar o atendimento) fica no seletor que aparece
  // assim que o pedido já foi recebido — ver definirStatusResgate abaixo.
  async function avancarResgate(id, statusAtual) {
    try {
      await atualizarStatusResgate(id, statusAtual ? 'recebido' : 'solicitado')
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar o status do resgate: ' + err.message)
    }
  }

  async function definirStatusResgate(id, status) {
    try {
      await atualizarStatusResgate(id, status)
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar o status do resgate: ' + err.message)
    }
  }

  // Encerrar a navegação direto pela tabela "Navegando" (campo Status —
  // "Recolhido"/"Resgatado"/"Cancelar", ver linhaNavegando abaixo), sem
  // esperar o cliente enviar uma Subida pelo app. Confirma antes de agir —
  // ao contrário do resto da Fila de Rampa, aqui não tem "desfazer" fácil
  // (cria um retorno novo, ou cancela a descida original).
  const LABEL_ENCERRAR = { recolhido: 'Recolhido', resgatado: 'Resgatado', cancelado: 'Cancelado' }
  async function encerrarNavegacaoAcao(a, motivo) {
    const nome = a.clientes?.nome || 'esse cliente'
    if (!confirm(`Marcar "${LABEL_ENCERRAR[motivo]}" para ${nome}${a.embarcacoes?.nome ? ` (${a.embarcacoes.nome})` : ''}?`)) return
    try {
      await encerrarNavegacao(a, motivo)
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar: ' + err.message)
    }
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
          {a.resgate_status && a.resgate_status !== 'solicitado' ? (
            // Pedido já recebido (ou resgatado): vira um seletor editável,
            // igual ao padrão de status de Manutenção — salva na hora, sem
            // precisar de um botão "Salvar" separado.
            <select
              value={a.resgate_status}
              onChange={(e) => definirStatusResgate(a.id, e.target.value)}
              title="Status do resgate"
            >
              {/* "Solicitação de resgate" fica de fora do seletor de propósito —
                  esse estado só é alcançado pelo clique inicial no badge (ou
                  pelo próprio cliente via S.O.S.); selecioná-lo aqui reativaria
                  o apito contínuo de SOS por engano numa manobra que a equipe
                  já confirmou ter recebido. */}
              {STATUS_RESGATE.filter((s) => s.valor !== 'solicitado').map((s) => (
                <option key={s.valor} value={s.valor}>{s.label}</option>
              ))}
            </select>
          ) : a.resgate_status === 'solicitado' ? (
            // Alerta ativo, ainda não confirmado pela equipe — continua um
            // botão de clique único (sem seletor no meio), pra confirmar o
            // recebimento o mais rápido possível e parar o apito contínuo.
            <button
              type="button"
              className={`badge status-${status.classe}`}
              title="Clique para confirmar o recebimento do pedido"
              onClick={() => avancarResgate(a.id, a.resgate_status)}
            >
              {status.texto}
            </button>
          ) : (
            // Navegação normal (sem alerta de resgate em andamento): o
            // campo Status vira um seletor só, com a opção de marcar
            // manualmente uma Solicitação de resgate (mesma ação de antes,
            // agora aqui dentro) e as 3 formas de encerrar a navegação —
            // Recolhido (retorno normal, sem o cliente precisar pedir a
            // Subida pelo app), Resgatado (fecha com o mesmo rótulo/
            // histórico do fluxo de S.O.S.) e Cancelar (anula a descida).
            <select
              className={`badge select-status-fila status-${status.classe}`}
              value=""
              title="Selecionar ação"
              onChange={(e) => {
                const valor = e.target.value
                e.target.value = ''
                if (!valor) return
                if (valor === 'sos') avancarResgate(a.id, a.resgate_status)
                else encerrarNavegacaoAcao(a, valor)
              }}
            >
              <option value="">{status.texto}</option>
              <option value="sos">Solicitação de resgate</option>
              <option value="recolhido">Recolhido</option>
              <option value="resgatado">Resgatado</option>
              <option value="cancelado">Cancelar</option>
            </select>
          )}
        </td>
      </tr>
    )
  }

  const IconeClima = clima ? (ICONE_CLIMA[clima.icone] || IconCloud) : null

  return (
    <div>
      {/* A logo RV Invictus própria desta tela saiu daqui — agora mora no
          cabeçalho institucional único do Layout.jsx (junto do nome da
          marina, Admin, engrenagem e Sair), pra não duplicar a marca em
          duas faixas separadas no topo da página. */}
      <div className="painel-controle-cabecalho">
        <p className="painel-controle-relogio">
          {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} · {agora.toLocaleTimeString('pt-BR')}
        </p>
        {clima && (
          <div className="painel-clima">
            <span className="painel-clima-local">{clima.local}</span>
            <span className="painel-clima-item">
              <IconTemperature size={16} /> {clima.temperatura}°C
            </span>
            <span className="painel-clima-item">
              <IconeClima size={16} /> {clima.descricao}
            </span>
            <span className="painel-clima-item">
              <IconWind size={16} /> {clima.velocidadeVento} km/h
            </span>
          </div>
        )}
      </div>

      <h2 style={{ margin: '0 0 16px' }}>Fila de Rampa</h2>

      <table className="tabela tabela-fila">
        <thead>
          <tr>
            <th>Pedido</th>
            <th className="col-responsavel">Responsável</th>
            <th>Horário</th>
            <th>Documentação</th>
            <th>Abastecimento</th>
            <th>Status</th>
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

      {/* Crédito discreto de marca, fechando o Painel de Controle — mesmo
          gesto minimalista já usado no rodapé da sidebar e do login. */}
      <a className="painel-controle-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">
        RVinvictus.com.br
      </a>

      <ConfiguracoesPainel
        aberto={modalConfiguracoesAberto}
        onFechar={() => setModalConfiguracoesAberto(false)}
        ehAdmin={ehAdmin}
        marinaId={marinaId}
        historicoManobras={historicoManobras}
        tipoAgendamentoLabel={TIPO_AGENDAMENTO_LABEL}
        formMensalidade={formMensalidade}
        onMudarMensalidade={setFormMensalidade}
        onSalvarMensalidade={salvarValorMensalidade}
        salvandoMensalidade={salvandoMensalidade}
        combustiveis={combustiveis}
        formCombustivel={formCombustivel}
        onMudarFormCombustivel={setFormCombustivel}
        onSalvarNovoCombustivel={salvarNovoCombustivel}
        onAtualizarCampoCombustivel={atualizarCampoCombustivel}
        sonsAtivados={sonsAtivados}
        onAlternarSons={alternarAvisoSonoro}
        salvandoAvisoSonoro={salvandoAvisoSonoro}
        formApitos={formApitos}
        onMudarApitos={setFormApitos}
        onSalvarApitos={salvarConfigApitos}
        salvandoApitos={salvandoApitos}
        emailRelatorio={emailRelatorio}
        onMudarEmailRelatorio={setEmailRelatorio}
        onSalvarEmailRelatorio={salvarEmailRelatorio}
        salvandoEmailRelatorio={salvandoEmailRelatorio}
        ultimoEnvioRelatorio={ultimoEnvioRelatorio}
        onEnviarRelatorioAgora={enviarRelatorioAgora}
        enviandoRelatorio={enviandoRelatorio}
        mensagemRelatorio={mensagemRelatorio}
      />
    </div>
  )
}
