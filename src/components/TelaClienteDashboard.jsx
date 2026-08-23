import { useEffect, useRef, useState } from 'react'
import {
  IconAnchor, IconLogout, IconClipboardList, IconGasStation, IconTools, IconFileCertificate,
  IconUsers, IconTrash, IconArrowLeft, IconSettings, IconLifebuoy, IconReceipt2, IconLock,
} from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, db } from '../lib/supabase'
import {
  listarAgendamentosCliente, solicitarAgendamento, atualizarStatusResgate, listarLaudosCliente, listarDespachosCliente,
  criarDespacho, criarOrdemServico, listarOrdensServicoCliente, listarCombustiveis, listarPedidosAbastecimentoCliente,
  solicitarAbastecimento, listarAutorizados, adicionarAutorizado, atualizarAutorizado, removerAutorizado,
} from '../lib/db'
import { SERVICOS_DESPACHO, CATEGORIAS_SERVICOS } from '../lib/servicosDespacho'
import { labelStatusManutencao } from '../lib/statusManutencao'
import { labelStatusResgate } from '../lib/statusResgate'
import { TEMA_PADRAO } from '../lib/tema'

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
    return { texto: 'Pagamento confirmado — Agenda liberada.', classe: 'em-dia', liberado: true }
  }
  if (cliente.acesso_liberado_manual) {
    return { texto: 'Acesso liberado manualmente pela administração da marina.', classe: 'em-dia', liberado: true }
  }
  return { texto: 'Aguardando pagamento — a Agenda é liberada automaticamente assim que a marina confirma.', classe: 'pendente', liberado: false }
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

// Nomes por extenso dos tipos de manobra, usados no Diário de Bordo (o
// Painel de Controle da equipe tem seu próprio TIPO_AGENDAMENTO_LABEL igual
// a este, em TelaVagas.jsx).
const TIPO_AGENDAMENTO_LABEL = { retirada: 'Retirada', retorno: 'Retorno' }

// Textos do S.O.S. por etapa do resgate (ver lib/statusResgate.js) — usados
// no botão de ação e no Diário de Bordo.
const DETALHE_STATUS_RESGATE = {
  solicitado: 'Resgate solicitado à equipe da marina',
  recebido: 'Equipe confirmou o recebimento do pedido — a caminho',
  resgatado: 'Atendimento concluído pela equipe',
}
const MENSAGEM_BOTAO_RESGATE = {
  solicitado: 'Resgate solicitado — aguarde a equipe',
  recebido: 'Pedido recebido — equipe a caminho',
}

// Agrupa os status de todas as origens (agendamentos, abastecimento,
// manutenção, despachos, laudos) em 3 cores só, pro Diário de Bordo não
// virar uma sopa de badges diferentes — mesmo padrão minimalista (texto
// colorido, sem bolinha/pill) já usado no resto do painel do cliente.
function classeStatusDiario(status) {
  if (['concluido', 'concluida', 'confirmado', 'pago', 'entregue', 'emitido', 'aprovado'].includes(status)) return 'em-dia'
  if (['cancelado', 'cancelada', 'indeferido'].includes(status)) return 'cancelado'
  return 'pendente'
}

// Menu de engrenagem no cabeçalho do cliente, do lado do "Sair" — reúne as
// configurações da conta (hoje só "Pessoas autorizadas", que antes era um
// botão fixo no meio do painel). Mesmo padrão visual do menu de ações do
// Painel de Controle da equipe (classes .menu-acoes* já existentes).
function MenuConfigCliente({ autorizadosCount, onAbrirAutorizados, cobrancasPendentes, onAbrirCobrancas }) {
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
          <button type="button" onClick={() => executar(onAbrirCobrancas)}>
            <IconReceipt2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Minhas cobranças{cobrancasPendentes > 0 ? ` (${cobrancasPendentes} pendente${cobrancasPendentes > 1 ? 's' : ''})` : ''}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TelaClienteDashboard({ perfil }) {
  const [cliente, setCliente] = useState(null)
  const [cobrancas, setCobrancas] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [ordensServico, setOrdensServico] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [abastecimentos, setAbastecimentos] = useState([])
  const [autorizados, setAutorizados] = useState([])
  const [modalAutorizadosAberto, setModalAutorizadosAberto] = useState(false)
  const [modalCobrancasAberto, setModalCobrancasAberto] = useState(false)
  const [formAutorizado, setFormAutorizado] = useState({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
  const [salvandoAutorizado, setSalvandoAutorizado] = useState(false)
  const [modalTipo, setModalTipo] = useState(null) // 'retirada' | 'retorno' | null
  const [formAgendamento, setFormAgendamento] = useState({ embarcacao_id: '', data_hora: '', observacoes: '' })
  const [enviandoAgendamento, setEnviandoAgendamento] = useState(false)
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
      const { data: cob, error: erroCob } = await db.from('cobrancas').select('*').eq('cliente_id', cli.id)
      if (erroCob) throw erroCob
      setCobrancas(cob || [])
      const { data: emb, error: erroEmb } = await db.from('embarcacoes').select('*').eq('cliente_id', cli.id)
      if (erroEmb) throw erroEmb
      setEmbarcacoes(emb || [])
      setAgendamentos(await listarAgendamentosCliente(cli.id))
      setLaudos(await listarLaudosCliente(cli.id))
      setDespachos(await listarDespachosCliente(cli.id))
      setOrdensServico(await listarOrdensServicoCliente(cli.id))
      setCombustiveis((await listarCombustiveis(cli.marina_id)).filter((c) => c.ativo))
      setAbastecimentos(await listarPedidosAbastecimentoCliente(cli.id))
      setAutorizados(await listarAutorizados(cli.id))
    } catch (err) {
      // Não derruba a tela — mantém o que já estava carregado e avisa, pra
      // dar pra tentar de novo (ex: recarregando a página) em vez de ficar
      // com um painel em branco sem explicação.
      setErroCarregamento(err.message)
    }
  }

  useEffect(() => { carregar() }, [perfil])

  // Enquanto o cliente está com essa tela aberta, busca os agendamentos de
  // novo periodicamente — sem isso, uma mudança de status do resgate feita
  // pela equipe no Painel de Controle (Pedido recebido / Resgatado) só
  // apareceria aqui depois de um F5 manual. Mesmo intervalo (10s) usado pelo
  // Painel de Controle da equipe pra se manter atualizado sozinho. Falha
  // silenciosa aqui é aceitável (é só uma atualização automática em segundo
  // plano) — o dado mostrado só fica um pouco desatualizado até a próxima
  // tentativa, sem interromper o que o cliente está fazendo na tela.
  useEffect(() => {
    if (!cliente) return
    const intervalo = setInterval(() => {
      listarAgendamentosCliente(cliente.id).then(setAgendamentos).catch(() => {})
    }, 10000)
    return () => clearInterval(intervalo)
  }, [cliente])

  function abrirModal(tipo) {
    // Guarda de segurança: os botões já ficam desabilitados quando o acesso
    // não está liberado, mas a checagem que realmente vale é a policy do
    // banco (agendamentos só aceita INSERT com pagamento confirmado e sem
    // suspensão) — isto aqui só evita abrir o formulário à toa.
    const statusAgenda = statusAgendaCliente(cliente)
    if (!statusAgenda?.liberado) {
      alert(statusAgenda?.texto || 'Aguardando pagamento — fale com a administração da marina.')
      return
    }
    setFormAgendamento({ embarcacao_id: embarcacoes[0]?.id || '', data_hora: '', observacoes: '', autorizado_id: '', previsao_retorno: '' })
    setModalTipo(tipo)
  }

  async function enviarAgendamento(e) {
    e.preventDefault()
    if (!cliente) return
    setEnviandoAgendamento(true)
    try {
      await solicitarAgendamento({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formAgendamento.embarcacao_id || null,
        tipo: modalTipo,
        data_hora: formAgendamento.data_hora,
        observacoes: formAgendamento.observacoes || null,
        autorizado_id: formAgendamento.autorizado_id || null,
        // Só faz sentido prever retorno numa descida — é o que o Painel de
        // Controle usa pra avisar quando a embarcação está demorando.
        previsao_retorno: modalTipo === 'retirada' && formAgendamento.previsao_retorno ? formAgendamento.previsao_retorno : null,
      })
      setModalTipo(null)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setEnviandoAgendamento(false)
    }
  }

  function abrirModalAutorizados() {
    setFormAutorizado({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
    setModalAutorizadosAberto(true)
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
          ? `${servicoAtivo.titulo} — ${formServico.observacoes}`
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
  const ultimaPorEmbarcacaoCliente = {}
  agendamentos.filter((a) => a.status === 'concluido' && a.embarcacao_id).forEach((a) => {
    const atual = ultimaPorEmbarcacaoCliente[a.embarcacao_id]
    if (!atual || new Date(a.data_hora) > new Date(atual.data_hora)) ultimaPorEmbarcacaoCliente[a.embarcacao_id] = a
  })
  const agendamentoNavegando = Object.values(ultimaPorEmbarcacaoCliente).find((a) => a.tipo === 'retirada') || null

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

  // Diário de Bordo: junta retiradas/retornos, abastecimentos, manutenção,
  // regularização, laudos e o S.O.S. (quando ativo) numa única linha do
  // tempo, mais recente primeiro. Cada origem tem seu próprio campo de
  // data — não existe uma coluna "created_at" em comum entre todas as
  // tabelas, por isso cada map já resolve pro melhor campo disponível.
  const diarioDeBordo = [
    ...agendamentos.map((a) => ({
      id: `ag-${a.id}`,
      icone: a.tipo === 'retirada' ? IconTimao : IconAnchor,
      titulo: `${TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}${a.embarcacoes?.nome ? ` — ${a.embarcacoes.nome}` : ''}`,
      detalhe: new Date(a.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      statusLabel: STATUS_LABEL[a.status] || a.status,
      statusClasse: classeStatusDiario(a.status),
      quando: a.data_hora,
    })),
    ...abastecimentos.map((p) => ({
      id: `ab-${p.id}`,
      icone: IconGasStation,
      titulo: `Abastecimento — ${p.combustiveis?.nome || ''}${p.embarcacoes?.nome ? ` — ${p.embarcacoes.nome}` : ''}`,
      detalhe: `${Number(p.quantidade_litros).toFixed(2)} L — R$ ${Number(p.valor_total).toFixed(2)}`,
      statusLabel: STATUS_LABEL[p.status] || p.status,
      statusClasse: classeStatusDiario(p.status),
      quando: p.created_at,
    })),
    ...ordensServico.map((os) => ({
      id: `os-${os.id}`,
      icone: IconTools,
      titulo: `Manutenção — ${TIPOS_MANUTENCAO.find((t) => t.key === os.tipo_servico)?.label || os.tipo_servico}${os.embarcacoes?.nome ? ` — ${os.embarcacoes.nome}` : ''}`,
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
      titulo: `Regularização — ${d.tipo?.replace(/_/g, ' ') || ''}${d.embarcacoes?.nome ? ` — ${d.embarcacoes.nome}` : ''}`,
      detalhe: `${d.orgao || ''}${d.numero_protocolo ? ` · Protocolo ${d.numero_protocolo}` : ''}`,
      statusLabel: STATUS_LABEL[d.status] || d.status,
      statusClasse: classeStatusDiario(d.status),
      quando: d.created_at,
    })),
    ...laudos.map((l) => ({
      id: `la-${l.id}`,
      icone: IconFileCertificate,
      titulo: `Laudo técnico — ${l.tipo}${l.embarcacoes?.nome ? ` — ${l.embarcacoes.nome}` : ''}`,
      detalhe: l.finalidade || '',
      statusLabel: STATUS_LABEL[l.status] || l.status,
      statusClasse: classeStatusDiario(l.status),
      quando: l.data_solicitacao,
    })),
    // S.O.S.: só mostra o estado ATUAL (não existe histórico com data/hora
    // de pedidos de resgate anteriores — resgate_status é um campo só na
    // própria linha do agendamento em navegação). Continua em vermelho
    // ("sos") em "Solicitação de resgate" e "Pedido recebido"; vira verde
    // ("em-dia") quando a equipe marca "Resgatado".
    ...(agendamentoNavegando?.resgate_status
      ? [{
          id: `sos-${agendamentoNavegando.id}`,
          icone: IconLifebuoy,
          titulo: `S.O.S. — ${agendamentoNavegando.embarcacoes?.nome || 'embarcação'}`,
          detalhe: DETALHE_STATUS_RESGATE[agendamentoNavegando.resgate_status] || '',
          statusLabel: labelStatusResgate(agendamentoNavegando.resgate_status),
          statusClasse: agendamentoNavegando.resgate_status === 'resgatado' ? 'em-dia' : 'sos',
          quando: agendamentoNavegando.data_hora,
        }]
      : []),
  ].sort((a, b) => new Date(b.quando) - new Date(a.quando))

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
        alt="RV Invictus — Consultoria e Gestão de Processos"
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
              cobrancasPendentes={cobrancas.filter((c) => c.status !== 'pago').length}
              onAbrirCobrancas={() => setModalCobrancasAberto(true)}
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
                disabled={!statusAgendaCliente(cliente)?.liberado}
                title={!statusAgendaCliente(cliente)?.liberado ? statusAgendaCliente(cliente)?.texto : undefined}
                onClick={() => abrirModal('retirada')}>
                <IconTimao size={20} /> Retirada
              </button>
              <button type="button" className="painel-cliente-btn painel-cliente-btn-outline"
                disabled={!statusAgendaCliente(cliente)?.liberado}
                title={!statusAgendaCliente(cliente)?.liberado ? statusAgendaCliente(cliente)?.texto : undefined}
                onClick={() => abrirModal('retorno')}>
                <IconAnchor size={20} /> Retorno
              </button>
            </div>

            <button
              type="button"
              className={`painel-cliente-btn painel-cliente-btn-sos ${agendamentoNavegando?.resgate_status && agendamentoNavegando.resgate_status !== 'resgatado' ? 'enviado' : ''}`}
              disabled={!agendamentoNavegando || enviandoResgate || (agendamentoNavegando.resgate_status && agendamentoNavegando.resgate_status !== 'resgatado')}
              onClick={solicitarResgate}
            >
              <IconLifebuoy size={20} />
              {!agendamentoNavegando
                ? 'S.O.S. — nenhuma embarcação no mar'
                : enviandoResgate
                  ? 'Enviando...'
                  : MENSAGEM_BOTAO_RESGATE[agendamentoNavegando.resgate_status] || 'S.O.S. — Solicitar resgate'}
            </button>

            <button type="button" className="painel-cliente-btn painel-cliente-btn-servicos" onClick={abrirModalServicos}>
              <IconClipboardList size={20} /> Serviços
            </button>
            <p className="painel-cliente-nota">Abastecimento, Manutenção e Regularização</p>
          </div>

          <h3 style={{ textAlign: 'center' }}>Diário de Bordo</h3>
          <div className="lista-cards diario-lista">
            {diarioDeBordo.length === 0 && <p className="dica">Nenhum registro ainda.</p>}
            {diarioDeBordo.map((item) => {
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
        </>
      )}

      {modalTipo && (
        <div className="modal-fundo" onClick={() => setModalTipo(null)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarAgendamento}>
            <h3>{modalTipo === 'retirada' ? 'Solicitar retirada para água' : 'Agendar atracação de retorno'}</h3>
            {embarcacoes.length > 0 ? (
              <select required value={formAgendamento.embarcacao_id}
                onChange={(e) => setFormAgendamento({ ...formAgendamento, embarcacao_id: e.target.value })}>
                <option value="">Selecione a embarcação</option>
                {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            ) : (
              <p className="dica">Você ainda não tem embarcações cadastradas.</p>
            )}
            <input type="datetime-local" required
              value={formAgendamento.data_hora}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, data_hora: e.target.value })} />
            {modalTipo === 'retirada' && (
              <>
                <label className="dica" style={{ marginBottom: -8 }}>Previsão de retorno (opcional)</label>
                <input type="datetime-local"
                  value={formAgendamento.previsao_retorno}
                  onChange={(e) => setFormAgendamento({ ...formAgendamento, previsao_retorno: e.target.value })} />
              </>
            )}
            <select value={formAgendamento.autorizado_id}
              onChange={(e) => setFormAgendamento({ ...formAgendamento, autorizado_id: e.target.value })}>
              <option value="">Quem vai buscar/entregar: eu mesmo</option>
              {autorizados.filter((a) => a.ativo).map((a) => (
                <option key={a.id} value={a.id}>{a.nome} ({a.parentesco})</option>
              ))}
            </select>
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
                <button type="button" onClick={() => setModoServicos('regularizacao')}>
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
              {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome} — R$ {Number(c.preco_litro).toFixed(2)}/L</option>)}
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
              <button type="submit" disabled={enviandoAbastecimento}>{enviandoAbastecimento ? 'Gerando...' : 'Gerar QR de pagamento'}</button>
            </div>
          </form>
        </div>
      )}

      {pedidoGerado && (
        <div className="modal-fundo" onClick={() => setPedidoGerado(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Escaneie para pagar</h3>
            <p className="dica">{pedidoGerado.combustivelNome} — {Number(pedidoGerado.quantidade_litros).toFixed(2)} L</p>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
              <QRCodeSVG value={pedidoGerado.qr_code} size={200} />
            </div>
            <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--cor-primaria)', margin: '4px 0' }}>
              R$ {Number(pedidoGerado.valor_total).toFixed(2)}
            </p>
            <p className="dica" style={{ color: 'var(--cor-alerta)' }}>
              QR de demonstração — o pagamento real via Pix ainda não está conectado. Seu pedido já foi registrado para a marina.
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
                    QR de demonstração — o pagamento real via Pix ainda não está conectado.
                  </p>
                  {TEMA_PADRAO.linkPagamento ? (
                    <p>
                      <a className="btn-primario" style={{ display: 'inline-block', textDecoration: 'none' }}
                        href={TEMA_PADRAO.linkPagamento} target="_blank" rel="noopener noreferrer">
                        Abrir link de pagamento
                      </a>
                    </p>
                  ) : (
                    <p className="dica">Link de pagamento ainda não configurado pela marina — fale com a administração.</p>
                  )}
                  <p className="dica">
                    Depois de pagar, a administração confirma o recebimento e sua Agenda (Retirada/Retorno) é liberada automaticamente — não é preciso fazer mais nada aqui.
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
                    <div className="linha"><b>{a.nome}</b> — {a.parentesco}</div>
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

      {modalCobrancasAberto && (
        <div className="modal-fundo" onClick={() => setModalCobrancasAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Minhas cobranças</h3>
            <div className="lista-cards">
              {cobrancas.length === 0 && <p className="dica">Nenhuma cobrança ainda.</p>}
              {cobrancas.map((c) => (
                <div key={c.id} className="cliente-card">
                  <div className="linha"><b>{c.descricao}</b></div>
                  <div className="linha">Vencimento: {c.vencimento} — R$ {Number(c.valor).toFixed(2)}</div>
                  <span className={`status-texto ${c.status === 'pago' ? 'em-dia' : 'pendente'}`}>
                    {c.status === 'pago' ? 'Pagamento em dia' : 'Pagamento pendente'}
                  </span>
                </div>
              ))}
            </div>
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalCobrancasAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <p className="pagina-cliente-rodape">Desenvolvido por RV Invictus</p>
    </div>
  )
}
