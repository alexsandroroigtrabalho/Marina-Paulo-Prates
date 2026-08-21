import { useEffect, useRef, useState } from 'react'
import {
  IconAnchor, IconLogout, IconSteeringWheel, IconClipboardList, IconGasStation, IconTools, IconFileCertificate,
  IconUsers, IconTrash, IconArrowLeft, IconSettings, IconLifebuoy,
} from '@tabler/icons-react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, db } from '../lib/supabase'
import {
  listarAgendamentosCliente, solicitarAgendamento, atualizarResgateAgendamento, listarLaudosCliente, listarDespachosCliente,
  criarDespacho, criarOrdemServico, listarOrdensServicoCliente, listarCombustiveis, listarPedidosAbastecimentoCliente,
  solicitarAbastecimento, listarAutorizados, adicionarAutorizado, atualizarAutorizado, removerAutorizado,
} from '../lib/db'
import { SERVICOS_DESPACHO, CATEGORIAS_SERVICOS } from '../lib/servicosDespacho'

const PARENTESCOS = ['filho(a)', 'conjuge', 'socio', 'funcionario', 'outro']

// Tipos de ordem de serviço que o cliente pode pedir pelo botão "Manutenção"
// — os mesmos tipos que a equipe usa na tela de Manutenção internamente
// (marina.ordens_servico), exceto "combustivel", que agora é o botão
// separado "Abastecimento".
const TIPOS_MANUTENCAO = [
  { key: 'limpeza', label: 'Limpeza do casco' },
  { key: 'manutencao_motor', label: 'Manutenção de motor' },
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
  // Status de ordens_servico (marina.ordens_servico) — grafia feminina,
  // distintos dos de agendamentos ("concluido"/"cancelado").
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

// Nomes por extenso dos tipos de manobra, usados no Diário de Bordo (o
// Painel de Controle da equipe tem seu próprio TIPO_AGENDAMENTO_LABEL igual
// a este, em TelaVagas.jsx).
const TIPO_AGENDAMENTO_LABEL = { retirada: 'Retirada', retorno: 'Retorno' }

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
function MenuConfigCliente({ autorizadosCount, onAbrirAutorizados }) {
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

  async function carregar() {
    const { data: cli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
    setCliente(cli)
    if (!cli) return
    const { data: cob } = await db.from('cobrancas').select('*').eq('cliente_id', cli.id)
    setCobrancas(cob || [])
    const { data: emb } = await db.from('embarcacoes').select('*').eq('cliente_id', cli.id)
    setEmbarcacoes(emb || [])
    setAgendamentos(await listarAgendamentosCliente(cli.id))
    setLaudos(await listarLaudosCliente(cli.id))
    setDespachos(await listarDespachosCliente(cli.id))
    setOrdensServico(await listarOrdensServicoCliente(cli.id))
    setCombustiveis((await listarCombustiveis(cli.marina_id)).filter((c) => c.ativo))
    setAbastecimentos(await listarPedidosAbastecimentoCliente(cli.id))
    setAutorizados(await listarAutorizados(cli.id))
  }

  useEffect(() => { carregar() }, [perfil])

  function abrirModal(tipo) {
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
    await atualizarAutorizado(autorizado.id, { ativo: !autorizado.ativo })
    carregar()
  }

  async function excluirAutorizado(id) {
    if (!confirm('Remover esta pessoa autorizada?')) return
    await removerAutorizado(id)
    carregar()
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
  // É essa linha que o botão S.O.S. atualiza com resgate_solicitado = true.
  const ultimaPorEmbarcacaoCliente = {}
  agendamentos.filter((a) => a.status === 'concluido' && a.embarcacao_id).forEach((a) => {
    const atual = ultimaPorEmbarcacaoCliente[a.embarcacao_id]
    if (!atual || new Date(a.data_hora) > new Date(atual.data_hora)) ultimaPorEmbarcacaoCliente[a.embarcacao_id] = a
  })
  const agendamentoNavegando = Object.values(ultimaPorEmbarcacaoCliente).find((a) => a.tipo === 'retirada') || null

  async function solicitarResgate() {
    if (!agendamentoNavegando) return
    if (!confirm('Confirma que deseja solicitar resgate para sua embarcação? A equipe da marina será avisada imediatamente no Painel de Controle.')) return
    try {
      await atualizarResgateAgendamento(agendamentoNavegando.id, true)
      await carregar()
    } catch (err) {
      alert(err.message)
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
      icone: a.tipo === 'retirada' ? IconSteeringWheel : IconAnchor,
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
      statusLabel: STATUS_LABEL[os.status] || os.status,
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
    // de pedidos de resgate anteriores — resgate_solicitado é um booleano
    // na própria linha do agendamento em navegação).
    ...(agendamentoNavegando?.resgate_solicitado
      ? [{
          id: `sos-${agendamentoNavegando.id}`,
          icone: IconLifebuoy,
          titulo: `S.O.S. — ${agendamentoNavegando.embarcacoes?.nome || 'embarcação'}`,
          detalhe: 'Resgate solicitado à equipe da marina',
          statusLabel: 'Aguardando equipe',
          statusClasse: 'sos',
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
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cor-primaria)' }}>
          <IconAnchor /> <strong>Marina Paulo Prates</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} onClick={() => supabase.auth.signOut()}>
            <IconLogout size={16} /> Sair
          </button>
          {cliente && (
            <MenuConfigCliente
              autorizadosCount={autorizados.filter((a) => a.ativo).length}
              onAbrirAutorizados={abrirModalAutorizados}
            />
          )}
        </div>
      </header>

      {!cliente && <p>Seu cadastro ainda está em análise pela administração da marina.</p>}

      {cliente && (
        <>
          <div className="painel-cliente-acoes">
            <div className="painel-cliente-linha">
              <button type="button" className="painel-cliente-btn painel-cliente-btn-primario" onClick={() => abrirModal('retirada')}>
                <IconSteeringWheel size={20} /> Retirada
              </button>
              <button type="button" className="painel-cliente-btn painel-cliente-btn-outline" onClick={() => abrirModal('retorno')}>
                <IconAnchor size={20} /> Retorno
              </button>
            </div>

            <button
              type="button"
              className={`painel-cliente-btn painel-cliente-btn-sos ${agendamentoNavegando?.resgate_solicitado ? 'enviado' : ''}`}
              disabled={!agendamentoNavegando || agendamentoNavegando.resgate_solicitado}
              onClick={solicitarResgate}
            >
              <IconLifebuoy size={20} />
              {!agendamentoNavegando
                ? 'S.O.S. — nenhuma embarcação no mar'
                : agendamentoNavegando.resgate_solicitado
                  ? 'Resgate solicitado — aguarde a equipe'
                  : 'S.O.S. — Solicitar resgate'}
            </button>

            <button type="button" className="painel-cliente-btn painel-cliente-btn-servicos" onClick={abrirModalServicos}>
              <IconClipboardList size={20} /> Serviços
            </button>
            <p className="painel-cliente-nota">inclui despachos, laudos e abastecimento</p>
          </div>

          <h3>Diário de Bordo</h3>
          <div className="lista-cards">
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
    </div>
  )
}
