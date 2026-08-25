import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarAgendamentos, listarPedidosAbastecimento, buscarMarina } from '../lib/db'
import {
  destravarAudioNaProximaInteracao, tocarSinalDescida, tocarSinalRetorno,
  tocarApitoSos, tocarAlarmeCancelamentoSos, tocarApitoCombustivel,
} from '../lib/sons'
import { ultimaMovimentacaoPorEmbarcacao } from '../lib/agendamentos'
import { linhasFilaAtivas } from '../lib/filaRampa'

const APITOS_PADRAO = { descida: 1, retorno: 3 }

// Mesmo intervalo de polling do Painel de Controle (ver
// INTERVALO_ATUALIZACAO_MS em TelaVagas.jsx) — reserva pro caso raro do
// Realtime cair; o normal é o canal abaixo já avisar na hora.
const INTERVALO_ATUALIZACAO_MS = 10000

// Apito global do painel administrativo — montado uma vez só, direto em
// Layout.jsx (o "shell" que envolve TODAS as telas da equipe: Painel de
// Controle, Clientes, Financeiro, Manutenção, Abastecimento, e até a tela
// de seleção de aplicações), pra tocar os apitos configurados mesmo com o
// administrador em qualquer outra aba — antes esse acompanhamento só
// existia dentro de TelaVagas.jsx, então parava de tocar assim que a pessoa
// saía do Painel de Controle. Não desenha nada na tela (retorna null) — é
// só um "ouvinte" sempre ativo, com sua própria busca de dados e assinatura
// Realtime, independente da tela que TelaVagas.jsx usa pra desenhar as
// tabelas (as duas convivem: aqui só decide SE/QUANDO toca um apito, lá só
// desenha a tabela — nenhuma delas mexe na outra).
//
// Cobre os mesmos 4 apitos que já existiam (descida, retorno, S.O.S. em
// loop, cancelamento de S.O.S. — lógica idêntica à que saiu de
// TelaVagas.jsx) mais o novo apito de combustível (toca quando o cliente
// registra um pedido de abastecimento pelo Diário de Bordo — ver
// enviarAbastecimento em TelaClienteDashboard.jsx).
export default function SonsPainelAdmin({ marinaId }) {
  const [sonsAtivados, setSonsAtivados] = useState(true)
  const [configApitos, setConfigApitos] = useState(APITOS_PADRAO)
  const [apitoCombustivelAtivado, setApitoCombustivelAtivado] = useState(true)
  const [agendamentos, setAgendamentos] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])

  const cargasCompletadasRef = useRef(0)
  const idsConhecidosFilaRef = useRef(null)
  const alarmeResgateRef = useRef(null)
  const resgateStatusConhecidoRef = useRef(null)
  const idsConhecidosPedidosRef = useRef(null)

  // Destrava o áudio na primeira interação da sessão inteira (clique/tecla/
  // toque em qualquer tela administrativa) — mesmo helper que já existia em
  // TelaVagas.jsx, só que agora dispara aqui, que é o que fica montado
  // sempre, em vez de só dentro do Painel de Controle.
  useEffect(() => { destravarAudioNaProximaInteracao() }, [])

  // Configuração da marina (aviso sonoro geral, apitos por manobra, apito de
  // combustível) — mesma fonte marinas.config_json que Configurações →
  // Notificações lê/grava (ver ConfiguracoesPainel.jsx/TelaVagas.jsx); só
  // leitura aqui, a edição continua exclusivamente na tela de Configurações.
  function carregarConfig() {
    if (!marinaId) return
    buscarMarina(marinaId).then((m) => {
      const cfg = m?.config_json || {}
      setConfigApitos({
        descida: cfg.apitosDescida ?? APITOS_PADRAO.descida,
        retorno: cfg.apitosRetorno ?? APITOS_PADRAO.retorno,
      })
      setSonsAtivados(cfg.avisoSonoroAtivado ?? true)
      setApitoCombustivelAtivado(cfg.apitoCombustivelAtivado ?? true)
    })
  }
  useEffect(() => { carregarConfig() }, [marinaId])

  async function carregar() {
    if (!marinaId) return
    const [a, p] = await Promise.all([listarAgendamentos(marinaId), listarPedidosAbastecimento(marinaId)])
    setAgendamentos(a)
    setPedidosAbastecimento(p)
    cargasCompletadasRef.current += 1
  }
  useEffect(() => { carregar() }, [marinaId])

  // Realtime (config + eventos) e polling de reserva — mesmo padrão já
  // usado no resto do sistema. Nomes de canal próprios (prefixo
  // "sons-globais-"), pra não colidir com os canais que TelaVagas.jsx já
  // assina pra desenhar suas próprias tabelas.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`sons-globais-${marinaId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'marina', table: 'marinas', filter: `id=eq.${marinaId}` }, () => carregarConfig())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'pedidos_abastecimento', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    const polling = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    return () => { supabase.removeChannel(canal); clearInterval(polling) }
  }, [marinaId])

  // Descida/retorno: apito assim que uma notificação NOVA entra na Fila de
  // Rampa — mesma detecção "só a partir da atualização seguinte" que já
  // existia em TelaVagas.jsx (ver idsConhecidosRef de lá), agora usando
  // linhasFilaAtivas (lib/filaRampa.js) como fonte única do filtro.
  const linhasFila = linhasFilaAtivas(agendamentos)
  const idsLinhaFilaAtual = linhasFila.map((a) => a.id).sort().join(',')
  useEffect(() => {
    const idsAtuais = new Set(linhasFila.map((a) => a.id))
    if (idsConhecidosFilaRef.current === null || cargasCompletadasRef.current <= 1) {
      idsConhecidosFilaRef.current = idsAtuais
      return
    }
    linhasFila.forEach((a) => {
      if (!idsConhecidosFilaRef.current.has(a.id) && sonsAtivados) {
        if (a.tipo === 'retirada') tocarSinalDescida(configApitos.descida)
        else tocarSinalRetorno(configApitos.retorno)
      }
    })
    idsConhecidosFilaRef.current = idsAtuais
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsLinhaFilaAtual, configApitos, sonsAtivados])

  // S.O.S. ativo: apito em loop enquanto qualquer embarcação na água estiver
  // com resgate_status === 'solicitado' — mesma lógica que já existia em
  // TelaVagas.jsx (alarmeResgateRef).
  const naAgua = Object.values(ultimaMovimentacaoPorEmbarcacao(agendamentos)).filter((a) => a.tipo === 'retirada')
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
  useEffect(() => () => {
    if (alarmeResgateRef.current) clearInterval(alarmeResgateRef.current)
  }, [])

  // Cliente cancelou o próprio S.O.S. ("Estou bem"): 4 apitos pontuais —
  // mesma detecção "muda pra 'cancelado'" que já existia em TelaVagas.jsx.
  const resgateStatusAtualChave = agendamentos.map((a) => `${a.id}:${a.resgate_status || ''}`).sort().join(',')
  useEffect(() => {
    const atual = new Map(agendamentos.map((a) => [a.id, a.resgate_status]))
    if (resgateStatusConhecidoRef.current === null || cargasCompletadasRef.current <= 1) {
      resgateStatusConhecidoRef.current = atual
      return
    }
    const anterior = resgateStatusConhecidoRef.current
    atual.forEach((status, id) => {
      if (status === 'cancelado' && anterior.get(id) !== 'cancelado' && sonsAtivados) {
        tocarAlarmeCancelamentoSos()
      }
    })
    resgateStatusConhecidoRef.current = atual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resgateStatusAtualChave, sonsAtivados])

  // Novo pedido de combustível (normal ou "Completar tanque" — os dois
  // entram como 'solicitado', ver enviarAbastecimento em
  // TelaClienteDashboard.jsx): apito de dois tons (tocarApitoCombustivel),
  // configurável à parte do aviso sonoro geral (ver Configurações →
  // Notificações → "Apito de combustível" em ConfiguracoesPainel.jsx), mas
  // ainda sujeito ao interruptor geral — se o aviso sonoro estiver
  // desabilitado, nenhum apito toca, nem este.
  const idsPedidosAtualChave = pedidosAbastecimento.map((p) => p.id).sort().join(',')
  useEffect(() => {
    const idsAtuais = new Set(pedidosAbastecimento.map((p) => p.id))
    if (idsConhecidosPedidosRef.current === null || cargasCompletadasRef.current <= 1) {
      idsConhecidosPedidosRef.current = idsAtuais
      return
    }
    const novos = pedidosAbastecimento.some((p) => !idsConhecidosPedidosRef.current.has(p.id))
    if (novos && sonsAtivados && apitoCombustivelAtivado) {
      tocarApitoCombustivel()
    }
    idsConhecidosPedidosRef.current = idsAtuais
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsPedidosAtualChave, sonsAtivados, apitoCombustivelAtivado])

  return null
}
