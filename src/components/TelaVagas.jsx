import { useEffect, useState } from 'react'
import { IconSun, IconCloud, IconCloudRain, IconCloudSnow, IconCloudStorm, IconTemperature, IconWind } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import {
  listarAgendamentos, atualizarStatusAgendamento, atualizarStatusResgate, encerrarNavegacao,
  listarPedidosAbastecimento, atualizarStatusAbastecimento, listarCombustiveis, salvarCombustivel,
  listarDocumentos, buscarMarina, atualizarConfigMarina, enviarRelatorioDocumentosAgora,
} from '../lib/db'
import { ativarSons } from '../lib/sons'
import { buscarClimaAtual } from '../lib/clima'
import { STATUS_RESGATE, labelStatusResgate, estouBemAtivo } from '../lib/statusResgate'
import { ultimaMovimentacaoPorEmbarcacao } from '../lib/agendamentos'
import { STATUS_ABASTECIMENTO_LABEL, abastecimentoConcluido, aguardandoLitrosCompletarTanque } from '../lib/statusAbastecimento'
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

const TIPO_AGENDAMENTO_LABEL = {
  retirada: 'Descida',
  retorno: 'Subida',
}

// "Recolhido" deixou de ser uma opção do campo Status da Fila de Rampa —
// vira uma ação da tabela "Navegando" (ver naAgua/subidasNavegando/
// linhaNavegando/linhaSubidaAvulsa). O critério de "notificação ainda
// aguardando" (statusLinha) mora agora em lib/filaRampa.js — extraído de
// lá porque o apito de descida/retorno passou a precisar da mesma lógica
// fora desta tela (ver SonsPainelAdmin.jsx, sempre montado em Layout.jsx).

// Campo Status da Fila de Rampa: um <select> só, o operador escolhe direto
// aqui, sem botão "Confirmar" separado. "Solicitado" reaproveita o status
// que já vem do pedido do cliente; "Recebido" usa o status 'confirmado' (já
// existia no banco, nunca usado até aqui).
//
// Na descida, o status final reaproveita 'concluido' e vira "Navegando" — a
// notificação sai da Fila de Rampa e passa a aparecer na tabela "Navegando"
// logo abaixo, como já acontecia.
//
// Na subida, "Navegando" (status='navegando', valor novo, sem constraint no
// banco pra travar os valores possíveis) é o último passo por aqui: assim
// que escolhido, a notificação sai da Fila de Rampa (ver statusLinha em
// lib/filaRampa.js) e passa a aparecer também na tabela "Navegando", junto com o resto do que
// já está na água. "Recolhido" não é mais uma opção deste campo — vira uma
// ação de lá (ver linhaNavegando/encerrarNavegacaoAcao), então nem precisa
// de status próprio aqui.
const STATUS_FILA_OPCOES = {
  retirada: [
    { valor: 'solicitado', label: 'Solicitado' },
    { valor: 'confirmado', label: 'Recebido' },
    { valor: 'concluido', label: 'Navegando' },
  ],
  retorno: [
    { valor: 'solicitado', label: 'Solicitado' },
    { valor: 'confirmado', label: 'Recebido' },
    { valor: 'navegando', label: 'Navegando' },
  ],
}

// Cor do campo Status: tom terroso (mesmo de sempre) pra "Solicitado",
// amarelo (mesmo tom já usado em Manutenção "Em andamento") pra "Recebido",
// e o mesmo verde de ".status-navegando" (tabela Navegando) pro status
// final e pro "Navegando" da subida — ver .select-status-fila no index.css.
function classeStatusFila(status) {
  if (status === 'confirmado') return 'recebido'
  if (status === 'concluido' || status === 'navegando') return 'navegando'
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
  const [configApitos, setConfigApitos] = useState(APITOS_PADRAO)
  const [formApitos, setFormApitos] = useState(APITOS_PADRAO)
  const [salvandoApitos, setSalvandoApitos] = useState(false)
  // Apito de combustível: toca (em SonsPainelAdmin.jsx, sempre montado)
  // quando o cliente registra um pedido de abastecimento pelo Diário de
  // Bordo — configurável à parte do aviso sonoro geral, mesma fonte
  // marinas.config_json (chave apitoCombustivelAtivado, ligada por padrão).
  const [apitoCombustivelAtivado, setApitoCombustivelAtivado] = useState(true)
  const [salvandoApitoCombustivel, setSalvandoApitoCombustivel] = useState(false)

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
      setApitoCombustivelAtivado(cfg.apitoCombustivelAtivado ?? true)
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

  async function carregar() {
    if (!marinaId) return
    const [a, p, c, doc] = await Promise.all([
      listarAgendamentos(marinaId),
      listarPedidosAbastecimento(marinaId), listarCombustiveis(marinaId), listarDocumentos(marinaId),
    ])
    setAgendamentos(a); setPedidosAbastecimento(p); setCombustiveis(c); setDocumentos(doc)
  }

  useEffect(() => { carregar() }, [marinaId])

  // Atualização em tempo real da Fila de Rampa/Navegando/Combustível: além
  // do polling de 10s (pensado pra smart TV sem ninguém mexendo), qualquer
  // mudança em agendamentos — inclusive uma subida confirmada direto por
  // outro administrador logado em outra sessão — aparece aqui na hora, sem
  // esperar o próximo ciclo do polling. pedidos_abastecimento entrou no
  // mesmo canal junto com a seção "Combustível" abaixo: uma mudança de
  // status feita na aba Abastecimento (TelaAbastecimento.jsx) ou pelo
  // próprio cliente (cancelamento no Diário de Bordo) aparece aqui na hora
  // também, sem esperar o polling. Mesmo padrão já usado nas demais telas
  // do sistema.
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
  const linhasFila = linhasFilaAtivas(agendamentos)

  // Só aparece no painel o pedido já pago via Pix — não existe aqui opção de
  // marcar "aguardando pagamento" ou "pago", isso é automático quando o
  // pagamento real for confirmado. A única ação do operador é dar baixa
  // (marcar entregue) depois de abastecer.
  const abastecimentosAtivos = pedidosAbastecimento.filter((p) => p.status === 'pago')

  // Seção "Combustível": todos os pedidos ainda não concluídos, com as
  // mesmas informações e o mesmo status da aba Abastecimento (ver
  // pedidosVisiveis em TelaAbastecimento.jsx — mesmo critério
  // abastecimentoConcluido, importado da mesma fonte única). Ao contrário
  // de abastecimentosAtivos acima (só o que já está pago, pronto pra
  // entregar fisicamente numa embarcação já na água), esta lista mostra
  // TODO pedido em aberto, tenha ou não uma descida/subida associada no
  // momento — é o que permite acompanhar aqui, sem precisar trocar de aba,
  // um pedido feito antes de qualquer agendamento ou pra uma embarcação que
  // já saiu da Fila de Rampa/Navegando.
  const pedidosCombustivel = pedidosAbastecimento
    .filter((p) => !abastecimentoConcluido(p.status))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

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

  // Os apitos (descida/retorno/S.O.S./cancelamento de S.O.S./combustível)
  // não tocam mais daqui — saíram pra SonsPainelAdmin.jsx, sempre montado em
  // Layout.jsx, pra continuar tocando mesmo com o administrador em outra
  // tela (fora do Painel de Controle). Esta tela mantém só a leitura/edição
  // da configuração (sonsAtivados/configApitos/apitoCombustivelAtivado
  // abaixo), usada pelo modal de Configurações → Notificações.

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

  // Liga/desliga só o apito de combustível — independente do interruptor
  // geral acima (dá pra manter descida/retorno/S.O.S. ligados e desligar só
  // este, ou vice-versa). Mesmo mecanismo de sempre: só admin, grava em
  // marinas.config_json, Realtime propaga na hora.
  async function alternarApitoCombustivel() {
    if (!ehAdmin || salvandoApitoCombustivel) return
    const novoValor = !apitoCombustivelAtivado
    setSalvandoApitoCombustivel(true)
    try {
      await atualizarConfigMarina(marinaId, { apitoCombustivelAtivado: novoValor })
      setApitoCombustivelAtivado(novoValor)
      if (novoValor) ativarSons()
    } catch (err) {
      alert('Não foi possível salvar o apito de combustível: ' + err.message)
    } finally {
      setSalvandoApitoCombustivel(false)
    }
  }

  // Destravar o áudio na primeira interação da sessão saiu daqui — agora
  // acontece em SonsPainelAdmin.jsx (sempre montado, não só nesta tela).

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

  // Clique no badge do resgate — comportamento depende do estado atual:
  //  - Sem alerta (Navegando/Excedeu retorno): marca "Solicitação de
  //    resgate" manualmente (a equipe percebeu que a embarcação precisa de
  //    ajuda, sem esperar o cliente acionar o S.O.S. pelo app).
  //  - "Solicitação de resgate": confirma o recebimento do pedido — avança
  //    automaticamente pra "Pedido recebido" (continua vermelho) e para o
  //    apito contínuo de SOS.
  // A opção "Recolhido" (fechar o atendimento) fica no seletor que aparece
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
            // Navegação normal (sem alerta de resgate em andamento): o
            // campo Status vira um seletor só, com a opção de marcar
            // manualmente uma Solicitação de resgate (mesma ação de antes,
            // agora aqui dentro) e as 2 formas de encerrar a navegação —
            // Recolhido (retorno normal, sem o cliente precisar pedir a
            // Subida pelo app) e Cancelar (anula a descida).
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
              <option value="cancelado">Cancelar</option>
            </select>
          )}
        </td>
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
        <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
        <td>—</td>
        <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
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
          {naAgua.length === 0 && subidasAvulsas.length === 0 && <tr><td colSpan={4}>Nenhuma embarcação na água no momento.</td></tr>}
          {naAgua.map((a) => linhaNavegando(a))}
          {subidasAvulsas.map((a) => linhaSubidaAvulsa(a))}
        </tbody>
      </table>

      {/* Espelha a aba Abastecimento (TelaAbastecimento.jsx): mesmas colunas
          e o mesmo status, só pra consulta — sem seletor, botão ou qualquer
          controle de alteração aqui (a mudança de status é feita só pela
          aba Abastecimento). Fonte única do rótulo/critério em
          lib/statusAbastecimento.js — exceto o "Tanque cheio" (pedido
          "Completar tanque" ainda aguardando pagamento, ver
          aguardandoLitrosCompletarTanque), que só aparece aqui, nesta tela. Qualquer
          mudança feita na aba Abastecimento (ou pelo cliente, cancelando no
          Diário de Bordo) aparece aqui imediatamente (ver canal Realtime
          acima). */}
      <h2>Combustível</h2>
      <table className="tabela" style={{ marginBottom: 32 }}>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Embarcação</th>
            <th>Data/Horário</th>
            <th>Combustível</th>
            <th>Qtd (L)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {pedidosCombustivel.length === 0 && <tr><td colSpan={6}>Nenhum pedido de abastecimento no momento.</td></tr>}
          {pedidosCombustivel.map((p) => (
            <tr key={p.id}>
              <td>{p.clientes?.nome}</td>
              <td>{p.embarcacoes?.nome || '-'}</td>
              <td>{new Date(p.created_at).toLocaleString('pt-BR')}</td>
              <td>{p.combustiveis?.nome}</td>
              {/* "Completar tanque" (ver lib/statusAbastecimento.js) sem
                  litros ainda registrados: mostra "completar" em vez de "—"
                  ou de um número (não tem quantidade fechada, só se sabe
                  depois de encher o tanque — ver aguardandoLitrosCompletarTanque
                  em lib/statusAbastecimento.js). Some assim que a marina
                  registra os litros reais na aba Abastecimento (ver
                  FormLitrosCompletarTanque em TelaAbastecimento.jsx) — a
                  partir daí mostra o número normalmente, igual qualquer
                  outro pedido. */}
              <td>{aguardandoLitrosCompletarTanque(p) ? 'completar' : Number(p.quantidade_litros).toFixed(2)}</td>
              <td>
                {/* "Completar tanque" (ver lib/statusAbastecimento.js) ainda
                    "aguardando_pagamento" — em vez do rótulo padrão, mostra
                    "Tanque cheio" em verde: já foi abastecido, só falta o
                    cliente pagar presencialmente na marina. Some daqui do
                    mesmo jeito assim que virar "Pagamento efetuado" (ver
                    abastecimentoConcluido/pedidosCombustivel acima). */}
                {aguardandoLitrosCompletarTanque(p) && p.status === 'aguardando_pagamento' ? (
                  <span className="badge status-tanque-cheio">Tanque cheio</span>
                ) : (
                  <span className={`badge status-${p.status}`}>{STATUS_ABASTECIMENTO_LABEL[p.status] || p.status}</span>
                )}
              </td>
            </tr>
          ))}
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
        apitoCombustivelAtivado={apitoCombustivelAtivado}
        onAlternarApitoCombustivel={alternarApitoCombustivel}
        salvandoApitoCombustivel={salvandoApitoCombustivel}
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
