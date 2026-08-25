import { useEffect, useRef, useState } from 'react'
import {
  IconAnchor, IconLogout, IconClipboardList, IconGasStation, IconTools, IconFileCertificate,
  IconUsers, IconTrash, IconArrowLeft, IconSettings, IconLifebuoy, IconReceipt2, IconLock, IconId,
  IconHistory,
} from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, db } from '../lib/supabase'
import {
  listarAgendamentosCliente, solicitarAgendamento, atualizarStatusAgendamento, atualizarStatusResgate, listarLaudosCliente, listarDespachosCliente,
  criarDespacho, criarOrdemServico, listarOrdensServicoCliente, listarCombustiveis, listarPedidosAbastecimentoCliente,
  solicitarAbastecimento, atualizarStatusAbastecimento, listarAutorizados, adicionarAutorizado, atualizarAutorizado, removerAutorizado, buscarMarina,
  salvarCliente, listarHorariosOcupados,
} from '../lib/db'
import { SERVICOS_DESPACHO, CATEGORIAS_SERVICOS } from '../lib/servicosDespacho'
import { labelStatusManutencao } from '../lib/statusManutencao'
import { labelStatusResgate } from '../lib/statusResgate'
import { ultimaMovimentacaoPorEmbarcacao } from '../lib/agendamentos'
import { STATUS_ABASTECIMENTO_LABEL, STATUS_ABASTECIMENTO_CANCELAVEIS } from '../lib/statusAbastecimento'
import { lerConfigRampa, horariosDisponiveis, paraHoraLocal, RAMPA_PADRAO } from '../lib/agendaRampa'
import { TEMA_PADRAO } from '../lib/tema'
import { exportarHistoricoSolicitacoesCsv } from '../lib/exportarPlanilha'

// Janela de visibilidade do Histórico de Solicitações (engrenagem →
// Histórico) — registra TODA solicitação do cliente (pendente, cancelada ou
// concluída), não só por 5 dias depois de sair do Diário de Bordo ativo —
// ver diarioAtivo/historicoSolicitacoes mais abaixo.
const HISTORICO_JANELA_MS = 5 * 24 * 60 * 60 * 1000

// QR "Pix copia e cola" de demonstração com o pagamento da marina (matrícula/
// acesso), no mesmo espírito do QR de abastecimento — sem valor fixo (quem
// paga digita o valor combinado com a administração). O pagamento real via
// Pix ainda não está conectado; a confirmação, por enquanto, é manual (a
// administração confirma na tela "Clientes").
const QR_PAGAMENTO_DEMO = '00020126DEMO-PIX-MARINA5204000053039865802BR5913MARINA-MANAGER6009DEMO-QR'

// Mensagens de status da Agenda (retirada/retorno), derivadas de
// pagamento_confirmado + acesso_suspenso + acesso_liberado_manual — os
// mesmos 3 campos que a policy "cliente_cria_agendamento" do banco usa pra
// travar/liberar de verdade, então a mensagem na tela nunca destoa do que o
// banco permite. acesso_liberado_manual é a liberação manual da
// administração (Painel de Controle → Clientes → "Liberar acesso sem
// confirmação de pagamento") — libera a Agenda sem mexer no status
// financeiro, então o pagamento continua "pendente" mesmo com liberado=true.
function statusAgendaCliente(cliente) {
  if (!cliente) return null
  if (cliente.acesso_suspenso) {
    return { texto: 'Acesso suspenso pela administração da marina.', classe: 'cancelado', liberado: false }
  }
  if (cliente.pagamento_confirmado) {
    return { texto: 'Pagamento confirmado. Agenda liberada.', classe: 'em-dia', liberado: true }
  }
  if (cliente.acesso_liberado_manual) {
    return { texto: 'Acesso liberado manualmente pela administração da marina.', classe: 'em-dia', liberado: true }
  }
  return { texto: 'Aguardando pagamento. A Agenda é liberada automaticamente assim que a marina confirma.', classe: 'pendente', liberado: false }
}

const PARENTESCOS = ['filho(a)', 'conjuge', 'socio', 'funcionario', 'outro']

// A biblioteca de ícones do projeto (@tabler/icons-react) não tem um timão
// de navio de verdade (só um volante de carro) nem um veleiro no estilo
// "silhueta com ondas" — por isso os dois abaixo são desenhados à mão, no
// mesmo espírito visual das referências que o cliente trouxe.
const ANGULOS_TIMAO = [0, 45, 90, 135, 180, 225, 270, 315]

function IconTimao({ size = 20, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" style={style}>
      {/* aro externo (donut, fill-rule evenodd) */}
      <path fillRule="evenodd" d="M50,10 a40,40 0 1,0 0.01,0 Z M50,17 a33,33 0 1,1 -0.01,0 Z" />
      {/* raios, do cubo até a face interna do aro */}
      {ANGULOS_TIMAO.map((a) => (
        <rect key={`sp-${a}`} x="47" y="17" width="6" height="25" rx="3" transform={`rotate(${a} 50 50)`} />
      ))}
      {/* alças pontudas, pra fora do aro */}
      {ANGULOS_TIMAO.map((a) => (
        <ellipse key={`h-${a}`} cx="50" cy="8" rx="4.5" ry="7" transform={`rotate(${a} 50 50)`} />
      ))}
      {/* cubo central com furo (donut) */}
      <path fillRule="evenodd" d="M50,42 a8,8 0 1,0 0.01,0 Z M50,47 a3,3 0 1,1 -0.01,0 Z" />
    </svg>
  )
}

function IconVeleiro({ size = 20, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" style={style}>
      <rect x="49" y="8" width="2" height="58" />
      <path d="M52,6 L52,64 L82,60 Z" />
      <path d="M48,18 C40,30 32,45 22,56 L48,64 Z" />
      <path d="M12,62 Q50,80 88,62 L84,68 Q50,84 16,68 Z" />
      <path d="M10,84 Q20,80 30,84 T50,84 T70,84 T90,84 L90,87 Q70,91 50,87 T10,87 Z" />
    </svg>
  )
}

// Tipos de ordem de serviço que o cliente pode pedir pelo botão "Manutenção"
// — os mesmos tipos que a equipe usa na tela de Manutenção internamente
// (marina.ordens_servico), exceto "combustivel", que agora é o botão
// separado "Abastecimento".
const TIPOS_MANUTENCAO = [
  { key: 'limpeza', label: 'Limpeza do casco' },
  { key: 'manutencao_motor', label: 'Manutenção de motor' },
  { key: 'jet_ski', label: 'Manutenção de jet ski' },
  { key: 'guincho', label: 'Guincho / reboque' },
  { key: 'pintura', label: 'Pintura' },
  { key: 'outro', label: 'Outro' },
]

const STATUS_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  agendado: 'Agendado',
  em_andamento: 'Em andamento',
  emitido: 'Emitido',
  cancelado: 'Cancelado',
  protocolado: 'Protocolado',
  em_analise: 'Em análise',
  exigencia: 'Exigência pendente',
  aprovado: 'Aprovado',
  indeferido: 'Indeferido',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  entregue: 'Entregue',
  // Status de ordens_servico (marina.ordens_servico) agora vem de
  // lib/statusManutencao (labelStatusManutencao), não daqui — era a única
  // origem que usava "aberta"/"concluida"/"cancelada" (grafia feminina).
}

// Nomes por extenso dos tipos de manobra, usados no Diário de Bordo — mesmo
// rótulo "Descida"/"Subida" já usado no Painel de Controle da equipe (ver
// TIPO_AGENDAMENTO_LABEL em TelaVagas.jsx). O valor interno de `tipo`
// continua 'retirada'/'retorno' (é o que fica gravado no banco); só o texto
// mostrado pro cliente mudou.
const TIPO_AGENDAMENTO_LABEL = { retirada: 'Descida', retorno: 'Subida' }

// Textos do S.O.S. por etapa do resgate (ver lib/statusResgate.js) — usados
// no botão de ação e no Diário de Bordo. 'cancelado' (o próprio cliente
// cancelou, ver cancelarResgateCliente abaixo) fica de fora de
// MENSAGEM_BOTAO_RESGATE de propósito: cai no texto padrão do botão
// ("S.O.S. · Solicitar resgate"), porque cancelar já libera o botão pra um
// novo pedido na hora — não precisa de um texto de transição como
// "solicitado"/"recebido" têm.
const DETALHE_STATUS_RESGATE = {
  solicitado: 'Pedido recebido - providenciando resgate',
  recebido: 'Equipe confirmou o recebimento do pedido, a caminho',
  recolhido: 'Atendimento concluído pela equipe',
  cancelado: 'Você cancelou o pedido, confirmando que está tudo bem',
}
const MENSAGEM_BOTAO_RESGATE = {
  solicitado: 'Pedido recebido - providenciando resgate',
  recebido: 'Pedido recebido, equipe a caminho',
}

// Enquanto o resgate estiver num destes status, o cliente ainda pode
// cancelá-lo direto pelo Diário de Bordo (ver cancelarResgateCliente e
// resgateParaCancelar abaixo) — uma vez "Recolhido" o atendimento já foi
// concluído pela equipe, não faz sentido cancelar.
const STATUS_RESGATE_CANCELAVEIS = ['solicitado', 'recebido']

// Agrupa os status de todas as origens (agendamentos, abastecimento,
// manutenção, despachos, laudos) em 3 cores só, pro Diário de Bordo não
// virar uma sopa de badges diferentes — mesmo padrão minimalista (texto
// colorido, sem bolinha/pill) já usado no resto do painel do cliente.
function classeStatusDiario(status) {
  if (['concluido', 'concluida', 'confirmado', 'pago', 'entregue', 'emitido', 'aprovado'].includes(status)) return 'em-dia'
  if (['cancelado', 'cancelada', 'indeferido'].includes(status)) return 'cancelado'
  return 'pendente'
}

// Rótulo/cor de um agendamento (retirada/retorno) no Diário de Bordo —
// à parte de classeStatusDiario acima (que continua servindo abastecimento/
// manutenção/despachos/laudos exatamente como antes), porque a Fila de
// Rampa agora tem um passo a mais (Solicitado → Recebido → status final) e
// os dois tipos terminam de um jeito diferente:
//   - Descida "Navegando" (status='concluido'): fica visível no Diário de
//     Bordo enquanto o barco ainda está na água — só some junto com a
//     subida correspondente, quando ela chegar em "Recolhido" (ver
//     ultimaPorEmbarcacao, mesma lógica de "quem está na água agora" já
//     usada no Painel de Controle e no indicador de S.O.S. desta tela —
//     lib/agendamentos.js).
//   - Subida "Recolhido" (status='concluido'): some do Diário de Bordo na
//     hora — mesmo comportamento de "concluído sai da tela" de sempre.
//   - "Recebido" (status='confirmado', tanto descida quanto subida): agora
//     fica visível como "Solicitação confirmada" — antes 'confirmado' fazia
//     parte da lista "em-dia" de classeStatusDiario (por isso não usamos
//     ela aqui), pensada pra outros status (ex: abastecimento) que não têm
//     esse passo intermediário.
//   - Subida "Navegando" (status='navegando', valor novo sem constraint no
//     banco, ver STATUS_FILA_OPCOES em TelaVagas.jsx): a embarcação já está
//     a caminho de volta, mas o retorno ainda não foi confirmado — fica
//     visível igual ao "Navegando" da descida (não é um status "em-dia" de
//     classeStatusDiario, então cai certo no branco padrão ali embaixo; só
//     precisa do rótulo certo aqui, já que STATUS_LABEL não tem essa chave).
function statusAgendamentoDiario(a, ultimaPorEmbarcacao) {
  if (a.status === 'confirmado') {
    return { statusLabel: 'Solicitação confirmada', statusClasse: 'pendente' }
  }
  if (a.status === 'navegando' && a.tipo === 'retorno') {
    return { statusLabel: 'Navegando', statusClasse: 'pendente' }
  }
  if (a.status === 'concluido' && a.tipo === 'retirada') {
    const aindaNaAgua = ultimaPorEmbarcacao[a.embarcacao_id]?.id === a.id
    return { statusLabel: 'Navegando', statusClasse: aindaNaAgua ? 'pendente' : 'em-dia' }
  }
  if (a.status === 'concluido' && a.tipo === 'retorno') {
    // Some do Diário de Bordo ativo na hora (classeStatusDiario('concluido')
    // = 'em-dia', mesma regra de sempre) — o rótulo "Recolhido" só chega a
    // aparecer no Histórico de Solicitações da engrenagem (onde o item
    // continua visível/exportável por até 5 dias, nunca apagado do banco).
    return { statusLabel: 'Recolhido', statusClasse: classeStatusDiario(a.status) }
  }
  return { statusLabel: STATUS_LABEL[a.status] || a.status, statusClasse: classeStatusDiario(a.status) }
}

// Rótulo/cor de um pedido de abastecimento no Diário de Bordo — mesmo
// espírito de statusAgendamentoDiario acima: a maioria dos status já cai
// certo em STATUS_LABEL/classeStatusDiario, só os dois valores novos do
// fluxo simplificado (ver <select> em TelaAbastecimento.jsx) precisam de
// tratamento especial:
//   - 'aguardando_pagamento': a marina já confirmou o pedido, só falta o
//     cliente pagar — mostra os dois estados juntos ("Confirmado —
//     Aguardando pagamento"), como pedido pelo administrador.
//   - 'indisponivel': a marina não tem esse combustível disponível agora —
//     mesmo tom visual ("cancelado", cinza) de uma solicitação que não vai
//     seguir adiante, com o texto certo.
// 'pago'/'entregue' nunca chegam aqui: uma vez que o pagamento é
// confirmado, o pedido já sai do Diário de Bordo (ver filtro em
// diarioDeBordo abaixo), do mesmo jeito que já sai da tela do administrador.
function statusAbastecimentoDiario(p) {
  if (p.status === 'aguardando_pagamento') return { statusLabel: 'Confirmado — Aguardando pagamento', statusClasse: 'pendente' }
  if (p.status === 'indisponivel') return { statusLabel: 'Indisponível', statusClasse: 'cancelado' }
  return { statusLabel: STATUS_ABASTECIMENTO_LABEL[p.status] || p.status, statusClasse: classeStatusDiario(p.status) }
}

// Menu de engrenagem no cabeçalho do cliente, do lado do "Sair" — reúne as
// configurações da conta ("Pessoas autorizadas", "Meus dados" e "Histórico
// de solicitações"). Mesmo padrão visual do menu de ações do Painel de
// Controle da equipe (classes .menu-acoes* já existentes). "Minhas
// cobranças" saiu daqui (removida a pedido) — "Meus dados" entrou no
// lugar, editável, sempre sincronizado com o banco (tabela clientes).
function MenuConfigCliente({ autorizadosCount, onAbrirAutorizados, onAbrirMeusDados, onAbrirHistorico }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  function executar(acao) {
    acao()
    setAberto(false)
  }

  return (
    <div className="menu-acoes" ref={ref}>
      <button type="button" className="menu-acoes-botao" onClick={() => setAberto(!aberto)} title="Configurações">
        <IconSettings size={18} />
      </button>
      {aberto && (
        <div className="menu-acoes-dropdown">
          <button type="button" onClick={() => executar(onAbrirAutorizados)}>
            <IconUsers size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Pessoas autorizadas ({autorizadosCount})
          </button>
          <button type="button" onClick={() => executar(onAbrirMeusDados)}>
            <IconId size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Meus dados
          </button>
          <button type="button" onClick={() => executar(onAbrirHistorico)}>
            <IconHistory size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Histórico de solicitações
          </button>
        </div>
      )}
    </div>
  )
}

export default function TelaClienteDashboard({ perfil }) {
  const [cliente, setCliente] = useState(null)
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [ordensServico, setOrdensServico] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [abastecimentos, setAbastecimentos] = useState([])
  const [autorizados, setAutorizados] = useState([])
  const [modalAutorizadosAberto, setModalAutorizadosAberto] = useState(false)
  const [modalDadosAberto, setModalDadosAberto] = useState(false)
  const [formDados, setFormDados] = useState(null)
  const [salvandoDados, setSalvandoDados] = useState(false)
  const [modalHistoricoAberto, setModalHistoricoAberto] = useState(false)
  const [formAutorizado, setFormAutorizado] = useState({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
  const [salvandoAutorizado, setSalvandoAutorizado] = useState(false)
  const [modalTipo, setModalTipo] = useState(null) // 'retirada' | 'retorno' | null
  // `data` (dia) + `hora` (um dos horários de horariosDisponiveis pra esse
  // dia) substituem o antigo campo livre `data_hora`: o cliente não digita
  // mais um horário qualquer, só escolhe entre os que a Agenda da rampa
  // libera (ver configRampa abaixo) — é o que garante o intervalo fixo de
  // 15min (configurável) e que nenhum horário indisponível seja aceito.
  const [formAgendamento, setFormAgendamento] = useState({ embarcacao_id: '', data: '', hora: '', observacoes: '' })
  const [enviandoAgendamento, setEnviandoAgendamento] = useState(false)
  // Agenda da rampa (horário de funcionamento, intervalo, manutenções e
  // mensagens) — configurada pelo administrador em Painel de Controle →
  // Configurações → Agenda (ver ConfiguracoesPainel.jsx) e lida aqui em
  // tempo real (assinatura Realtime logo abaixo), pra nunca ficar
  // desatualizada quando a marina muda alguma coisa.
  const [configRampa, setConfigRampa] = useState(RAMPA_PADRAO)
  // Fica false até a Agenda da rampa real da marina ser carregada pela
  // primeira vez — enquanto isso, `configRampa` ainda está no valor padrão
  // (RAMPA_PADRAO), que pode não bater com o que a marina configurou de
  // verdade (horário, intervalo, manutenções). Os botões "Descida"/"Subida"
  // ficam desabilitados até virar true, pra nunca oferecer um horário com
  // base no padrão genérico em vez da configuração real (ver abrirModal).
  const [configRampaCarregada, setConfigRampaCarregada] = useState(false)
  // Linha crua de marina.marinas (config_json) — hoje só usada pra ler
  // diarioBordoLimpoEm (ver diarioAtivo abaixo); configRampa continua sendo
  // derivado à parte por lerConfigRampa, não duplica leitura nenhuma.
  const [marina, setMarina] = useState(null)
  // Horários (strings "HH:mm") já ocupados por outro agendamento na data
  // escolhida no formulário de Descida/Subida — buscados de novo (ver
  // useEffect logo abaixo do formAgendamento) toda vez que a data muda, pra
  // manter horariosDisponiveis() sempre sincronizado com o que já foi
  // agendado, sem depender de recarregar a página inteira.
  const [horariosOcupados, setHorariosOcupados] = useState([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [modalServicosAberto, setModalServicosAberto] = useState(false)
  // Dentro do modal "Serviços": qual dos 3 tipos o cliente escolheu (null =
  // ainda no seletor inicial), e, se for "regularizacao", qual categoria da
  // Capitania dos Portos está sendo explorada (null = ainda na lista curta
  // de categorias, sem descrições longas).
  const [modoServicos, setModoServicos] = useState(null) // null | 'manutencao' | 'regularizacao'
  const [categoriaAtiva, setCategoriaAtiva] = useState(null)
  const [servicoAtivo, setServicoAtivo] = useState(null) // item do catálogo de regularização selecionado
  const [formServico, setFormServico] = useState({ embarcacao_id: '', observacoes: '' })
  const [enviandoServico, setEnviandoServico] = useState(false)
  const [formManutencao, setFormManutencao] = useState({ embarcacao_id: '', tipo_servico: 'limpeza', descricao: '' })
  const [enviandoManutencao, setEnviandoManutencao] = useState(false)
  const [modalAbastecimentoAberto, setModalAbastecimentoAberto] = useState(false)
  const [formAbastecimento, setFormAbastecimento] = useState({ embarcacao_id: '', combustivel_id: '', quantidade_litros: '' })
  const [enviandoAbastecimento, setEnviandoAbastecimento] = useState(false)
  const [pedidoGerado, setPedidoGerado] = useState(null) // pedido recém-criado, para mostrar o QR
  const [modalPagamentosAberto, setModalPagamentosAberto] = useState(false)
  const [enviandoResgate, setEnviandoResgate] = useState(false)

  const [erroCarregamento, setErroCarregamento] = useState(null)

  async function carregar() {
    try {
      const { data: cli, error: erroCli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
      if (erroCli) throw erroCli
      setCliente(cli)
      setErroCarregamento(null)
      if (!cli) return
      const { data: emb, error: erroEmb } = await db.from('embarcacoes').select('*').eq('cliente_id', cli.id)
      if (erroEmb) throw erroEmb
      setEmbarcacoes(emb || [])
      // As buscas abaixo não dependem umas das outras — rodar em paralelo
      // (em vez de um await atrás do outro, como antes) deixa o
      // carregamento bem mais rápido e, principalmente, encurta ao máximo a
      // janela em que `cliente` já está definido (botões "Descida"/"Subida"
      // liberados) mas `configRampa` ainda não chegou — é essa janela que o
      // `configRampaCarregada` abaixo fecha de vez, mas menos tempo nela é
      // sempre melhor.
      // Nomes com sufixo "Carregado(s)" de propósito, pra não sombrear os
      // states de mesmo nome (agendamentos, laudos, etc.) declarados lá em
      // cima — evita confusão em quem for mexer aqui depois.
      const [agendamentosCarregados, laudosCarregados, despachosCarregados, ordensServicoCarregadas, combustiveisCarregados, abastecimentosCarregados, autorizadosCarregados, marinaCarregada] = await Promise.all([
        listarAgendamentosCliente(cli.id),
        listarLaudosCliente(cli.id),
        listarDespachosCliente(cli.id),
        listarOrdensServicoCliente(cli.id),
        listarCombustiveis(cli.marina_id),
        listarPedidosAbastecimentoCliente(cli.id),
        listarAutorizados(cli.id),
        buscarMarina(cli.marina_id),
      ])
      setAgendamentos(agendamentosCarregados)
      setLaudos(laudosCarregados)
      setDespachos(despachosCarregados)
      setOrdensServico(ordensServicoCarregadas)
      setCombustiveis(combustiveisCarregados.filter((c) => c.ativo))
      setAbastecimentos(abastecimentosCarregados)
      setAutorizados(autorizadosCarregados)
      setConfigRampa(lerConfigRampa(marinaCarregada))
      setConfigRampaCarregada(true)
      setMarina(marinaCarregada)
    } catch (err) {
      // Não derruba a tela — mantém o que já estava carregado e avisa, pra
      // dar pra tentar de novo (ex: recarregando a página) em vez de ficar
      // com um painel em branco sem explicação.
      setErroCarregamento(err.message)
    }
  }

  useEffect(() => { carregar() }, [perfil])

  // Atualização automática em tempo real: sempre que a administração mudar
  // o status de um agendamento, ordem de serviço, despacho, laudo, pedido de
  // abastecimento, os próprios dados cadastrais do cliente (ver "Meus
  // dados"), ou liberar/suspender o acesso, o Supabase Realtime avisa este
  // canal na hora — sem precisar de F5. carregar() já busca tudo de novo
  // (cliente, agendamentos, laudos, despachos, ordens de serviço,
  // abastecimentos), então o Painel, a Agenda, o Diário de Bordo e "Meus
  // dados" ficam sincronizados juntos, sempre
  // com os mesmos rótulos/cores já usados em cada status (STATUS_LABEL,
  // labelStatusManutencao, labelStatusResgate, classeStatusDiario) — nada
  // disso muda aqui, só passa a atualizar sozinho. O polling a cada 30s
  // continua como reserva, só pro caso raro do canal cair (troca de rede,
  // app em segundo plano); falha silenciosa aqui é aceitável, o dado só
  // fica um pouco desatualizado até a próxima tentativa.
  useEffect(() => {
    if (!cliente) return
    const idCliente = cliente.id
    const canal = supabase
      .channel(`cliente-${idCliente}-status`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'agendamentos', filter: `cliente_id=eq.${idCliente}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'ordens_servico', filter: `cliente_id=eq.${idCliente}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'despachos', filter: `cliente_id=eq.${idCliente}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'laudos', filter: `cliente_id=eq.${idCliente}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'pedidos_abastecimento', filter: `cliente_id=eq.${idCliente}` }, () => carregar())
      .on('postgres_changes', { event: 'UPDATE', schema: 'marina', table: 'clientes', filter: `id=eq.${idCliente}` }, () => carregar())
      // Agenda da rampa alterada pela administração (horário, intervalo,
      // manutenções, mensagens) — reflete aqui na hora, sem F5.
      .on('postgres_changes', { event: 'UPDATE', schema: 'marina', table: 'marinas', filter: `id=eq.${cliente.marina_id}` }, () => carregar())
      .subscribe()

    const intervalo = setInterval(() => { carregar() }, 30000)

    return () => {
      supabase.removeChannel(canal)
      clearInterval(intervalo)
    }
  }, [cliente?.id])

  // Busca de novo os horários já ocupados toda vez que a data escolhida no
  // formulário de Descida/Subida muda — é isso que faz o seletor de horário
  // (abaixo) atualizar imediatamente com a data, nunca oferecendo um
  // horário que outro cliente já tomou. Só roda com o modal aberto e uma
  // data preenchida; ao trocar de data, `hora` já é limpo no onChange do
  // campo de data, então nunca fica um horário antigo selecionado por
  // engano enquanto a lista nova ainda está chegando.
  useEffect(() => {
    if (!modalTipo || !formAgendamento.data || !cliente) {
      setHorariosOcupados([])
      return
    }
    let cancelado = false
    setCarregandoHorarios(true)
    listarHorariosOcupados(cliente.marina_id, formAgendamento.data)
      .then((ocupados) => {
        if (!cancelado) setHorariosOcupados(ocupados.map(paraHoraLocal))
      })
      .catch(() => {
        // Falha ao buscar (rede, etc.) — mantém a lista vazia, pra não
        // travar o formulário; a checagem final no envio (enviarAgendamento)
        // e a trava no próprio banco continuam de pé como última barreira.
        if (!cancelado) setHorariosOcupados([])
      })
      .finally(() => {
        if (!cancelado) setCarregandoHorarios(false)
      })
    return () => { cancelado = true }
  }, [modalTipo, formAgendamento.data, cliente])

  function abrirModal(tipo) {
    // Guarda de segurança: os botões já ficam desabilitados quando o acesso
    // não está liberado, mas a checagem que realmente vale é a policy do
    // banco (agendamentos só aceita INSERT com pagamento confirmado e sem
    // suspensão) — isto aqui só evita abrir o formulário à toa.
    const statusAgenda = statusAgendaCliente(cliente)
    if (!statusAgenda?.liberado) {
      alert(statusAgenda?.texto || 'Aguardando pagamento. Fale com a administração da marina.')
      return
    }
    // Mesma ideia pra Agenda da rampa: o botão já fica desabilitado
    // enquanto ainda não carregou a configuração real da marina, mas essa
    // checagem aqui garante que o formulário nunca abre com o horário
    // padrão genérico (RAMPA_PADRAO) em vez do que a marina configurou de
    // verdade — ver configRampaCarregada.
    if (!configRampaCarregada) {
      alert('Carregando os horários da rampa. Tente novamente em instantes.')
      return
    }
    setFormAgendamento({ embarcacao_id: embarcacoes[0]?.id || '', data: '', hora: '', observacoes: '', autorizado_id: '', previsao_retorno: '' })
    setModalTipo(tipo)
  }

  async function enviarAgendamento(e) {
    e.preventDefault()
    if (!cliente) return
    // Segurança extra além do seletor já só oferecer horários válidos: se
    // por algum motivo o horário escolhido deixou de estar disponível entre
    // abrir o formulário e enviar (ex: administração cadastrou uma
    // manutenção nesse meio-tempo, ou outro cliente acabou de pegar esse
    // mesmo horário), busca os ocupados uma última vez, na hora, e barra
    // aqui também — além da trava que já existe no próprio banco
    // (marina.verifica_horario_livre, ver migration_horarios_ocupados_agenda.sql)
    // pra quando nem isso for suficiente (corrida entre dois envios quase
    // simultâneos).
    let ocupadosNaHora = horariosOcupados
    try {
      ocupadosNaHora = (await listarHorariosOcupados(cliente.marina_id, formAgendamento.data)).map(paraHoraLocal)
    } catch {
      // Sem conexão pra reconferir — segue com o que já estava carregado;
      // a trava do banco continua de pé como última barreira.
    }
    if (!horariosDisponiveis(configRampa, formAgendamento.data, ocupadosNaHora).includes(formAgendamento.hora)) {
      alert(`Esse horário não está mais disponível. ${configRampa.mensagemIndisponibilidade}`)
      setHorariosOcupados(ocupadosNaHora)
      return
    }
    setEnviandoAgendamento(true)
    try {
      await solicitarAgendamento({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formAgendamento.embarcacao_id || null,
        tipo: modalTipo,
        // Convertido pra um instante UTC explícito (.toISOString()) antes de
        // mandar pro banco — ver correção "sincronização de horários" abaixo.
        // Enviar a string "AAAA-MM-DDTHH:mm" pura (sem fuso) fazia o Postgres
        // (timezone da sessão = UTC, `SHOW timezone`) gravar esse horário
        // como se já fosse UTC, quando na verdade era o horário LOCAL do
        // navegador do cliente — quem morasse num fuso diferente de UTC via
        // um horário errado em tudo que lê data_hora depois (Fila de Rampa,
        // Navegando, Diário de Bordo, Histórico de manobras, exportações).
        // `new Date(...)` interpreta a string sem fuso como hora local do
        // navegador (comportamento padrão do JS) — `.toISOString()` converte
        // esse mesmo instante pra UTC de forma correta, então quem ler de
        // volta (sempre via `new Date(iso).toLocaleString(...)`, já usado em
        // todo o sistema) volta a ver exatamente o horário que o cliente
        // escolheu aqui, não importa o fuso do servidor.
        data_hora: new Date(`${formAgendamento.data}T${formAgendamento.hora}`).toISOString(),
        observacoes: formAgendamento.observacoes || null,
        autorizado_id: formAgendamento.autorizado_id || null,
        // Só faz sentido prever retorno numa descida — é o que o Painel de
        // Controle usa pra avisar quando a embarcação está demorando. Mesma
        // correção de fuso do data_hora acima — o <input type="datetime-local">
        // também devolve uma string sem fuso.
        previsao_retorno: modalTipo === 'retirada' && formAgendamento.previsao_retorno
          ? new Date(formAgendamento.previsao_retorno).toISOString()
          : null,
      })
      setModalTipo(null)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoAgendamento(false)
    }
  }

  // Cancelar uma descida/subida direto pelo Diário de Bordo — só aparece
  // enquanto o pedido ainda está "Solicitado"/"Recebido" (ver cancelavel em
  // diarioDeBordo abaixo); uma vez em "Navegando" o cancelamento passa a ser
  // uma decisão operacional da marina, não mais do cliente. Confirma antes
  // de agir (ação sem volta fácil). atualizarStatusAgendamento já é a mesma
  // função usada pelo Painel de Controle (Fila de Rampa/Navegando) — o
  // status 'cancelado' propaga sozinho pra lá via Realtime, some da Fila de
  // Rampa (statusLinha/linhasFila já excluem cancelado) e libera o horário
  // na Agenda (marina.horarios_ocupados já ignora status='cancelado').
  async function cancelarAgendamentoCliente(a) {
    const tipoLabel = TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo
    const quando = new Date(a.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    if (!confirm(`Cancelar a solicitação de ${tipoLabel.toLowerCase()} de ${quando}${a.embarcacoes?.nome ? ` (${a.embarcacoes.nome})` : ''}?`)) return
    try {
      await atualizarStatusAgendamento(a.id, 'cancelado')
      await carregar()
    } catch (err) {
      alert('Não foi possível cancelar: ' + err.message)
    }
  }

  // Cancelar um pedido de abastecimento direto pelo Diário de Bordo — só
  // aparece enquanto o pedido ainda está "Aguardando pagamento" ou
  // "Indisponível" (ver abastecimentoParaCancelar em diarioDeBordo abaixo);
  // uma vez "Pagamento efetuado" o pedido já não aparece mais aqui (filtrado
  // antes de entrar no Diário de Bordo). Mesmo padrão de confirmação de
  // cancelarAgendamentoCliente acima. atualizarStatusAbastecimento é a
  // mesma função usada pelo Painel de Controle (TelaAbastecimento.jsx) — o
  // status 'cancelado' propaga pra lá via Realtime (ver assinatura de
  // pedidos_abastecimento logo abaixo, no useEffect de carregamento).
  async function cancelarAbastecimentoCliente(p) {
    if (!confirm(`Cancelar o pedido de abastecimento de ${p.combustiveis?.nome || 'combustível'}${p.embarcacoes?.nome ? ` (${p.embarcacoes.nome})` : ''}?`)) return
    try {
      await atualizarStatusAbastecimento(p.id, 'cancelado')
      await carregar()
    } catch (err) {
      alert('Não foi possível cancelar: ' + err.message)
    }
  }

  function abrirModalAutorizados() {
    setFormAutorizado({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
    setModalAutorizadosAberto(true)
  }

  // "Meus dados" agora é editável (era só leitura) — o cliente pode
  // corrigir o próprio cadastro. Pré-preenche o form com o que já está no
  // banco (cliente, sempre atualizado via carregar()); campos
  // administrativos/financeiros (pagamento, acesso, marina_id etc.) não
  // entram aqui — nem dá pra mudá-los por essa tela: RLS + trigger
  // "protege_campos_admin_clientes" no banco barram/ignoram qualquer
  // tentativa (ver migration_cliente_edita_proprios_dados.sql).
  function abrirModalDados() {
    setFormDados({
      nome: cliente.nome || '',
      cpf_cnpj: cliente.cpf_cnpj || '',
      documento_identidade: cliente.documento_identidade || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      endereco: cliente.endereco || '',
      numero_casa: cliente.numero_casa || '',
      complemento: cliente.complemento || '',
    })
    setModalDadosAberto(true)
  }

  async function enviarMeusDados(e) {
    e.preventDefault()
    if (!cliente) return
    setSalvandoDados(true)
    try {
      await salvarCliente({ id: cliente.id, ...formDados })
      setModalDadosAberto(false)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setSalvandoDados(false)
    }
  }

  async function enviarNovoAutorizado(e) {
    e.preventDefault()
    if (!cliente) return
    setSalvandoAutorizado(true)
    try {
      await adicionarAutorizado({ marina_id: cliente.marina_id, cliente_id: cliente.id, ...formAutorizado })
      setFormAutorizado({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setSalvandoAutorizado(false)
    }
  }

  async function alternarAutorizado(autorizado) {
    try {
      await atualizarAutorizado(autorizado.id, { ativo: !autorizado.ativo })
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar essa pessoa autorizada: ' + err.message)
    }
  }

  async function excluirAutorizado(id) {
    if (!confirm('Remover esta pessoa autorizada?')) return
    try {
      await removerAutorizado(id)
      await carregar()
    } catch (err) {
      alert('Não foi possível remover essa pessoa autorizada: ' + err.message)
    }
  }

  function abrirModalServicos() {
    setModoServicos(null)
    setCategoriaAtiva(null)
    setServicoAtivo(null)
    setModalServicosAberto(true)
  }

  // "Voltar" dentro do modal Serviços: sempre um passo de cada vez —
  // do formulário de um serviço específico volta pra lista da categoria,
  // da lista de categorias volta pro seletor Abastecimento/Manutenção/
  // Regularização.
  function voltarServicos() {
    if (servicoAtivo) { setServicoAtivo(null); return }
    if (categoriaAtiva) { setCategoriaAtiva(null); return }
    setModoServicos(null)
  }

  function selecionarCategoria(categoria) {
    setCategoriaAtiva(categoria)
  }

  function selecionarServico(servico) {
    setServicoAtivo(servico)
    setFormServico({ embarcacao_id: embarcacoes[0]?.id || '', observacoes: '' })
  }

  async function enviarSolicitacaoServico(e) {
    e.preventDefault()
    if (!cliente || !servicoAtivo) return
    setEnviandoServico(true)
    try {
      await criarDespacho({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formServico.embarcacao_id || null,
        tipo: servicoAtivo.key,
        observacoes: formServico.observacoes
          ? `${servicoAtivo.titulo} · ${formServico.observacoes}`
          : servicoAtivo.titulo,
      })
      setModalServicosAberto(false)
      setServicoAtivo(null)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoServico(false)
    }
  }

  async function enviarSolicitacaoManutencao(e) {
    e.preventDefault()
    if (!cliente) return
    setEnviandoManutencao(true)
    try {
      await criarOrdemServico({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formManutencao.embarcacao_id,
        tipo_servico: formManutencao.tipo_servico,
        descricao: formManutencao.descricao || null,
      })
      setModalServicosAberto(false)
      setFormManutencao({ embarcacao_id: '', tipo_servico: 'limpeza', descricao: '' })
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoManutencao(false)
    }
  }

  // Embarcação do cliente que está navegando agora — mesma lógica do Painel
  // de Controle da marina (a manobra concluída mais recente de cada
  // embarcação): se a última foi uma retirada, o barco ainda está na água.
  // É essa linha que o botão S.O.S. atualiza com resgate_status = 'solicitado'.
  const agendamentoNavegando = Object.values(ultimaMovimentacaoPorEmbarcacao(agendamentos)).find((a) => a.tipo === 'retirada') || null

  async function solicitarResgate() {
    if (!agendamentoNavegando || enviandoResgate) return
    if (!confirm('Confirma que deseja solicitar resgate para sua embarcação? A equipe da marina será avisada imediatamente no Painel de Controle.')) return
    setEnviandoResgate(true)
    try {
      await atualizarStatusResgate(agendamentoNavegando.id, 'solicitado')
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoResgate(false)
    }
  }

  // Cancelar o próprio pedido de S.O.S. direto pelo Diário de Bordo — só
  // enquanto ainda estiver "Solicitado" ou "Recebido" (ver
  // STATUS_RESGATE_CANCELAVEIS/resgateParaCancelar abaixo); uma vez
  // "Recolhido" o atendimento já terminou. Confirma antes de agir, mesmo
  // padrão de cancelarAgendamentoCliente/cancelarAbastecimentoCliente
  // acima. atualizarStatusResgate('cancelado') já propaga sozinho pro
  // Painel de Controle (TelaVagas.jsx assina agendamentos via Realtime): lá
  // toca o alarme de cancelamento (4 apitos) e mostra "Estou bem" por
  // alguns minutos antes de voltar sozinho pro Navegando — ver
  // lib/statusResgate.js (estouBemAtivo) e lib/sons.js
  // (tocarAlarmeCancelamentoSos).
  async function cancelarResgateCliente() {
    if (!agendamentoNavegando || !STATUS_RESGATE_CANCELAVEIS.includes(agendamentoNavegando.resgate_status)) return
    if (!confirm('Confirma que está tudo bem e deseja cancelar o pedido de S.O.S.? A equipe da marina será avisada imediatamente.')) return
    try {
      await atualizarStatusResgate(agendamentoNavegando.id, 'cancelado')
      await carregar()
    } catch (err) {
      alert('Não foi possível cancelar: ' + err.message)
    }
  }

  // Diário de Bordo: junta retiradas/retornos, abastecimentos, manutenção,
  // regularização, laudos e o S.O.S. (quando ativo) numa única linha do
  // tempo, mais recente primeiro. Cada origem tem seu próprio campo de
  // data — não existe uma coluna "created_at" em comum entre todas as
  // tabelas, por isso cada map já resolve pro melhor campo disponível.
  // "Quem está na água agora" — mesma lógica de ultimaMovimentacaoPorEmbarcacao
  // já usada em agendamentoNavegando (S.O.S.) acima, aqui pra decidir se uma
  // Descida "Navegando" (status='concluido') deve continuar visível no
  // Diário de Bordo ou se já pode sumir (a subida correspondente já chegou
  // em "Recolhido") — ver statusAgendamentoDiario.
  const ultimaPorEmbarcacao = ultimaMovimentacaoPorEmbarcacao(agendamentos)
  const diarioDeBordo = [
    ...agendamentos.map((a) => ({
      id: `ag-${a.id}`,
      icone: a.tipo === 'retirada' ? IconTimao : IconAnchor,
      titulo: `${TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}${a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}`,
      detalhe: new Date(a.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      ...statusAgendamentoDiario(a, ultimaPorEmbarcacao),
      quando: a.data_hora,
      // Só dá pra cancelar enquanto o pedido ainda não saiu do papel
      // ("Solicitado"/"Recebido") — uma vez "Navegando" em diante, virou uma
      // manobra em andamento, e cancelar passa a ser decisão da marina pelo
      // Painel de Controle, não mais um botão aqui. Ver cancelarAgendamentoCliente.
      agendamentoParaCancelar: (a.status === 'solicitado' || a.status === 'confirmado') ? a : null,
    })),
    // TODO pedido entra aqui, mesmo já 'pago'/'entregue' (entregue é valor
    // legado) — é o que garante que "Pagamento efetuado" continue visível no
    // Histórico de Solicitações da engrenagem depois de sumir do Diário de
    // Bordo ativo e da própria tela do administrador (ver diarioAtivo/
    // historicoSolicitacoes abaixo e pedidosVisiveis em TelaAbastecimento.jsx).
    ...abastecimentos.map((p) => ({
      id: `ab-${p.id}`,
      icone: IconGasStation,
      titulo: `Abastecimento · ${p.combustiveis?.nome || ''}${p.embarcacoes?.nome ? ` · ${p.embarcacoes.nome}` : ''}`,
      detalhe: `${Number(p.quantidade_litros).toFixed(2)} L · R$ ${Number(p.valor_total).toFixed(2)}`,
      ...statusAbastecimentoDiario(p),
      quando: p.created_at,
      // Só dá pra cancelar enquanto o pedido ainda está "Aguardando
      // pagamento" ou "Indisponível" — ver cancelarAbastecimentoCliente.
      abastecimentoParaCancelar: STATUS_ABASTECIMENTO_CANCELAVEIS.includes(p.status) ? p : null,
    })),
    ...ordensServico.map((os) => ({
      id: `os-${os.id}`,
      icone: IconTools,
      titulo: `Manutenção · ${TIPOS_MANUTENCAO.find((t) => t.key === os.tipo_servico)?.label || os.tipo_servico}${os.embarcacoes?.nome ? ` · ${os.embarcacoes.nome}` : ''}`,
      detalhe: os.descricao || '',
      // Rótulo vem da mesma fonte usada na tela Manutenção da equipe e na
      // planilha exportada (lib/statusManutencao), pra manter o texto do
      // status igual em todo lugar que mostra manutenção.
      statusLabel: labelStatusManutencao(os.status),
      statusClasse: classeStatusDiario(os.status),
      quando: os.data_abertura,
    })),
    ...despachos.map((d) => ({
      id: `de-${d.id}`,
      icone: IconFileCertificate,
      titulo: `Regularização · ${d.tipo?.replace(/_/g, ' ') || ''}${d.embarcacoes?.nome ? ` · ${d.embarcacoes.nome}` : ''}`,
      detalhe: `${d.orgao || ''}${d.numero_protocolo ? ` · Protocolo ${d.numero_protocolo}` : ''}`,
      statusLabel: STATUS_LABEL[d.status] || d.status,
      statusClasse: classeStatusDiario(d.status),
      quando: d.created_at,
    })),
    ...laudos.map((l) => ({
      id: `la-${l.id}`,
      icone: IconFileCertificate,
      titulo: `Laudo técnico · ${l.tipo}${l.embarcacoes?.nome ? ` · ${l.embarcacoes.nome}` : ''}`,
      detalhe: l.finalidade || '',
      statusLabel: STATUS_LABEL[l.status] || l.status,
      statusClasse: classeStatusDiario(l.status),
      quando: l.data_solicitacao,
    })),
    // S.O.S.: só mostra o estado ATUAL (não existe histórico com data/hora
    // de pedidos de resgate anteriores — resgate_status é um campo só na
    // própria linha do agendamento em navegação). Continua em vermelho
    // ("sos") em "Solicitação de resgate" e "Pedido recebido"; vira verde
    // ("em-dia") quando a equipe marca "Recolhido" ou quando o próprio
    // cliente cancela (confirmando "Estou bem" — ver cancelarResgateCliente).
    ...(agendamentoNavegando?.resgate_status
      ? [{
          id: `sos-${agendamentoNavegando.id}`,
          icone: IconLifebuoy,
          titulo: `S.O.S. · ${agendamentoNavegando.embarcacoes?.nome || 'embarcação'}`,
          detalhe: DETALHE_STATUS_RESGATE[agendamentoNavegando.resgate_status] || '',
          statusLabel: labelStatusResgate(agendamentoNavegando.resgate_status),
          statusClasse: ['recolhido', 'cancelado'].includes(agendamentoNavegando.resgate_status) ? 'em-dia' : 'sos',
          quando: agendamentoNavegando.data_hora,
          // Só dá pra cancelar enquanto ainda está "Solicitado" ou
          // "Recebido" — ver cancelarResgateCliente.
          resgateParaCancelar: STATUS_RESGATE_CANCELAVEIS.includes(agendamentoNavegando.resgate_status) ? agendamentoNavegando : null,
        }]
      : []),
  ].sort((a, b) => new Date(b.quando) - new Date(a.quando))

  // Uma vez concluída/paga/aprovada (mesma classeStatusDiario 'em-dia' que
  // já colore o badge de verde), a solicitação sai do Diário de Bordo ativo
  // — continua visível, sem limite de tempo aqui, no Histórico de
  // Solicitações da engrenagem (abaixo), junto com TODA solicitação já
  // feita (pendente, cancelada ou concluída) — ver historicoSolicitacoes.
  // Nada é apagado do banco — só sai desta lista aqui.
  //
  // diarioBordoLimpoEm (marina.marinas.config_json): carimbo opcional de uma
  // limpeza geral da tela, gravado direto no banco (não tem UI própria hoje
  // — é uma ação pontual da administração). Qualquer item, mesmo em aberto,
  // com "quando" igual ou anterior a esse carimbo some do Diário de Bordo
  // ativo — só isso, mesmo espírito do filtro acima: nada é apagado do
  // banco, o item só some da tela (o Histórico de Solicitações abaixo não é
  // afetado por essa limpeza — continua mostrando tudo normalmente). Uma
  // solicitação nova, criada depois do carimbo, aparece normalmente. Chega
  // em tempo real (Realtime já assina marina.marinas mais abaixo), sem
  // precisar de F5.
  const limpoEm = marina?.config_json?.diarioBordoLimpoEm ? new Date(marina.config_json.diarioBordoLimpoEm) : null
  const diarioAtivo = diarioDeBordo.filter((item) =>
    item.statusClasse !== 'em-dia' && (!limpoEm || new Date(item.quando) > limpoEm)
  )
  const agora = Date.now()
  // Histórico de Solicitações: registro de TODA solicitação já feita pelo
  // cliente — descida/subida, combustível, S.O.S., manutenção, regularização,
  // laudos, cancelamentos e afins — não só as concluídas com sucesso, ao
  // contrário de antes (o filtro por statusClasse === 'em-dia' foi removido
  // de propósito). Cada uma aparece com o status ATUAL (Aguardando
  // pagamento/Indisponível/Pagamento efetuado/Cancelado/etc — mesmos dados
  // já usados no Diário de Bordo ativo acima), atualizado em tempo real
  // junto com o resto da tela. Só a janela de 5 dias (HISTORICO_JANELA_MS)
  // continua limitando o que aparece aqui e no CSV exportado — item mais
  // antigo que isso só some desta lista, nunca do banco.
  const historicoSolicitacoes = diarioDeBordo.filter((item) =>
    agora - new Date(item.quando).getTime() <= HISTORICO_JANELA_MS
  )

  // Pedidos de abastecimento já registrados mas ainda não pagos — o QR/link
  // de pagamento continua acessível pra eles na área de Abastecimento (ver
  // modal "Pedir abastecimento" abaixo), já que pagar não é mais exigido no
  // momento do pedido.
  const pedidosAguardandoPagamento = abastecimentos.filter((p) => p.status === 'aguardando_pagamento')

  function abrirModalAbastecimento() {
    setFormAbastecimento({ embarcacao_id: embarcacoes[0]?.id || '', combustivel_id: combustiveis[0]?.id || '', quantidade_litros: '' })
    setModalAbastecimentoAberto(true)
  }

  // Encontra o agendamento (retirada/retorno) em aberto mais próximo para essa
  // embarcação, pra já vincular o pedido de abastecimento à linha certa no
  // Painel de Controle — sem precisar perguntar isso ao cliente. "solicitado"
  // é o único status de espera hoje: a notificação vira direto "concluído"
  // (Navegando) quando o operador confirma a saída ou o retorno.
  function agendamentoRelevante(embarcacaoId) {
    const ativos = agendamentos.filter((a) => a.embarcacao_id === embarcacaoId && a.status === 'solicitado')
    if (ativos.length === 0) return null
    return ativos.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0]
  }

  async function enviarAbastecimento(e) {
    e.preventDefault()
    if (!cliente) return
    const combustivel = combustiveis.find((c) => c.id === formAbastecimento.combustivel_id)
    if (!combustivel) return
    const litros = Number(formAbastecimento.quantidade_litros)
    const valorTotal = litros * Number(combustivel.preco_litro)
    setEnviandoAbastecimento(true)
    try {
      // QR "Pix copia e cola" de demonstração — o pagamento real será conectado
      // quando a marina configurar sua própria conta Mercado Pago.
      const qrDemo = `00020126DEMO-PIX-MARINA5204000053039865406${valorTotal.toFixed(2)}5802BR5913Marina Manager6009DEMO-QR`
      const agendamento = agendamentoRelevante(formAbastecimento.embarcacao_id)
      const pedido = await solicitarAbastecimento({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formAbastecimento.embarcacao_id || null,
        agendamento_id: agendamento?.id || null,
        combustivel_id: combustivel.id,
        quantidade_litros: litros,
        preco_litro_no_pedido: combustivel.preco_litro,
        valor_total: valorTotal,
        status: 'aguardando_pagamento',
        qr_code: qrDemo,
        qr_code_demo: true,
      })
      setModalAbastecimentoAberto(false)
      setPedidoGerado({ ...pedido, combustivelNome: combustivel.nome })
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoAbastecimento(false)
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <img
        src="/rv-invictus-logo.png"
        alt="RV Invictus · Consultoria e Gestão de Processos"
        className="pagina-cliente-logo"
      />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cor-primaria)' }}>
          <IconVeleiro size={22} /> <strong style={{ fontSize: 17 }}>Marina Paulo Prates</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} onClick={() => supabase.auth.signOut()}>
            <IconLogout size={16} /> Sair
          </button>
          {cliente && (
            <MenuConfigCliente
              autorizadosCount={autorizados.filter((a) => a.ativo).length}
              onAbrirAutorizados={abrirModalAutorizados}
              onAbrirMeusDados={abrirModalDados}
              onAbrirHistorico={() => setModalHistoricoAberto(true)}
            />
          )}
        </div>
      </header>

      {erroCarregamento && (
        <div className="erro" style={{ marginBottom: 12 }}>
          Não foi possível atualizar seus dados agora ({erroCarregamento}). Tente recarregar a página.
        </div>
      )}

      {!cliente && !erroCarregamento && <p>Seu cadastro ainda está em análise pela administração da marina.</p>}

      {cliente && (
        <>
          {(() => {
            const statusAgenda = statusAgendaCliente(cliente)
            return (
              <p className={`status-texto ${statusAgenda.classe}`} style={{ textAlign: 'center', display: 'block', marginBottom: 12 }}>
                {!statusAgenda.liberado && <IconLock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />}
                {statusAgenda.texto}
              </p>
            )
          })()}

          <div className="painel-cliente-acoes">
            <div className="painel-cliente-linha">
              <button type="button" className="painel-cliente-btn painel-cliente-btn-primario"
                disabled={!statusAgendaCliente(cliente)?.liberado || !configRampaCarregada}
                title={!configRampaCarregada ? 'Carregando horários da rampa…' : (!statusAgendaCliente(cliente)?.liberado ? statusAgendaCliente(cliente)?.texto : undefined)}
                onClick={() => abrirModal('retirada')}>
                <IconTimao size={20} /> Descida
              </button>
              <button type="button" className="painel-cliente-btn painel-cliente-btn-outline"
                disabled={!statusAgendaCliente(cliente)?.liberado || !configRampaCarregada}
                title={!configRampaCarregada ? 'Carregando horários da rampa…' : (!statusAgendaCliente(cliente)?.liberado ? statusAgendaCliente(cliente)?.texto : undefined)}
                onClick={() => abrirModal('retorno')}>
                <IconAnchor size={20} /> Subida
              </button>
            </div>

            <button
              type="button"
              className={`painel-cliente-btn painel-cliente-btn-sos ${agendamentoNavegando && STATUS_RESGATE_CANCELAVEIS.includes(agendamentoNavegando.resgate_status) ? 'enviado' : ''}`}
              disabled={!agendamentoNavegando || enviandoResgate || (agendamentoNavegando && STATUS_RESGATE_CANCELAVEIS.includes(agendamentoNavegando.resgate_status))}
              onClick={solicitarResgate}
            >
              <IconLifebuoy size={20} />
              {!agendamentoNavegando
                ? 'S.O.S. · nenhuma embarcação no mar'
                : enviandoResgate
                  ? 'Enviando...'
                  : MENSAGEM_BOTAO_RESGATE[agendamentoNavegando.resgate_status] || 'S.O.S. · Solicitar resgate'}
            </button>

            <button type="button" className="painel-cliente-btn painel-cliente-btn-servicos" onClick={abrirModalServicos}>
              <IconClipboardList size={20} /> Serviços
            </button>
            <p className="painel-cliente-nota">Abastecimento, Manutenção e Regularização</p>
          </div>

          <h3 style={{ textAlign: 'center' }}>Diário de Bordo</h3>
          <div className="lista-cards diario-lista">
            {diarioAtivo.length === 0 && <p className="dica">Nenhum registro ainda.</p>}
            {diarioAtivo.map((item) => {
              const Icone = item.icone
              return (
                <div key={item.id} className="cliente-card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Icone size={20} style={{ color: 'var(--cor-secundaria)', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div className="linha"><b>{item.titulo}</b></div>
                    {item.detalhe && <div className="linha">{item.detalhe}</div>}
                    <span className={`status-texto ${item.statusClasse}`}>{item.statusLabel}</span>
                  </div>
                  {item.agendamentoParaCancelar && (
                    <button type="button" className="cancelar" style={{ flexShrink: 0 }}
                      onClick={() => cancelarAgendamentoCliente(item.agendamentoParaCancelar)}>
                      Cancelar
                    </button>
                  )}
                  {item.abastecimentoParaCancelar && (
                    <button type="button" className="cancelar" style={{ flexShrink: 0 }}
                      onClick={() => cancelarAbastecimentoCliente(item.abastecimentoParaCancelar)}>
                      Cancelar
                    </button>
                  )}
                  {item.resgateParaCancelar && (
                    <button type="button" className="cancelar" style={{ flexShrink: 0 }}
                      onClick={cancelarResgateCliente}>
                      Cancelar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {modalTipo && (
        <div className="modal-fundo" onClick={() => setModalTipo(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarAgendamento}>
            <h3>{modalTipo === 'retirada' ? 'Solicitar descida para água' : 'Agendar atracação de subida'}</h3>
            {embarcacoes.length > 0 ? (
              <select required value={formAgendamento.embarcacao_id}
                onChange={(e) => setFormAgendamento({ ...formAgendamento, embarcacao_id: e.target.value })}>
                <option value="">Selecione a embarcação</option>
                {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <p className="dica">Você ainda não tem embarcações cadastradas.</p>
            )}
            {/* Data + horário: o horário é sempre escolhido dentre os que a
                Agenda da rampa libera pra essa data — horário de
                funcionamento, intervalo fixo entre solicitações, períodos de
                manutenção E os horários que outro cliente já ocupou (ver
                horariosOcupados, buscado de novo — useEffect logo acima —
                toda vez que a data muda aqui). Não tem como escolher fora
                dessa lista, nem um horário que já passou, nem um já tomado.
                Configurado pelo administrador em Painel de Controle →
                Configurações → Agenda. */}
            <input type="date" required
              min={new Date().toISOString().slice(0, 10)}
              value={formAgendamento.data}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, data: e.target.value, hora: '' })} />
            <select required value={formAgendamento.hora}
              disabled={!formAgendamento.data || carregandoHorarios}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, hora: e.target.value })}>
              <option value="">
                {!formAgendamento.data ? 'Escolha a data primeiro' : carregandoHorarios ? 'Carregando horários...' : 'Selecione o horário'}
              </option>
              {horariosDisponiveis(configRampa, formAgendamento.data, horariosOcupados).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            {/* Duas mensagens possíveis quando não sobra nenhum horário pra
                essa data — pra não confundir "rampa fechada/em manutenção"
                (mensagem fixa que o administrador escolhe, Configurações →
                Agenda) com "todos os horários já foram reservados por
                outros clientes" (situação diferente, resolvida só
                escolhendo outro dia — nunca fixa na tela). */}
            {formAgendamento.data && !carregandoHorarios && horariosDisponiveis(configRampa, formAgendamento.data).length === 0 && (
              <p className="dica" style={{ color: 'var(--cor-alerta)', margin: '-4px 0 0' }}>{configRampa.mensagemIndisponibilidade}</p>
            )}
            {formAgendamento.data && !carregandoHorarios
              && horariosDisponiveis(configRampa, formAgendamento.data).length > 0
              && horariosDisponiveis(configRampa, formAgendamento.data, horariosOcupados).length === 0 && (
              <p className="dica" style={{ color: 'var(--cor-alerta)', margin: '-4px 0 0' }}>Todos os horários dessa data já foram reservados. Escolha outro dia ou outra data.</p>
            )}
            {modalTipo === 'retirada' && (
              <>
                <label className="dica" style={{ marginBottom: -8 }}>Previsão de subida (opcional)</label>
                <input type="datetime-local"
                  value={formAgendamento.previsao_retorno}
                  onChange={(e) => setFormAgendamento({ ...formAgendamento, previsao_retorno: e.target.value })} />
              </>
            )}
            <input placeholder="Observações (opcional)"
              value={formAgendamento.observacoes}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, observacoes: e.target.value })} />
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalTipo(null)}>Cancelar</button>
              <button type="submit" disabled={enviandoAgendamento}>{enviandoAgendamento ? 'Enviando...' : 'Confirmar solicitação'}</button>
            </div>
          </form>
        </div>
      )}

      {modalServicosAberto && (
        <div className="modal-fundo" onClick={() => setModalServicosAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <h3>Serviços</h3>

            {/* Nível 0: seletor curto, sem textos descritivos — escolhe o tipo */}
            {!modoServicos && (
              <div className="servicos-seletor">
                <button type="button" onClick={() => { setModalServicosAberto(false); abrirModalAbastecimento() }} disabled={combustiveis.length === 0}>
                  <IconGasStation size={22} />
                  Abastecimento
                </button>
                <button type="button" onClick={() => setModoServicos('manutencao')}>
                  <IconTools size={22} />
                  Manutenção
                </button>
                {/* "Regularização" (despacho) — desativada temporariamente a
                    pedido da administração: continua visível, no mesmo
                    padrão visual, mas o clique não abre mais o fluxo de
                    categorias (setModoServicos('regularizacao'), ainda
                    intacto logo abaixo — é só trocar o onClick de volta pra
                    reativar), só avisa "Em construção". */}
                <button type="button" onClick={() => alert('Em construção')}>
                  <IconFileCertificate size={22} />
                  Regularização
                </button>
                <button type="button" onClick={() => { setModalServicosAberto(false); setModalPagamentosAberto(true) }}>
                  <IconReceipt2 size={22} />
                  Pagamentos
                </button>
              </div>
            )}

            {/* Manutenção: formulário direto, sem catálogo */}
            {modoServicos === 'manutencao' && (
              <form onSubmit={enviarSolicitacaoManutencao} style={{ marginTop: 12 }}>
                <button type="button" className="voltar" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }} onClick={voltarServicos}>
                  <IconArrowLeft size={16} /> Voltar
                </button>
                {embarcacoes.length > 0 ? (
                  <select required value={formManutencao.embarcacao_id}
                    onChange={(e) => setFormManutencao({ ...formManutencao, embarcacao_id: e.target.value })}>
                    <option value="">Selecione a embarcação</option>
                    {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                ) : (
                  <p className="dica">Você ainda não tem embarcações cadastradas.</p>
                )}
                <select value={formManutencao.tipo_servico}
                  onChange={(e) => setFormManutencao({ ...formManutencao, tipo_servico: e.target.value })}>
                  {TIPOS_MANUTENCAO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input placeholder="Observações (opcional)"
                  value={formManutencao.descricao}
                  onChange={(e) => setFormManutencao({ ...formManutencao, descricao: e.target.value })} />
                <div className="acoes-modal">
                  <button type="button" onClick={() => setModalServicosAberto(false)}>Cancelar</button>
                  <button type="submit" disabled={enviandoManutencao || embarcacoes.length === 0}>
                    {enviandoManutencao ? 'Enviando...' : 'Solicitar este serviço'}
                  </button>
                </div>
              </form>
            )}

            {/* Regularização, nível 1: categorias — só o nome, sem descrição */}
            {modoServicos === 'regularizacao' && !categoriaAtiva && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="voltar" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }} onClick={voltarServicos}>
                  <IconArrowLeft size={16} /> Voltar
                </button>
                <div className="lista-cards">
                  {CATEGORIAS_SERVICOS.map((cat) => (
                    <button key={cat.key} type="button" className="cliente-card"
                      style={{ textAlign: 'left', width: '100%', cursor: 'pointer', border: 'none', font: 'inherit' }}
                      onClick={() => selecionarCategoria(cat)}>
                      <div className="linha"><b>{cat.titulo}</b></div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Regularização, nível 2: serviços da categoria escolhida */}
            {modoServicos === 'regularizacao' && categoriaAtiva && !servicoAtivo && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="voltar" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }} onClick={voltarServicos}>
                  <IconArrowLeft size={16} /> Voltar
                </button>
                <p className="dica" style={{ marginTop: 0 }}><b>{categoriaAtiva.titulo}</b></p>
                <div className="lista-cards">
                  {SERVICOS_DESPACHO.filter((s) => s.categoria === categoriaAtiva.key).map((s) => (
                    <button key={s.key} type="button" className="cliente-card"
                      style={{ textAlign: 'left', width: '100%', cursor: 'pointer', border: 'none', font: 'inherit' }}
                      onClick={() => selecionarServico(s)}>
                      <div className="linha"><b>{s.titulo}</b></div>
                      <div className="linha">{s.resumo}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Regularização, nível 3: formulário do serviço escolhido */}
            {servicoAtivo && (
              <form onSubmit={enviarSolicitacaoServico} style={{ marginTop: 12 }}>
                <button type="button" className="voltar" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }} onClick={voltarServicos}>
                  <IconArrowLeft size={16} /> Voltar
                </button>
                <p className="dica"><b>{servicoAtivo.titulo}</b><br />{servicoAtivo.resumo}</p>
                {embarcacoes.length > 0 ? (
                  <select value={formServico.embarcacao_id}
                    onChange={(e) => setFormServico({ ...formServico, embarcacao_id: e.target.value })}>
                    <option value="">Selecione a embarcação (opcional)</option>
                    {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                ) : (
                  <p className="dica">Você ainda não tem embarcações cadastradas.</p>
                )}
                <input placeholder="Observações (opcional)"
                  value={formServico.observacoes}
                  onChange={(e) => setFormServico({ ...formServico, observacoes: e.target.value })} />
                <div className="acoes-modal">
                  <button type="button" onClick={() => setModalServicosAberto(false)}>Cancelar</button>
                  <button type="submit" disabled={enviandoServico}>{enviandoServico ? 'Enviando...' : 'Solicitar este serviço'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {modalAbastecimentoAberto && (
        <div className="modal-fundo" onClick={() => setModalAbastecimentoAberto(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarAbastecimento}>
            <h3>Pedir abastecimento</h3>
            {embarcacoes.length > 0 ? (
              <select required value={formAbastecimento.embarcacao_id}
                onChange={(e) => setFormAbastecimento({ ...formAbastecimento, embarcacao_id: e.target.value })}>
                <option value="">Selecione a embarcação</option>
                {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <p className="dica">Você ainda não tem embarcações cadastradas.</p>
            )}
            <select required value={formAbastecimento.combustivel_id}
              onChange={(e) => setFormAbastecimento({ ...formAbastecimento, combustivel_id: e.target.value })}>
              <option value="">Selecione o combustível</option>
              {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome} · R$ {Number(c.preco_litro).toFixed(2)}/L</option>)}
            </select>
            <input type="number" min="1" step="0.5" required placeholder="Quantidade (litros)"
              value={formAbastecimento.quantidade_litros}
              onChange={(e) => setFormAbastecimento({ ...formAbastecimento, quantidade_litros: e.target.value })} />
            {formAbastecimento.combustivel_id && formAbastecimento.quantidade_litros > 0 && (
              <p className="dica">
                Total estimado: <b>R$ {(Number(formAbastecimento.quantidade_litros) * Number(combustiveis.find((c) => c.id === formAbastecimento.combustivel_id)?.preco_litro || 0)).toFixed(2)}</b>
              </p>
            )}
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAbastecimentoAberto(false)}>Cancelar</button>
              <button type="submit" disabled={enviandoAbastecimento}>{enviandoAbastecimento ? 'Enviando...' : 'Confirmar pedido'}</button>
            </div>

            {/* Pedidos já feitos e ainda não pagos — o QR/link de pagamento
                continua acessível aqui pra pagar quando quiser (pagamento não
                é mais exigido no momento do pedido, ver enviarAbastecimento:
                o pedido já é registrado pra marina assim que confirmado). */}
            {pedidosAguardandoPagamento.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--cor-borda)' }}>
                <p className="dica" style={{ marginBottom: 8 }}>Pedidos aguardando pagamento</p>
                {pedidosAguardandoPagamento.map((p) => (
                  <div key={p.id} className="linha-pedido-pendente" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 13 }}>
                      {p.combustiveis?.nome}{p.embarcacoes?.nome ? ` · ${p.embarcacoes.nome}` : ''} — {Number(p.quantidade_litros).toFixed(2)} L · R$ {Number(p.valor_total).toFixed(2)}
                    </span>
                    <button type="button" onClick={() => { setModalAbastecimentoAberto(false); setPedidoGerado({ ...p, combustivelNome: p.combustiveis?.nome }) }}>
                      Ver QR / pagar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>
      )}

      {pedidoGerado && (
        <div className="modal-fundo" onClick={() => setPedidoGerado(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Pedido registrado</h3>
            <p className="dica">{pedidoGerado.combustivelNome} · {Number(pedidoGerado.quantidade_litros).toFixed(2)} L</p>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
              <QRCodeSVG value={pedidoGerado.qr_code} size={200} />
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--cor-primaria)', margin: '4px 0' }}>
              R$ {Number(pedidoGerado.valor_total).toFixed(2)}
            </p>
            {TEMA_PADRAO.linkPagamento && (
              <p>
                <a className="btn-primario" style={{ display: 'inline-block', textDecoration: 'none' }}
                  href={TEMA_PADRAO.linkPagamento} target="_blank" rel="noopener noreferrer">
                  Abrir link de pagamento
                </a>
              </p>
            )}
            <p className="dica" style={{ color: 'var(--cor-alerta)' }}>
              QR de demonstração. O pagamento real via Pix ainda não está conectado.
            </p>
            <p className="dica">
              Seu pedido já foi registrado para a marina — não é preciso pagar agora. Pague quando quiser com o QR acima; ele continua disponível em Serviços → Abastecimento.
            </p>
            <button className="btn-primario" style={{ width: '100%' }} onClick={() => setPedidoGerado(null)}>Fechar</button>
          </div>
        </div>
      )}

      {modalPagamentosAberto && cliente && (() => {
        const statusAgenda = statusAgendaCliente(cliente)
        return (
          <div className="modal-fundo" onClick={() => setModalPagamentosAberto(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
              <h3>Pagamentos</h3>
              <p className={`status-texto ${statusAgenda.classe}`}>{statusAgenda.texto}</p>

              {!statusAgenda.liberado && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
                    <QRCodeSVG value={QR_PAGAMENTO_DEMO} size={200} />
                  </div>
                  <p className="dica" style={{ color: 'var(--cor-alerta)' }}>
                    QR de demonstração. O pagamento real via Pix ainda não está conectado.
                  </p>
                  {TEMA_PADRAO.linkPagamento ? (
                    <p>
                      <a className="btn-primario" style={{ display: 'inline-block', textDecoration: 'none' }}
                        href={TEMA_PADRAO.linkPagamento} target="_blank" rel="noopener noreferrer">
                        Abrir link de pagamento
                      </a>
                    </p>
                  ) : (
                    <p className="dica">Link de pagamento ainda não configurado pela marina. Fale com a administração.</p>
                  )}
                  <p className="dica">
                    Depois de pagar, a administração confirma o recebimento e sua Agenda (Descida/Subida) é liberada automaticamente, não é preciso fazer mais nada aqui.
                  </p>
                </>
              )}

              <button className="btn-primario" style={{ width: '100%' }} onClick={() => setModalPagamentosAberto(false)}>Fechar</button>
            </div>
          </div>
        )
      })()}

      {modalAutorizadosAberto && (
        <div className="modal-fundo" onClick={() => setModalAutorizadosAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Pessoas autorizadas</h3>
            <p className="dica">Quem pode retirar ou devolver sua embarcação em seu nome (ex: filho, sócio, funcionário).</p>

            <div className="lista-cards" style={{ marginBottom: 12 }}>
              {autorizados.length === 0 && <p className="dica">Nenhuma pessoa autorizada cadastrada ainda.</p>}
              {autorizados.map((a) => (
                <div key={a.id} className="cliente-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div className="linha"><b>{a.nome}</b> · {a.parentesco}</div>
                    <div className="linha">{a.documento || 'sem documento'}{a.telefone ? ` · ${a.telefone}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label className="toggle">
                      <input type="checkbox" checked={a.ativo} onChange={() => alternarAutorizado(a)} />
                      <span className="trilho" />
                    </label>
                    <button type="button" className="voltar" onClick={() => excluirAutorizado(a.id)}><IconTrash size={16} /></button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={enviarNovoAutorizado} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input required placeholder="Nome completo" value={formAutorizado.nome}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, nome: e.target.value })} />
              <select value={formAutorizado.parentesco} onChange={(e) => setFormAutorizado({ ...formAutorizado, parentesco: e.target.value })}>
                {PARENTESCOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input placeholder="CPF ou RG (opcional)" value={formAutorizado.documento}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, documento: e.target.value })} />
              <input placeholder="Telefone (opcional)" value={formAutorizado.telefone}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, telefone: e.target.value })} />
              <button type="submit" disabled={salvandoAutorizado}>{salvandoAutorizado ? 'Adicionando...' : '+ Adicionar autorizado'}</button>
            </form>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAutorizadosAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* "Meus dados": editável, a pedido explícito — o cliente corrige o
          próprio cadastro por aqui (mesmos campos de FichaCadastro.jsx). O
          salvamento passa por salvarCliente() (lib/db.js, faz um UPDATE
          parcial só com os campos deste form), e o banco tem uma policy de
          UPDATE nova + um trigger ("protege_campos_admin_clientes", ver
          migration_cliente_edita_proprios_dados.sql) que garante que o
          cliente só altera os próprios campos cadastrais — campos
          administrativos/financeiros (pagamento, acesso, status,
          marina_id...) nunca mudam por essa tela, mesmo tentando. */}
      {modalDadosAberto && cliente && formDados && (
        <div className="modal-fundo" onClick={() => setModalDadosAberto(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarMeusDados}>
            <h3>Meus dados</h3>
            <p className="dica">Esses dados também aparecem para a administração da marina.</p>
            <input placeholder="Nome completo" required value={formDados.nome}
              onChange={(e) => setFormDados({ ...formDados, nome: e.target.value })} />
            <input placeholder="CPF" value={formDados.cpf_cnpj}
              onChange={(e) => setFormDados({ ...formDados, cpf_cnpj: e.target.value })} />
            <input placeholder="Documento de identidade (RG)" value={formDados.documento_identidade}
              onChange={(e) => setFormDados({ ...formDados, documento_identidade: e.target.value })} />
            <input type="email" placeholder="E-mail" value={formDados.email}
              onChange={(e) => setFormDados({ ...formDados, email: e.target.value })} />
            <input placeholder="Telefone" value={formDados.telefone}
              onChange={(e) => setFormDados({ ...formDados, telefone: e.target.value })} />
            <input placeholder="Endereço (rua, bairro)" value={formDados.endereco}
              onChange={(e) => setFormDados({ ...formDados, endereco: e.target.value })} />
            <div className="cadastro-linha-endereco">
              <input placeholder="Número" value={formDados.numero_casa}
                onChange={(e) => setFormDados({ ...formDados, numero_casa: e.target.value })} />
              <input placeholder="Complemento" value={formDados.complemento}
                onChange={(e) => setFormDados({ ...formDados, complemento: e.target.value })} />
            </div>
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalDadosAberto(false)}>Cancelar</button>
              <button type="submit" disabled={salvandoDados}>{salvandoDados ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Histórico de Solicitações: TODA solicitação já feita pelo cliente
          (descida/subida, combustível, S.O.S., manutenção, regularização,
          laudos, cancelamentos e afins — ver historicoSolicitacoes acima),
          com o status atual de cada uma, disponíveis aqui por até 5 dias.
          Passado esse prazo elas somem tanto da lista quanto da exportação
          (o filtro de 5 dias já está em historicoSolicitacoes, então tanto
          esta lista quanto exportarHistoricoSolicitacoesCsv refletem
          exatamente o mesmo recorte) — nada é apagado do banco, só para de
          aparecer/ser exportável nesta tela. */}
      {modalHistoricoAberto && (
        <div className="modal-fundo" onClick={() => setModalHistoricoAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Histórico de solicitações</h3>
            <p className="dica">Todas as suas solicitações dos últimos 5 dias, com o status atual de cada uma.</p>
            <div className="lista-cards historico-lista">
              {historicoSolicitacoes.length === 0 && <p className="dica">Nenhum registro no histórico ainda.</p>}
              {historicoSolicitacoes.map((item) => {
                const Icone = item.icone
                return (
                  <div key={item.id} className="cliente-card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Icone size={20} style={{ color: 'var(--cor-secundaria)', flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div className="linha"><b>{item.titulo}</b></div>
                      {item.detalhe && <div className="linha">{item.detalhe}</div>}
                      <span className={`status-texto ${item.statusClasse}`}>{item.statusLabel}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalHistoricoAberto(false)}>Fechar</button>
              <button type="button" disabled={historicoSolicitacoes.length === 0}
                onClick={() => exportarHistoricoSolicitacoesCsv(historicoSolicitacoes)}>
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      <a className="pagina-cliente-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
    </div>
  )
}
