import { useEffect, useState } from 'react'
import { IconSun, IconCloud, IconCloudRain, IconCloudSnow, IconCloudStorm, IconTemperature, IconWind, IconTrash } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import {
  listarAgendamentos, atualizarStatusAgendamento, atualizarStatusResgate, encerrarNavegacao,
  listarDocumentos, buscarMarina, atualizarConfigMarina, enviarRelatorioDocumentosAgora,
  listarPedidosAbastecimento, confirmarAbastecimento, cancelarAbastecimento,
} from '../lib/db'
import { ativarSons } from '../lib/sons'
import { buscarClimaAtual } from '../lib/clima'
import { STATUS_RESGATE, labelStatusResgate, estouBemAtivo } from '../lib/statusResgate'
import { ultimaMovimentacaoPorEmbarcacao } from '../lib/agendamentos'
import {
  statusEfetivoAbastecimento, aguardandoDecisao,
  labelStatusAbastecimento, classeStatusAbastecimento, momentoConfirmacaoAbastecimento,
  textoQuantidade,
} from '../lib/statusAbastecimento'
import {
  aguardandoDecisaoAgendamento, statusFinalAgendamento, statusAutoConfirmadoAgendamento, labelConfirmarAgendamento,
} from '../lib/statusAgendamento'
import { linhasFilaAtivas } from '../lib/filaRampa'
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

// Fila de Rampa, Navegando e Solicitações de combustível ficam na mesma
// tela (a "TV" do Painel de Controle, uma embaixo da outra) — por pedido,
// as colunas das três precisam bater entre si. Nenhuma das três tem o
// mesmo conteúdo em todas as colunas, então o esquema é por POSIÇÃO: 7
// larguras fixas (ver .painel-controle .tabela-fila no index.css, que liga
// table-layout: fixed pra elas valerem), e cada tabela preenche com uma
// célula vazia a posição que não tem conteúdo — em vez de tipo de
// pedido (só a Fila de Rampa tem) ou de Ações (a Navegando não tem, a
// própria seleção de status já age).
//
// Em pixels, não em porcentagem — de propósito. Porcentagem some com
// table-layout: fixed + width: 100%: o navegador reparte esses 100% entre
// as colunas na MESMA proporção informada, então numa janela estreita cada
// coluna espreme na mesma proporção, cortando texto e até botão inteiro
// (foi o que aconteceu com "Confirmar"/"Cancelar"). Em pixels + a tabela
// com width: max-content (ver index.css), cada coluna vale o que está
// escrito aqui sempre — se não couber tudo na largura da tela, quem
// aparece é uma barra de rolagem horizontal só daquela tabela, nunca um
// botão cortado pela metade.
const LARGURA_COLUNAS_TV = ['90px', '230px', '150px', '150px', '150px', '110px', '190px']
function ColunasTV() {
  return <colgroup>{LARGURA_COLUNAS_TV.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
}

const TIPO_AGENDAMENTO_LABEL = {
  retirada: 'Descida',
  retorno: 'Subida',
}

// A Fila de Rampa segue a mesma ideia do abastecimento (ver
// lib/statusAgendamento.js, lib/confirmacaoAutomatica.js): dois botões, e
// nada de passo intermediário ("Recebido" saiu). Mas o prazo NÃO é o mesmo
// pros dois tipos, e o rótulo do botão de confirmar muda por tipo (ver
// labelConfirmarAgendamento):
//
//   descida: 15 minutos. Botão "Navegando" — por clique ou pelo relógio,
//   grava status='concluido' — a notificação sai da Fila de Rampa e a
//   embarcação aparece na tabela "Navegando".
//
//   subida: 5 minutos, mais curto. Botão "Recolhido" — por clique ou pelo
//   relógio, grava TAMBÉM status='concluido' (mesmo destino da descida, só
//   que na retorno). Não existe estado intermediário: confirmar a subida
//   já É o "Recolhido" — a notificação some da Fila de Rampa e, no mesmo
//   instante, a embarcação some da tabela "Navegando" (ver
//   ultimaMovimentacaoPorEmbarcacao em lib/agendamentos.js). subidasNavegando/
//   subidasAvulsas abaixo continuam existindo só como suporte a registros
//   antigos com status='navegando' (fluxos anteriores) — o fluxo atual
//   nunca mais grava esse valor.
//
// O critério de "notificação ainda aguardando" mora em lib/filaRampa.js —
// usado também pelo apito global (SonsPainelAdmin.jsx).

export default function TelaVagas({ marinaId, perfil, onAcoes }) {
  const ehAdmin = perfil?.role === 'admin'
  const [agendamentos, setAgendamentos] = useState([])
  // Pedidos de combustível deste marina — a planilha de solicitações mais
  // abaixo. Só o pedido: não há preço, valor nem pagamento nesta tela.
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [mostrarCancelados, setMostrarCancelados] = useState(false)
  const [modalConfiguracoesAberto, setModalConfiguracoesAberto] = useState(false)
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
  const [configApitos, setConfigApitos] = useState(APITOS_PADRAO)
  const [formApitos, setFormApitos] = useState(APITOS_PADRAO)
  const [salvandoApitos, setSalvandoApitos] = useState(false)
  // Apito de combustível: toca (em SonsPainelAdmin.jsx, sempre montado)

  // Configurações do sistema — todas centralizadas no Painel de Controle
  // (ver ConfiguracoesPainel.jsx). A mensalidade e o cadastro de
  // combustíveis saíram daqui junto com a cobrança e o abastecimento: são
  // assunto do RV Finance. O que sobrou (apitos, e-mail do relatório,
  // agenda da rampa, localidade do clima) continua no mesmo
  // marinas.config_json, lido e gravado abaixo.
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

  async function carregar() {
    if (!marinaId) return
    const [a, doc, ped] = await Promise.all([
      listarAgendamentos(marinaId), listarDocumentos(marinaId), listarPedidosAbastecimento(marinaId),
    ])
    // Confirmação automática dos 15 minutos: dispara em segundo plano, sem
    // travar o carregamento da tela — a Fila de Rampa já esconde a linha na
    // hora certa usando o status EFETIVO (ver linhasFilaAtivas em
    // lib/filaRampa.js), então a escrita no banco não precisa ser
    // instantânea. Existem hoje DUAS redes de segurança pra essa escrita
    // acontecer de verdade, sem depender de ninguém: o job do banco
    // marina.auto_confirmar_agendamentos (pg_cron, a cada 5 minutos —
    // continua rodando mesmo com todo painel fechado) é quem garante a
    // regra por completo; esta varredura aqui só adianta o resultado
    // enquanto a tela está aberta, pra "Navegando"/o Diário de Bordo do
    // cliente atualizarem no próximo ciclo de 10s em vez de esperar o cron.
    autoConfirmarVencidos(a)
    setAgendamentos(a); setDocumentos(doc); setPedidosAbastecimento(ped)
  }

  // Varre a Fila de Rampa por notificações que já passaram do prazo sem
  // decisão da equipe e grava a confirmação automática sozinha — adiantando
  // o que o pg_cron (marina.auto_confirmar_agendamentos) faria de qualquer
  // jeito no próprio ciclo dele. O destino NÃO é mais sempre igual ao clique
  // manual: statusAutoConfirmadoAgendamento devolve 'concluido' pra descida
  // (igual ao clique) mas 'confirmado' pra subida (diferente do clique em
  // "Recolhido", que continua indo direto pra 'concluido' — ver
  // confirmarNotificacao). Falha de uma notificação isolada (rede, corrida
  // com outra aba) não impede as demais nem trava a tela: cada escrita é
  // independente, e o cron cobre o que sobrar.
  async function autoConfirmarVencidos(lista) {
    const vencidos = lista.filter((a) => a.status === 'solicitado' && !aguardandoDecisaoAgendamento(a))
    await Promise.all(vencidos.map((a) => atualizarStatusAgendamento(a.id, statusAutoConfirmadoAgendamento(a.tipo)).catch(() => {})))
  }

  useEffect(() => { carregar() }, [marinaId])

  // Atualização em tempo real da Fila de Rampa/Navegando: além do polling de
  // 10s (pensado pra smart TV sem ninguém mexendo), qualquer mudança em
  // agendamentos — inclusive uma subida confirmada direto por outro
  // administrador logado em outra sessão — aparece aqui na hora, sem esperar
  // o próximo ciclo do polling. Mesmo padrão já usado nas demais telas do
  // sistema.
  //
  // pedidos_abastecimento entra no mesmo canal: um pedido feito pelo cliente
  // aparece na planilha na hora, sem esperar o ciclo de 10s — que é o que
  // importa aqui, já que a equipe tem 15 minutos para decidir.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`vagas-${marinaId}-agendamentos`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'pedidos_abastecimento', filter: `marina_id=eq.${marinaId}` }, () => carregar())
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

  async function mudarStatusAgendamento(id, status, motivoCancelamento) {
    try {
      await atualizarStatusAgendamento(id, status, motivoCancelamento)
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar a notificação: ' + err.message)
    }
  }

  // Cancelar uma descida/subida pela Fila de Rampa sempre pede o motivo
  // antes — é o que o cliente vê no lugar do pedido cancelado (Diário de
  // Bordo/Histórico de solicitações, ver statusAgendamentoDiario em
  // TelaClienteDashboard.jsx), pra ele saber por que não vai mais acontecer.
  // Continua disponível mesmo depois da confirmação automática da subida
  // (status 'confirmado' — ver statusAutoConfirmadoAgendamento): só o clique
  // em "Recolhido" fecha de vez, "Cancelar" segue como válvula de escape até
  // lá. Campo vazio é permitido (motivo opcional); cancelar o próprio prompt
  // (Esc/"Cancelar" do navegador) desiste da ação, não confirma sem motivo.
  async function cancelarNotificacao(a) {
    const nome = a.clientes?.nome || 'o cliente'
    const motivo = window.prompt(`Motivo do cancelamento (enviado para ${nome}):`, '')
    if (motivo === null) return
    await mudarStatusAgendamento(a.id, 'cancelado', motivo.trim() || null)
  }

  // Os dois únicos botões da planilha de combustível. Não há nada além
  // disso: confirmar o abastecimento ou cancelar o pedido. Quem não clicar
  // em nenhum dos dois em 15 minutos tem o pedido confirmado sozinho pelo
  // relógio — nada é gravado nesse caso, a regra é derivada de created_at
  // (ver lib/statusAbastecimento.js).
  async function confirmarPedidoAbastecimento(id) {
    try {
      await confirmarAbastecimento(id)
      await carregar()
    } catch (err) {
      alert('Não foi possível confirmar o abastecimento: ' + err.message)
    }
  }

  async function cancelarPedidoAbastecimento(p) {
    if (!confirm(`Cancelar o pedido de ${p.combustiveis?.nome || 'combustível'} de ${p.clientes?.nome || 'cliente'}?`)) return
    try {
      await cancelarAbastecimento(p.id)
      await carregar()
    } catch (err) {
      alert('Não foi possível cancelar o pedido: ' + err.message)
    }
  }

  // Subidas (retorno) já em "Navegando" (status='navegando', ver
  // STATUS_FILA_OPCOES acima e statusLinha em lib/filaRampa.js) — saíram da
  // Fila de Rampa e agora são acompanhadas aqui, na tabela "Navegando",
  // junto com o resto do que já está na água.
  const subidasNavegando = agendamentos.filter((a) => a.tipo === 'retorno' && a.status === 'navegando')

  // Qualquer subida ainda em aberto pra uma embarcação — 'solicitado' e
  // 'confirmado' (ainda esperando na Fila de Rampa) além de 'navegando'.
  // Usada só pra achar o _subida de cada linha "na água" (abaixo): se o
  // operador marcar "Recolhido" direto pela tabela Navegando (sem esperar o
  // cliente chegar em "Navegando" pelo fluxo normal), uma solicitação de
  // subida que o cliente já tivesse pedido — e que ainda estivesse esperando
  // na Fila de Rampa — precisa ser encerrada junto, senão fica esquecida lá,
  // pedindo uma manobra que já aconteceu. Ver encerrarNavegacaoAcao.
  const subidasEmAberto = agendamentos.filter((a) => a.tipo === 'retorno' && ['solicitado', 'confirmado', 'navegando'].includes(a.status))

  // Embarcações "na água agora": a última movimentação concluída de cada
  // embarcação foi uma retirada (sem retorno concluído depois dela). Lógica
  // compartilhada com o painel do cliente — ver ultimaMovimentacaoPorEmbarcacao
  // em lib/agendamentos.js (desempata por created_at quando duas
  // movimentações têm o mesmo data_hora, senão uma retirada recém-confirmada
  // podia não aparecer aqui).
  //
  // Marcar "Recolhido" num resgate em andamento (ver o <select> de
  // resgate_status em linhaNavegando) passa pelo mesmo encerrarNavegacaoAcao
  // de qualquer outro "Recolhido" — cria o retorno concluído (ou fecha a
  // subida em aberto) de verdade, então essa retirada já sai daqui sozinha,
  // sem precisar de nenhum caso especial: some da tela "Navegando" e do
  // Diário de Bordo do cliente junto, igual a qualquer encerramento normal.
  //
  // Cada linha carrega também a subida em andamento pra essa mesma
  // embarcação (_subida), se houver — é o caso normal (o barco saiu, agora
  // está voltando): a linha continua uma só, mas o campo Status passa a
  // fechar esse retorno de verdade em vez de criar um retorno sintético
  // novo, ver encerrarNavegacaoAcao.
  const naAgua = Object.values(ultimaMovimentacaoPorEmbarcacao(agendamentos))
    .filter((a) => a.tipo === 'retirada')
    .map((a) => ({ ...a, _subida: subidasEmAberto.find((s) => s.embarcacao_id === a.embarcacao_id) || null }))

  // Subida em "Navegando" sem uma retirada correspondente rastreada como "na
  // água" (caso raro — ex.: a retirada original foi cancelada depois que a
  // subida já tinha sido pedida). Sem isso ela ficaria invisível assim que
  // saísse da Fila de Rampa, sem nenhum jeito de ser fechada.
  const subidasAvulsas = subidasNavegando.filter((s) => !naAgua.some((a) => a.embarcacao_id === s.embarcacao_id))

  // Linhas ativas da Fila de Rampa — ver lib/filaRampa.js (linhasFilaAtivas).
  const linhasFila = linhasFilaAtivas(agendamentos, agora.getTime())

  // Planilha de solicitações de combustível. Mostra só o que ainda espera
  // decisão da equipe (dentro dos 15 minutos, com os dois botões) — assim
  // que confirmado (pela equipe ou pelo relógio), sai daqui e passa a viver
  // no Histórico de abastecimento (Configurações → Histórico), de onde
  // também sai a planilha exportada. Cancelado sai na hora, do mesmo jeito.
  // Nada some do banco: o pedido continua no Histórico de Solicitações do
  // cliente.
  //
  // Mais recente em cima, que é a ordem em que a equipe precisa agir.
  const pedidosCombustivel = pedidosAbastecimento
    .filter((p) => aguardandoDecisao(p, agora.getTime()))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // Histórico de abastecimento (Configurações → Histórico): todo pedido já
  // confirmado — pela equipe ou pelo relógio — mais recente primeiro. Some
  // da planilha de trabalho acima na mesma hora em que entra aqui (mesmo
  // corte: abaixo é só a metade oposta do filtro, "não" aguardando decisão
  // e "não" cancelado).
  const historicoAbastecimento = pedidosAbastecimento
    .filter((p) => !aguardandoDecisao(p, agora.getTime()) && statusEfetivoAbastecimento(p, agora.getTime()) !== 'cancelado')
    .sort((a, b) => new Date(momentoConfirmacaoAbastecimento(b, agora.getTime()) || b.created_at) - new Date(momentoConfirmacaoAbastecimento(a, agora.getTime()) || a.created_at))

  // Histórico de manobras: toda descida ou subida já confirmada, mais recente
  // primeiro — vira o registro permanente assim que a notificação da Fila
  // de Rampa é confirmada (pela equipe ou pelo relógio, ver
  // autoConfirmarVencidos acima; não some quando a embarcação volta, como
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

  // Os apitos (descida/retorno/S.O.S./cancelamento de S.O.S.) não tocam mais
  // daqui — saíram pra SonsPainelAdmin.jsx, sempre montado em Layout.jsx, pra
  // continuar tocando mesmo com o administrador em outra tela (fora do Painel
  // de Controle). Esta tela mantém só a leitura/edição da configuração
  // (sonsAtivados/configApitos abaixo), usada pelo modal de Configurações →
  // Notificações.

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

  // Destravar o áudio na primeira interação da sessão saiu daqui — agora
  // acontece em SonsPainelAdmin.jsx (sempre montado, não só nesta tela).

  // Repassa as ações do painel pro botão de engrenagem no cabeçalho
  // (Layout), do lado do nome do usuário — abre direto a tela única
  // "Configurações do sistema" (ver ConfiguracoesPainel.jsx).
  useEffect(() => {
    onAcoes?.({ abrirConfiguracoes: () => setModalConfiguracoesAberto(true) })
  }, [])

  // Confirmar uma descida/subida da Fila de Rampa — sempre pro mesmo status
  // final (statusFinalAgendamento: 'concluido' pros dois tipos), só o
  // RÓTULO do botão muda por tipo (ver linhaNotificacao). Na descida isso
  // faz a notificação virar "Navegando"; na subida isso já É o "Recolhido"
  // — some da Fila de Rampa e, no mesmo instante, some a embarcação da
  // tabela "Navegando" (ver lib/statusAgendamento.js).
  async function confirmarNotificacao(a) {
    await mudarStatusAgendamento(a.id, statusFinalAgendamento(a.tipo))
  }

  // Linha da Fila de Rampa (notificação aguardando descida ou retorno). O
  // <select> de 3 passos deu lugar a dois botões, igual à planilha de
  // combustível — só que aqui o rótulo do botão de confirmar muda por tipo
  // (ver labelConfirmarAgendamento em lib/statusAgendamento.js): "Navegando"
  // na descida, "Recolhido" na subida. O prazo também muda por tipo (15min/
  // 5min), sem contagem regressiva visível na tela. O selo de status saiu
  // daqui — a confirmação é sempre automática (clique ou o prazo vencendo),
  // não precisa de um campo pra anunciar "Solicitado"; a coluna fica vazia
  // (mantida só pro alinhamento bater com as outras duas tabelas — ver
  // comentário em cima das 3 tabelas, mais abaixo). Os botões continuam
  // aparecendo mesmo depois do prazo vencer sozinho: na subida, vencer o
  // prazo não finaliza mais nada (vira 'confirmado', ver
  // statusAutoConfirmadoAgendamento) — a notificação continua aqui até
  // "Recolhido" de verdade, e "Cancelar" continua valendo o tempo todo.
  function linhaNotificacao(a) {
    const doc = statusDocumentacao(a.embarcacao_id)
    return (
      <tr key={a.id}>
        <td className={`pedido ${a.tipo === 'retirada' ? 'tipo-descida' : 'tipo-subida'}`}>{TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}</td>
        <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
        <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
        <td><span className={`badge status-${doc}`}>{doc === 'regular' ? 'Regular' : 'Pendente'}</span></td>
        <td></td>
        <td></td>
        <td className="col-acoes">
          <div className="fila-tabela-acoes">
            <button type="button" onClick={() => confirmarNotificacao(a)}>{labelConfirmarAgendamento(a.tipo)}</button>
            <button type="button" className="cancelar" onClick={() => cancelarNotificacao(a)}>Cancelar</button>
          </div>
        </td>
      </tr>
    )
  }

  // Status da embarcação navegando: um alerta de resgate ativo (ver
  // lib/statusResgate.js) tem prioridade sobre o resto; sem isso, o relógio
  // decide sozinho — Navegando (verde) até completar 2h de atraso sobre a
  // previsão de retorno, daí vira Excedeu retorno (vermelho).
  //
  // "cancelado" (cliente cancelou o próprio S.O.S., confirmando "Estou
  // bem") é tratado à parte: só conta como alerta ativo por
  // JANELA_ESTOU_BEM_MS (5min) a partir de resgate_atualizado_em — depois
  // disso cai pro resto da função como se não tivesse resgate_status
  // nenhum, voltando sozinho pro Navegando normal (ou Excedeu retorno, se
  // for o caso), sem precisar de nenhuma ação da equipe.
  function statusNavegando(a) {
    if (a.resgate_status === 'cancelado') {
      if (estouBemAtivo(a, agora.getTime())) return { classe: 'estou-bem', texto: 'Estou bem' }
    } else if (a.resgate_status) {
      return { classe: `resgate-${a.resgate_status}`, texto: labelStatusResgate(a.resgate_status) }
    }
    if (a.previsao_retorno) {
      const previsto = new Date(a.previsao_retorno).getTime()
      if (agora.getTime() >= previsto + 2 * 60 * 60 * 1000) return { classe: 'excedeu_retorno', texto: 'Excedeu retorno' }
    }
    return { classe: 'navegando', texto: 'Navegando' }
  }

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
  // "Recolhido"/"Cancelar", ver linhaNavegando abaixo), sem esperar o
  // cliente enviar uma Subida pelo app. Confirma antes de agir —
  // ao contrário do resto da Fila de Rampa, aqui não tem "desfazer" fácil
  // (cria um retorno novo, ou cancela a descida original).
  //
  // Quando já existe uma Subida em aberto pra essa embarcação — pedida pelo
  // cliente e ainda esperando na Fila de Rampa ('solicitado'/'confirmado'),
  // ou já em 'navegando' (ver subidasEmAberto/naAgua acima) — fecha esse
  // registro de verdade em vez de criar um retorno sintético novo: "Recolhido"
  // conclui a própria subida (ela some da Fila de Rampa e do Diário de Bordo
  // ativo do cliente na hora, do mesmo jeito que qualquer outro agendamento
  // concluído); "Cancelar" cancela só essa subida (a embarcação continua
  // rastreada como na água). Sem isso, marcar "Recolhido" direto por aqui
  // deixava uma solicitação de subida que o cliente já tivesse enviado
  // esquecida na Fila de Rampa, pedindo uma manobra que já aconteceu.
  //
  // "Resgatado" existia como opção separada de "Recolhido" antes — foi
  // retirada: "Recolhido" agora cumpre as duas funções (encerrar uma
  // navegação comum e encerrar um S.O.S. em andamento), sem distinção.
  const LABEL_ENCERRAR = { recolhido: 'Recolhido', cancelado: 'Cancelado' }
  async function encerrarNavegacaoAcao(a, motivo) {
    const nome = a.clientes?.nome || 'esse cliente'
    if (!confirm(`Marcar "${LABEL_ENCERRAR[motivo]}" para ${nome}${a.embarcacoes?.nome ? ` (${a.embarcacoes.nome})` : ''}?`)) return
    try {
      if (a._subida) {
        await atualizarStatusAgendamento(a._subida.id, motivo === 'recolhido' ? 'concluido' : 'cancelado')
      } else {
        await encerrarNavegacao(a, motivo)
      }
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar: ' + err.message)
    }
  }

  // Linha de "Navegando" — só o essencial: quem está com a embarcação, desde
  // quando, e a previsão de retorno (com o status mudando sozinho se
  // atrasar). Sem a natureza do pedido e sem o indicativo luminoso — isso já
  // fica na Fila de Rampa, antes de sair pra água. Informação de
  // abastecimento não aparece em lugar nenhum do painel: foi pro RV Finance.
  function linhaNavegando(a) {
    const status = statusNavegando(a)
    return (
      <tr key={a.id}>
        <td></td>
        <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
        <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
        <td>{a.previsao_retorno ? new Date(a.previsao_retorno).toLocaleString('pt-BR') : 'Sem previsão informada'}</td>
        <td></td>
        <td>
          {a.resgate_status === 'cancelado' && status.classe === 'estou-bem' ? (
            // Cliente cancelou o próprio S.O.S. — mostra "Estou bem", sem
            // nenhum controle (não precisa de ação da equipe, é só um
            // aviso). Some sozinho depois de JANELA_ESTOU_BEM_MS: quando
            // isso acontece, status.classe deixa de ser 'estou-bem' (ver
            // statusNavegando acima) e a linha cai direto no seletor normal
            // do último ramo abaixo, como se não tivesse tido resgate nenhum.
            <span className={`badge status-${status.classe}`} title="O cliente cancelou o S.O.S. — some sozinho em alguns minutos">
              {status.texto}
            </span>
          ) : a.resgate_status && a.resgate_status !== 'solicitado' && a.resgate_status !== 'cancelado' ? (
            // Pedido já recebido (ou recolhido): vira um seletor editável,
            // igual ao padrão de status de Manutenção — salva na hora, sem
            // precisar de um botão "Salvar" separado. "Recolhido" aqui é o
            // mesmo encerramento de sempre (encerrarNavegacaoAcao — cria o
            // retorno concluído/fecha a subida em aberto, com a mesma
            // confirmação) e não só uma troca de resgate_status: assim a
            // navegação sai do Diário de Bordo do cliente e da tabela
            // Navegando igualzinho a um "Recolhido" sem S.O.S. nenhum, em
            // vez de ficar presa "na água" só com o rótulo mudado.
            <select
              value={a.resgate_status}
              onChange={(e) => {
                const valor = e.target.value
                if (valor === 'recolhido') encerrarNavegacaoAcao(a, 'recolhido')
                else definirStatusResgate(a.id, valor)
              }}
              title="Status do resgate"
            >
              {/* "Solicitação de resgate" e "Estou bem" ficam de fora do
                  seletor de propósito — "Solicitação de resgate" só é
                  alcançado pelo clique inicial no badge (ou pelo próprio
                  cliente via S.O.S.), e "Estou bem" só pelo cancelamento do
                  próprio cliente (ver ramo acima); selecionar qualquer um
                  dos dois aqui bagunçaria esses fluxos. */}
              {STATUS_RESGATE.filter((s) => s.valor !== 'solicitado' && s.valor !== 'cancelado').map((s) => (
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
            // Navegação normal (sem alerta de resgate em andamento): o selo
            // "Navegando" saiu — é redundante, qualquer linha parada aqui já
            // está, por definição, navegando (só sobra o selo pras duas
            // situações que realmente precisam chamar atenção: S.O.S. ativo,
            // tratado nos ramos acima, ou "Excedeu retorno", classe
            // diferente de 'navegando' — ver statusNavegando). O seletor com
            // 4 opções (Recolhido/Cancelar/Solicitação de resgate) já tinha
            // saído daqui antes. Encerrar a navegação normalmente é o
            // cliente pedindo a Subida pelo app (Fila de Rampa, com os
            // botões Recolhido/Cancelar e o prazo de 5min — ver
            // linhaNotificacao). A lixeira ao lado é só a válvula de escape
            // pra quando isso não acontece (cliente sem o app à mão,
            // esqueceu de pedir etc.): apaga a notificação da tela marcando
            // a navegação como encerrada, mesma ação de "Recolhido" de
            // sempre (encerrarNavegacaoAcao).
            <>
              {status.classe !== 'navegando' && <span className={`badge status-${status.classe}`}>{status.texto}</span>}
              <button
                type="button"
                className="icone-lixeira"
                title="Apagar notificação (o cliente não pediu a subida pelo app)"
                onClick={() => encerrarNavegacaoAcao(a, 'recolhido')}
              >
                <IconTrash size={16} />
              </button>
            </>
          )}
        </td>
        <td></td>
      </tr>
    )
  }

  // Linha de uma Subida "avulsa" na tabela Navegando (ver subidasAvulsas
  // acima) — já saiu da Fila de Rampa, mas não tem uma retirada rastreada
  // como "na água" pra se juntar. Colunas mais simples: sem horário de saída
  // vindo de uma retirada, e o próprio horário da subida vale como previsão
  // de retorno. Sem fluxo de S.O.S./resgate aqui — isso vive na retirada.
  function linhaSubidaAvulsa(a) {
    return (
      <tr key={a.id}>
        <td></td>
        <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
        <td>—</td>
        <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
        <td></td>
        <td>
          <select
            className="badge select-status-fila status-navegando"
            value=""
            title="Selecionar ação"
            onChange={(e) => {
              const valor = e.target.value
              e.target.value = ''
              if (valor === 'concluido' || valor === 'cancelado') mudarStatusAgendamento(a.id, valor)
            }}
          >
            <option value="">Navegando</option>
            <option value="concluido">Recolhido</option>
            <option value="cancelado">Cancelar</option>
          </select>
        </td>
        <td></td>
      </tr>
    )
  }

  const IconeClima = clima ? (ICONE_CLIMA[clima.icone] || IconCloud) : null

  return (
    // .painel-controle: escopo da densidade desta tela (ver index.css).
    // As folgas verticais foram reduzidas só aqui — .tabela, .conteudo e os
    // <h2> são compartilhados com Clientes/Financeiro/Manutenção/
    // Abastecimento, que continuam com o respiro de sempre.
    <div className="painel-controle">
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

      <h2>Fila de Rampa</h2>

      <div className="tabela-scroll">
      <table className="tabela tabela-fila">
        <ColunasTV />
        <thead>
          <tr>
            <th>Pedido</th>
            <th className="col-responsavel">Responsável</th>
            <th>Horário</th>
            <th>Documentação</th>
            <th></th>
            {/* A coluna "Abastecimento" saiu daqui — foi pro RV Finance. O
                selo "Status" também saiu (ver linhaNotificacao) — a
                confirmação aqui é sempre automática, não precisa de campo
                próprio pra anunciar. */}
            <th></th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhasFila.length === 0 && <tr><td colSpan={7}>Nenhuma notificação de descida ou subida no momento.</td></tr>}
          {linhasFila.map((a) => linhaNotificacao(a))}
        </tbody>
      </table>
      </div>

      <h2>Navegando</h2>
      <div className="tabela-scroll">
      <table className="tabela tabela-fila">
        <ColunasTV />
        <thead>
          <tr>
            <th></th>
            <th className="col-responsavel">Responsável</th>
            <th>Horário de saída</th>
            <th>Previsão de retorno</th>
            <th></th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {naAgua.length === 0 && subidasAvulsas.length === 0 && <tr><td colSpan={7}>Nenhuma embarcação na água no momento.</td></tr>}
          {naAgua.map((a) => linhaNavegando(a))}
          {subidasAvulsas.map((a) => linhaSubidaAvulsa(a))}
        </tbody>
      </table>
      </div>

      {/* Planilha de solicitações de combustível. Só o pedido — nada de
          preço, valor ou pagamento, que são do RV Finance. A equipe tem dois
          botões; passado o prazo, o pedido sai daqui sozinho e vai para o
          Histórico de abastecimento (Configurações → Histórico — ver
          statusEfetivoAbastecimento em lib/statusAbastecimento.js). */}
      <h2>Solicitações de combustível</h2>
      <div className="tabela-scroll">
      <table className="tabela tabela-fila">
        <ColunasTV />
        <thead>
          <tr>
            <th></th>
            <th className="col-responsavel">Responsável</th>
            <th>Combustível</th>
            <th>Quantidade</th>
            <th>Pedido em</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {pedidosCombustivel.length === 0 && <tr><td colSpan={7}>Nenhuma solicitação de combustível no momento.</td></tr>}
          {pedidosCombustivel.map((p) => {
            // pedidosCombustivel já vem filtrado só com quem ainda aguarda
            // decisão (ver o filtro logo acima) — os botões aparecem sempre
            // aqui. Sem cronômetro visível: só o selo de status.
            const efetivo = statusEfetivoAbastecimento(p, agora.getTime())
            return (
              <tr key={p.id}>
                <td></td>
                <td className="col-responsavel">
                  <b>{p.clientes?.nome}</b>{p.embarcacoes?.nome ? ` · ${p.embarcacoes.nome}` : ''}
                </td>
                <td>{p.combustiveis?.nome || '—'}</td>
                <td>{textoQuantidade(p)}</td>
                <td>{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                <td>
                  <span className={`badge status-${classeStatusAbastecimento(efetivo)}`}>{labelStatusAbastecimento(efetivo)}</span>
                </td>
                <td className="col-acoes">
                  <div className="fila-tabela-acoes">
                    <button type="button" onClick={() => confirmarPedidoAbastecimento(p.id)}>Confirmar</button>
                    <button type="button" className="cancelar" onClick={() => cancelarPedidoAbastecimento(p)}>Cancelar</button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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

      {/* Assinatura da aplicação, fechando o Painel de Controle: identifica
          o RV Marine e credita a RV Invictus numa linha só. Mesmo gesto
          tipográfico dos outros rodapés do sistema (Cinzel, caixa alta,
          tracking), agora no dourado do rótulo TORRES/TS logo acima. */}
      <a className="painel-controle-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">
        RV Marine by RVinvictus.com.br
      </a>

      <ConfiguracoesPainel
        aberto={modalConfiguracoesAberto}
        onFechar={() => setModalConfiguracoesAberto(false)}
        ehAdmin={ehAdmin}
        marinaId={marinaId}
        historicoManobras={historicoManobras}
        tipoAgendamentoLabel={TIPO_AGENDAMENTO_LABEL}
        historicoAbastecimento={historicoAbastecimento}
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
