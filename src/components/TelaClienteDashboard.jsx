import { useEffect, useRef, useState } from 'react'
import {
  IconAnchor, IconLogout, IconGasStation, IconTools, IconFileCertificate,
  IconUsers, IconTrash, IconSettings, IconLifebuoy, IconLock, IconId,
  IconHistory, IconBell, IconBellOff,
} from '@tabler/icons-react'
// qrcode.react não é mais importado aqui: o pedido de abastecimento voltou,
// mas SEM nenhuma parte financeira — não há QR, valor nem cobrança em lugar
// nenhum do RV Marine. Isso é do RV Finance, o SaaS paralelo.
import { supabase, db } from '../lib/supabase'
import {
  listarAgendamentosCliente, solicitarAgendamento, atualizarStatusAgendamento, atualizarStatusResgate, listarLaudosCliente, listarDespachosCliente,
  listarOrdensServicoCliente, listarCombustiveis, listarPedidosAbastecimentoCliente,
  solicitarAbastecimento, cancelarAbastecimento, listarAutorizados, adicionarAutorizado, atualizarAutorizado, removerAutorizado, buscarMarina,
  salvarCliente, listarHorariosOcupados, salvarEmbarcacao, removerEmbarcacao,
} from '../lib/db'
import { destravarAudioNaProximaInteracao, tocarApitoRespostaDiario } from '../lib/sons'
import { labelStatusManutencao } from '../lib/statusManutencao'
import { labelStatusResgate } from '../lib/statusResgate'
import { ultimaMovimentacaoPorEmbarcacao } from '../lib/agendamentos'
import {
  statusEfetivoAbastecimento, aguardandoDecisao, labelStatusAbastecimento,
  OBSERVACAO_COMPLETAR_TANQUE, textoQuantidade,
} from '../lib/statusAbastecimento'
import { aguardandoDecisaoAgendamento } from '../lib/statusAgendamento'
import { lerConfigRampa, horariosDisponiveis, paraHoraLocal, RAMPA_PADRAO } from '../lib/agendaRampa'
// TEMA_PADRAO era usado só pelo link de pagamento (TEMA_PADRAO.linkPagamento)
// dos modais de QR/Pix, que saíram daqui junto com a cobrança.
import { exportarHistoricoSolicitacoesCsv } from '../lib/exportarPlanilha'
import { maskCpf, maskTelefone } from '../lib/mascaras'

// Janela de visibilidade do Histórico de Solicitações (engrenagem →
// Histórico) — registra TODA solicitação do cliente (pendente, cancelada ou
// concluída), não só por 5 dias depois de sair do Diário de Bordo ativo —
// ver diarioAtivo/historicoSolicitacoes mais abaixo.
const HISTORICO_JANELA_MS = 5 * 24 * 60 * 60 * 1000
// Quanto tempo uma solicitação JÁ CONCLUÍDA ainda fica à vista no Diário de
// Bordo antes de passar a viver só no Histórico de Solicitações. Antes ela
// saía no instante em que era concluída, o que fazia o registro sumir da
// tela do cliente antes mesmo de ele perceber que tinha terminado.
const DIARIO_JANELA_MS = 24 * 60 * 60 * 1000

// "Silenciar notificações" (engrenagem → Diário de Bordo): preferência só
// deste navegador/aparelho, não do cadastro do cliente — por isso fica em
// localStorage, não no banco (não existe hoje um campo de configuração por
// cliente; se um dia existir, dá pra migrar pra lá sem mexer no resto desta
// tela). Controla só o apito de resposta (ver tocarApitoRespostaDiario
// abaixo) — o Diário de Bordo continua atualizando normalmente, silenciado
// ou não.
const CHAVE_MUDO_DIARIO = 'marina-diario-notificacoes-silenciadas'
function lerMudoDiario() {
  try {
    return localStorage.getItem(CHAVE_MUDO_DIARIO) === '1'
  } catch {
    return false
  }
}

// O QR "Pix copia e cola" de demonstração (mensalidade/acesso) saiu daqui:
// não existe mais nenhuma cobrança no RV Marine — pagamento e liberação são
// assunto do RV Finance, o SaaS paralelo.

// Mensagens de status da Agenda (retirada/retorno), derivadas de
// Dentro do RV Marine o cliente tem liberdade de acesso: a Agenda NÃO
// depende mais de confirmação de pagamento. O controle financeiro e de
// liberação saiu daqui e passa a ser feito no RV Finance, o SaaS paralelo;
// quem entra na plataforma é controlado pela forma de cadastro (sublink
// próprio da marina), não por um bloqueio dentro do aplicativo.
//
// Sobrou uma única condição, e ela não é financeira: `acesso_suspenso`, a
// suspensão administrativa que a marina aplica a um cliente específico.
// Espelha exatamente o que a policy "cliente_cria_agendamento" do banco
// ainda exige (ver migration_rv_marine_sem_bloqueio_pagamento.sql), então a
// mensagem na tela nunca destoa do que o banco permite.
//
// pagamento_confirmado / acesso_liberado_manual continuam existindo na
// tabela — os dados históricos são preservados para a migração do módulo
// financeiro —, só deixaram de valer como condição de acesso.
function statusAgendaCliente(cliente) {
  if (!cliente) return null
  if (cliente.acesso_suspenso) {
    return { texto: 'Acesso suspenso pela administração da marina.', classe: 'cancelado', liberado: false }
  }
  return { texto: null, classe: 'em-dia', liberado: true }
}

// Cadastro específico do RV MARINE — o que o cadastro inicial (conta da
// plataforma: nome, CPF, e-mail, senha) não cobre e sem o qual a descida/
// subida não funciona de verdade:
//   - telefone: é por onde a marina fala com o cliente durante a manobra
//   - ao menos uma embarcação: não existe agendamento sem barco pra descer
// RG, endereço e complemento continuam disponíveis em "Minha conta", porém
// como dados opcionais — não travam a operação, então não entram aqui.
const TIPOS_EMBARCACAO = ['Barco', 'Veleiro', 'Jet Ski', 'Iate']
const EMBARCACAO_NOVA = { tipo: 'Barco', nome: '', registro: '' }

function faltandoParaRvMarine(cliente, embarcacoes) {
  const faltando = []
  if (!cliente?.telefone?.trim()) faltando.push('telefone')
  if (!embarcacoes || embarcacoes.length === 0) faltando.push('embarcação')
  return faltando
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

// IconVeleiro (a caravela que ficava antes do nome da marina) foi removido
// a pedido — o painel do cliente ficou só com a tipografia da marca.

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
  // 'aguardando_pagamento', 'pago' e 'entregue' saíram: eram status de
  // pedido de abastecimento, que não existe mais no painel do cliente.
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
//   - 'cancelado': classeStatusDiario('cancelado') sozinho devolveria
//     'cancelado' (fica parado no Diário de Bordo ativo pra sempre, com um
//     badge vermelho) — força 'em-dia' aqui, mesmo tratamento já dado ao
//     combustível cancelado (ver statusAbastecimentoDiario abaixo): uma
//     descida/subida cancelada (pelo administrador ou pelo próprio
//     cliente) também é terminal, não sobra ação nenhuma, então some do
//     Diário de Bordo ativo do mesmo jeito. Continua no Histórico de
//     Solicitações normalmente, e já sai do Painel de Controle desde
//     sempre (Fila de Rampa/Navegando só mostram status ativo — ver
//     linhasFilaAtivas em lib/filaRampa.js; cancelados só aparecem lá
//     atrás do botão "Ver cancelados").
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
  if (a.status === 'cancelado') {
    return { statusLabel: 'Cancelado', statusClasse: 'em-dia' }
  }
  return { statusLabel: STATUS_LABEL[a.status] || a.status, statusClasse: classeStatusDiario(a.status) }
}

// SeletorAcaoPagamento não existe mais: "Realizar pagamento" e "Pagamento
// efetuado" saíram com o financeiro. O que voltou foi só o pedido.
//
// Rótulo/cor de um pedido de abastecimento no Diário de Bordo. O status
// mostrado é o EFETIVO (ver statusEfetivoAbastecimento em
// lib/statusAbastecimento.js), não o que está gravado: um pedido que
// completou 15 minutos sem cancelamento já aparece como "Confirmado" para o
// cliente, exatamente como aparece para a equipe no Painel de Controle —
// mesma função nos dois lados, então nunca divergem.
//
// 'cancelado' vira classe 'em-dia' de propósito: classeStatusDiario
// devolveria 'cancelado', e um item dessa classe fica parado no Diário de
// Bordo ativo para sempre (ver diarioAtivo). Como cancelar é terminal —
// não sobra ação nenhuma —, ele precisa envelhecer e sair igual a um
// pedido confirmado. Continua inteiro no Histórico de Solicitações.
function statusAbastecimentoDiario(pedido, agoraMs) {
  const efetivo = statusEfetivoAbastecimento(pedido, agoraMs)
  return {
    statusLabel: labelStatusAbastecimento(efetivo),
    statusClasse: efetivo === 'cancelado' ? 'em-dia' : classeStatusDiario(efetivo),
  }
}

// Menu de engrenagem no cabeçalho do cliente, do lado do "Sair" — reúne as
// configurações da conta ("Pessoas autorizadas", "Minha conta" e "Histórico
// de solicitações"). Mesmo padrão visual do menu de ações do Painel de
// Controle da equipe (classes .menu-acoes* já existentes). "Minhas
// cobranças" saiu daqui (removida a pedido) — "Minha conta" entrou no
// lugar, editável, sempre sincronizado com o banco (tabela clientes).
function MenuConfigCliente({ autorizadosCount, onAbrirAutorizados, onAbrirMinhaConta, onAbrirHistorico, notificacoesSilenciadas, onAlternarNotificacoes, cadastroPendente }) {
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
      {/* Com cadastro incompleto pro RV Marine, a engrenagem ganha um halo
          dourado em pulsação discreta (.menu-acoes-botao-pendente) — é o
          caminho pra "Minha conta", onde os dados que faltam são
          preenchidos. O halo some sozinho assim que o cadastro fica
          completo, porque `cadastroPendente` deixa de ser true. */}
      <button
        type="button"
        className={`menu-acoes-botao ${cadastroPendente ? 'menu-acoes-botao-pendente' : ''}`}
        onClick={() => setAberto(!aberto)}
        title={cadastroPendente ? 'Configurações — há dados a completar' : 'Configurações'}
      >
        <IconSettings size={18} />
      </button>
      {aberto && (
        <div className="menu-acoes-dropdown">
          <button type="button" onClick={() => executar(onAbrirAutorizados)}>
            <IconUsers size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Pessoas autorizadas ({autorizadosCount})
          </button>
          <button type="button" onClick={() => executar(onAbrirMinhaConta)}>
            <IconId size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Minha conta
            {cadastroPendente && <span className="ponto-pendencia" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => executar(onAbrirHistorico)}>
            <IconHistory size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Histórico de solicitações
          </button>
          {/* Silencia só o apito de resposta (tocarApitoRespostaDiario) —
              não afeta a atualização do Diário de Bordo em si, só o som.
              Preferência local deste navegador, ver CHAVE_MUDO_DIARIO. */}
          <button type="button" onClick={() => executar(onAlternarNotificacoes)}>
            {notificacoesSilenciadas
              ? <><IconBellOff size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Reativar notificações</>
              : <><IconBell size={14} style={{ marginRight: 6, verticalAlign: -2 }} /> Silenciar notificações</>}
          </button>
        </div>
      )}
    </div>
  )
}

export default function TelaClienteDashboard({ perfil, onVoltar }) {
  const [cliente, setCliente] = useState(null)
  // Enquanto true, ainda não sabemos se existe cadastro ou não — evita
  // piscar "Seu cadastro ainda está em análise" durante a primeira busca
  // (ver useEffect/carregar abaixo), mesma técnica usada no RV e-Náutica
  // (TelaClienteENautica.jsx).
  const [carregando, setCarregando] = useState(true)
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [despachos, setDespachos] = useState([])
  const [ordensServico, setOrdensServico] = useState([])
  // Tipos de combustível que a marina deixou ativos (Painel de Controle ->
  // Configurações -> Combustível) e os pedidos já feitos por este cliente.
  const [combustiveis, setCombustiveis] = useState([])
  const [abastecimentos, setAbastecimentos] = useState([])
  const [autorizados, setAutorizados] = useState([])
  const [modalAutorizadosAberto, setModalAutorizadosAberto] = useState(false)
  const [modalDadosAberto, setModalDadosAberto] = useState(false)
  const [formDados, setFormDados] = useState(null)
  const [salvandoDados, setSalvandoDados] = useState(false)
  // Cadastro de embarcação dentro de "Minha conta" (ver bloco Embarcações no
  // modal). Salva sozinho, sem depender do "Salvar" dos dados pessoais —
  // são tabelas diferentes (marina.embarcacoes x marina.clientes).
  // O campo "Trocar senha" saiu de "Minha conta" a pedido — troca de senha
  // deixou de ser feita por aqui.
  // "+ Adicionar embarcação" é só o gatilho que abre o formulário abaixo —
  // ele mesmo não salva nada; o formulário só existe na tela enquanto
  // novaEmbarcacaoAberta for true, igual ao "+ Embarcação" do card de cada
  // cliente em TelaClientes.jsx (mesmo padrão, ver clienteExpandido lá).
  // Antes o formulário (tipo/nome/registro) ficava sempre visível, mesmo sem
  // nenhuma intenção de cadastrar — a própria caixa vazia por padrão era o
  // "card fantasma" reclamado.
  const [novaEmbarcacaoAberta, setNovaEmbarcacaoAberta] = useState(false)
  const [novaEmbarcacao, setNovaEmbarcacao] = useState({ ...EMBARCACAO_NOVA })
  const [salvandoEmbarcacao, setSalvandoEmbarcacao] = useState(false)
  // Edição/exclusão simplificada de uma embarcação já cadastrada (ver
  // salvarNomeEmbarcacao abaixo) — nomeEmbarcacaoEditado guarda só o que
  // ainda não foi salvo, por id; enquanto o cliente não mexe no campo, o
  // input mostra o nome que já está no banco (embarcacoes vem de `carregar`,
  // sempre atualizado). Apagar o texto e salvar exclui a embarcação — regra
  // explicada no botão "Salvar" de cada item, mais abaixo.
  const [nomesEmbarcacaoEditados, setNomesEmbarcacaoEditados] = useState({})
  const [salvandoEdicaoEmbarcacaoId, setSalvandoEdicaoEmbarcacaoId] = useState(null)
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
  const [modalAbastecimentoAberto, setModalAbastecimentoAberto] = useState(false)
  const [formAbastecimento, setFormAbastecimento] = useState({ embarcacao_id: '', combustivel_id: '', quantidade_litros: '', completarTanque: false })
  const [enviandoAbastecimento, setEnviandoAbastecimento] = useState(false)
  // Relógio próprio da tela. O painel do cliente só recarregava a cada 30s,
  // e a janela de 15 minutos do pedido de abastecimento precisa fechar na
  // hora certa: sem isto, o botão "Cancelar" de um pedido continuaria à
  // vista por até meio minuto depois do prazo — e o banco recusaria o
  // clique, porque a policy conta o mesmo tempo (ver
  // migration_abastecimento_sem_financeiro.sql). Também é ele que faz o
  // rótulo virar "Confirmado" sozinho, sem ninguém tocar na tela.
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  useEffect(() => {
    const relogio = setInterval(() => setAgoraMs(Date.now()), 10000)
    return () => clearInterval(relogio)
  }, [])
  const [enviandoResgate, setEnviandoResgate] = useState(false)
  // Aviso temporário do rodapé (ver mostrarAviso abaixo).
  const [aviso, setAviso] = useState(null)
  const avisoRef = useRef(null)

  const [erroCarregamento, setErroCarregamento] = useState(null)
  // "Silenciar notificações" — ver CHAVE_MUDO_DIARIO acima.
  const [notificacoesSilenciadas, setNotificacoesSilenciadas] = useState(lerMudoDiario)
  function alternarNotificacoes() {
    setNotificacoesSilenciadas((atual) => {
      const novo = !atual
      try { localStorage.setItem(CHAVE_MUDO_DIARIO, novo ? '1' : '0') } catch { /* preferência só local, sem problema se não salvar */ }
      return novo
    })
  }

  // Destrava o áudio na primeira interação da sessão (clique/tecla/toque) —
  // mesmo helper usado no painel administrativo (ver lib/sons.js), preciso
  // aqui porque o apito de resposta (tocarApitoRespostaDiario) também
  // depende do navegador já ter liberado áudio.
  useEffect(() => { destravarAudioNaProximaInteracao() }, [])

  // Conta quantas vezes carregar() já terminou de verdade — mesma técnica
  // usada no apito do painel administrativo (ver SonsPainelAdmin.jsx):
  // evita o apito de resposta tocar sozinho ao abrir a página pra tudo que
  // já estava ali, disparando só a partir da atualização seguinte.
  const cargasCompletadasRef = useRef(0)
  // Último status conhecido de cada item do Diário de Bordo (id → statusLabel) — ver efeito do apito de resposta, mais abaixo.
  const statusDiarioConhecidoRef = useRef(null)

  async function carregar() {
    try {
      const { data: cli, error: erroCli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
      if (erroCli) throw erroCli
      setCliente(cli)
      setErroCarregamento(null)
      if (!cli) return
      // ativa=true: uma embarcação "excluída" (nome apagado e salvo — ver
      // removerEmbarcacao em lib/db.js) fica marcada ativa=false, não é
      // apagada de verdade, e precisa sumir daqui na mesma hora.
      const { data: emb, error: erroEmb } = await db.from('embarcacoes').select('*').eq('cliente_id', cli.id).eq('ativa', true)
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
      // Só os tipos ativos: o que a marina desligou não pode ser pedido.
      setCombustiveis(combustiveisCarregados.filter((c) => c.ativo))
      setAbastecimentos(abastecimentosCarregados)
      setAutorizados(autorizadosCarregados)
      setConfigRampa(lerConfigRampa(marinaCarregada))
      setConfigRampaCarregada(true)
      setMarina(marinaCarregada)
      cargasCompletadasRef.current += 1
    } catch (err) {
      // Não derruba a tela — mantém o que já estava carregado e avisa, pra
      // dar pra tentar de novo (ex: recarregando a página) em vez de ficar
      // com um painel em branco sem explicação.
      setErroCarregamento(err.message)
    } finally {
      setCarregando(false)
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
      // Embarcação cadastrada/corrigida pela administração direto no Painel
      // de Controle (TelaClientes.jsx) — sincronização bidirecional: antes
      // só uma alteração feita pelo PRÓPRIO cliente (adicionarEmbarcacao,
      // acima) atualizava a tela na hora; uma edição vinda do admin só
      // aparecia depois de um F5. cha_validade não trafega por aqui: mora só
      // em `clientes`, e mesmo lá é ocultada desta tela de propósito (ver
      // migration_cha_validade.sql) — não tem exposição correspondente em
      // `embarcacoes`.
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'embarcacoes', filter: `cliente_id=eq.${idCliente}` }, () => carregar())
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
    // está suspenso, mas a checagem que realmente vale é a policy do banco
    // (agendamentos recusa INSERT de cliente suspenso) — isto aqui só evita
    // abrir o formulário à toa.
    const statusAgenda = statusAgendaCliente(cliente)
    if (!statusAgenda?.liberado) {
      alert(statusAgenda?.texto || 'Acesso suspenso. Fale com a administração da marina.')
      return
    }
    // Primeira descida/subida com o cadastro do RV Marine incompleto: avisa
    // e não abre o formulário. O aviso é curto e some sozinho; quem indica
    // ONDE resolver é o halo dourado na engrenagem, que leva a "Minha
    // conta". Assim que os dados entram, os dois somem juntos.
    if (!cadastroRvMarineOk()) return
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

  // Cancelar um pedido de abastecimento direto pelo Diário de Bordo. Só
  // aparece enquanto o pedido ainda espera decisão — ou seja, em
  // 'solicitado' e dentro dos 15 minutos (ver aguardandoDecisao em
  // lib/statusAbastecimento.js e abastecimentoParaCancelar no Diário, mais
  // abaixo). Mesmo padrão de confirmação de cancelarAgendamentoCliente.
  //
  // A policy do banco conta o mesmo tempo, então uma tentativa que chegue
  // atrasada (o relógio virou entre o clique e a resposta) é recusada lá —
  // e a mensagem abaixo explica isso em português, em vez de mostrar o erro
  // cru do Postgres.
  async function cancelarAbastecimentoCliente(p) {
    if (!confirm(`Cancelar o pedido de abastecimento de ${p.combustiveis?.nome || 'combustível'}${p.embarcacoes?.nome ? ` (${p.embarcacoes.nome})` : ''}?`)) return
    try {
      await cancelarAbastecimento(p.id)
      await carregar()
    } catch {
      mostrarAviso('Este pedido já passou dos 15 minutos e foi confirmado. Fale com a marina para cancelar.')
      await carregar()
    }
  }

  function abrirModalAutorizados() {
    setFormAutorizado({ nome: '', documento: '', telefone: '', parentesco: 'filho(a)' })
    setModalAutorizadosAberto(true)
  }

  // "Minha conta" agora é editável (era só leitura) — o cliente pode
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
    // Sempre começa fechado, mesmo que da última vez o cliente tenha aberto o
    // formulário e fechado o modal inteiro (backdrop/Cancelar) sem clicar em
    // Salvar nem em Cancelar do próprio formulário — sem isso a caixa vazia
    // reaparecia sozinha na próxima vez que "Minha conta" fosse aberta.
    setNovaEmbarcacaoAberta(false)
    setNovaEmbarcacao({ ...EMBARCACAO_NOVA })
    setModalDadosAberto(true)
  }

  // Porta única da checagem de cadastro do RV Marine: descida e subida
  // (abrirModal) e abastecimento (abrirModalAbastecimento). Todos precisam
  // de embarcação pra existir, e de um telefone pra marina responder.
  // Devolve true quando pode seguir.
  function cadastroRvMarineOk() {
    const faltando = faltandoParaRvMarine(cliente, embarcacoes)
    if (faltando.length === 0) return true
    mostrarAviso(`Para utilizar este serviço, complete os dados da sua conta: ${faltando.join(' e ')}. Toque no ícone de engrenagem (⚙) no topo da tela e escolha "Minha conta".`, 7000)
    return false
  }

  async function adicionarEmbarcacao() {
    if (!cliente || !novaEmbarcacao.nome.trim()) return
    setSalvandoEmbarcacao(true)
    try {
      await salvarEmbarcacao({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        nome: novaEmbarcacao.nome.trim(),
        tipo: novaEmbarcacao.tipo,
        registro: novaEmbarcacao.registro.trim() || null,
      })
      setNovaEmbarcacao({ ...EMBARCACAO_NOVA })
      setNovaEmbarcacaoAberta(false)
      await carregar()
    } catch (err) {
      alert(err.message)
    } finally {
      setSalvandoEmbarcacao(false)
    }
  }

  // Fecha o formulário sem salvar nada — nem um rascunho fica pra trás: os
  // campos digitados somem junto com a caixa (ver novaEmbarcacaoAberta acima).
  function cancelarNovaEmbarcacao() {
    setNovaEmbarcacao({ ...EMBARCACAO_NOVA })
    setNovaEmbarcacaoAberta(false)
  }

  // Exclusão simplificada de uma embarcação já cadastrada: apagar o texto do
  // nome e clicar "Salvar" exclui a embarcação (soft-delete — ver
  // removerEmbarcacao em lib/db.js); qualquer outro texto só renomeia. Some
  // da tela na mesma hora dos dois lados (Diário de Bordo e Painel do
  // Administrador) via o mesmo Realtime já assinado em `embarcacoes` — não
  // precisa de nada extra aqui além de recarregar a própria lista.
  async function salvarNomeEmbarcacao(emb) {
    const novoNome = (nomesEmbarcacaoEditados[emb.id] ?? emb.nome).trim()
    if (novoNome === emb.nome) return
    if (!novoNome && !confirm(`Excluir a embarcação "${emb.nome}"? Essa ação não pode ser desfeita.`)) return
    setSalvandoEdicaoEmbarcacaoId(emb.id)
    try {
      if (novoNome) {
        await salvarEmbarcacao({ id: emb.id, nome: novoNome })
      } else {
        await removerEmbarcacao(emb.id)
      }
      setNomesEmbarcacaoEditados((atual) => {
        const copia = { ...atual }
        delete copia[emb.id]
        return copia
      })
      await carregar()
    } catch (err) {
      alert('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvandoEdicaoEmbarcacaoId(null)
    }
  }

  // "Minha conta" salva em DOIS lugares, porque os dados moram em dois
  // lugares: os cadastrais em marina.clientes (salvarCliente) e os de acesso
  // — e-mail de login e senha — no Supabase Auth. Editar só a coluna
  // `clientes.email` mudava o e-mail exibido sem mudar o e-mail com que a
  // pessoa entra no sistema; agora os dois andam juntos.
  //
  // Trocar o e-mail de login não vale na hora: o Supabase manda um link de
  // confirmação pro endereço novo e só efetiva depois do clique. Por isso o
  // aviso ao final — sem ele o cliente sairia achando que o login já mudou.
  async function enviarMeusDados(e) {
    e.preventDefault()
    if (!cliente) return

    const emailAtual = (cliente.email || '').trim().toLowerCase()
    const emailNovo = (formDados.email || '').trim().toLowerCase()
    const trocouEmail = emailNovo && emailNovo !== emailAtual

    setSalvandoDados(true)
    try {
      await salvarCliente({ id: cliente.id, ...formDados })

      if (trocouEmail) {
        const { error } = await supabase.auth.updateUser({ email: emailNovo })
        if (error) throw error
      }

      setModalDadosAberto(false)
      await carregar()

      if (trocouEmail) mostrarAviso('Confirme o link enviado ao novo e-mail para passar a entrar com ele.')
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

  // As funções do antigo painel "Serviços" (navegação entre categorias,
  // pedido de manutenção e pedido de regularização) foram removidas junto
  // com ele: manutenção passou ao RV Manut e regularização ao RV NautDoc.
  // As funções de banco correspondentes (criarOrdemServico, criarDespacho em
  // lib/db.js) continuam existindo, intactas, para essas aplicações.

  // Embarcação do cliente que está navegando agora — mesma lógica do Painel
  // de Controle da marina (a manobra concluída mais recente de cada
  // embarcação): se a última foi uma retirada, o barco ainda está na água.
  // É essa linha que o botão S.O.S. atualiza com resgate_status = 'solicitado'.
  const agendamentoNavegando = Object.values(ultimaMovimentacaoPorEmbarcacao(agendamentos)).find((a) => a.tipo === 'retirada') || null

  // Aviso curto e temporário no rodapé da tela (some sozinho). Criado pro
  // S.O.S. acionado sem nenhuma embarcação no mar: em vez de um botão
  // desativado com um texto explicativo permanente ocupando o painel, o
  // botão fica sempre clicável e a explicação aparece só no momento em que
  // faz falta. `avisoRef` guarda o timer pra um segundo clique reiniciar a
  // contagem em vez de acumular timers.
  function mostrarAviso(texto, duracaoMs = 4000) {
    if (avisoRef.current) clearTimeout(avisoRef.current)
    setAviso(texto)
    avisoRef.current = setTimeout(() => setAviso(null), duracaoMs)
  }

  useEffect(() => () => { if (avisoRef.current) clearTimeout(avisoRef.current) }, [])

  async function solicitarResgate() {
    if (enviandoResgate) return
    if (!agendamentoNavegando) {
      mostrarAviso('Nenhuma embarcação no mar. O S.O.S. fica disponível após a descida.')
      return
    }
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
    ...agendamentos.map((a) => {
      // Uma vez confirmada de verdade na rampa (status='concluido' — Navegando
      // ou Recolhido, tanto faz o tipo), o horário que importa aqui é o REAL
      // da confirmação (concluido_em, gravado no instante exato do clique por
      // atualizarStatusAgendamento em lib/db.js) — não mais data_hora, que é
      // só o horário que o cliente pediu ao solicitar a descida/subida e pode
      // ter ficado bem diferente do que de fato aconteceu na rampa. Enquanto
      // ainda não foi confirmado (solicitado/confirmado/cancelado sem nunca
      // ter concluído), concluido_em é null e data_hora segue sendo o único
      // horário que existe — daí o fallback.
      const quandoReal = a.concluido_em || a.data_hora
      const dataFormatada = new Date(quandoReal).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      return {
      id: `ag-${a.id}`,
      icone: a.tipo === 'retirada' ? IconTimao : IconAnchor,
      titulo: `${TIPO_AGENDAMENTO_LABEL[a.tipo] || a.tipo}${a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}`,
      // Cancelado com motivo (a equipe sempre pergunta antes de cancelar
      // pela Fila de Rampa — ver cancelarNotificacao em TelaVagas.jsx):
      // mostra o motivo aqui embaixo do título, no lugar da data — é a
      // única forma do cliente saber por que o pedido não vai mais
      // acontecer.
      detalhe: a.status === 'cancelado' && a.motivo_cancelamento
        ? `Motivo do cancelamento: ${a.motivo_cancelamento}`
        : dataFormatada,
      ...statusAgendamentoDiario(a, ultimaPorEmbarcacao),
      quando: quandoReal,
      // Só dá pra cancelar enquanto o pedido ainda espera decisão — em
      // 'solicitado' e dentro dos 15 minutos (mesma regra do abastecimento,
      // ver aguardandoDecisaoAgendamento em lib/statusAgendamento.js e
      // abastecimentoParaCancelar logo abaixo). Passado o prazo, o pedido já
      // confirmou sozinho e cancelar passa a ser decisão da marina pelo
      // Painel de Controle, não mais um botão aqui. Ver
      // cancelarAgendamentoCliente. A policy do banco
      // "cliente_cancela_proprio_agendamento" repete essa mesma condição, então
      // nem por fora da aplicação dá pra cancelar depois do prazo.
      agendamentoParaCancelar: aguardandoDecisaoAgendamento(a, agoraMs) ? a : null,
      }
    }),
    // TODO pedido entra aqui, inclusive os já confirmados e cancelados — é
    // o que mantém a linha visível no Histórico de Solicitações depois de
    // envelhecer e sair do Diário de Bordo ativo (ver diarioAtivo abaixo).
    // Os pedidos antigos, do tempo em que abastecimento tinha cobrança,
    // aparecem com o rótulo legado (ver STATUS_ABASTECIMENTO_LABEL) — sem
    // valor nem QR, que não existem mais em lugar nenhum desta tela.
    ...abastecimentos.map((p) => ({
      id: `ab-${p.id}`,
      icone: IconGasStation,
      titulo: `Abastecimento · ${p.combustiveis?.nome || ''}${p.embarcacoes?.nome ? ` · ${p.embarcacoes.nome}` : ''}`,
      detalhe: textoQuantidade(p),
      ...statusAbastecimentoDiario(p, agoraMs),
      quando: p.created_at,
      // O botão sai no mesmo instante em que os botões da equipe saem, no
      // Painel de Controle: as duas telas chamam aguardandoDecisao.
      abastecimentoParaCancelar: aguardandoDecisao(p, agoraMs) ? p : null,
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

  // Apito de resposta: toca uma vez sempre que algum item do Diário de
  // Bordo já existente muda de statusLabel — é isso que sinaliza que a
  // marina respondeu a alguma solicitação (confirmou uma descida/subida,
  // respondeu um pedido de combustível, avançou uma manutenção, mudou o
  // S.O.S. de etapa, etc). Mesma técnica "só a partir da atualização
  // seguinte" já usada no apito administrativo (ver SonsPainelAdmin.jsx):
  // não compara contra o item mais antigo que HISTORICO_JANELA_MS, nem
  // dispara pra item novo (uma solicitação nova é ação do próprio cliente,
  // não uma resposta recebida) — só quando um id que já existia troca de
  // rótulo. Desligado por "Silenciar notificações" (engrenagem, ver
  // notificacoesSilenciadas acima).
  const chaveStatusDiario = diarioDeBordo.map((item) => `${item.id}:${item.statusLabel}`).sort().join(',')
  useEffect(() => {
    const atual = new Map(diarioDeBordo.map((item) => [item.id, item.statusLabel]))
    if (statusDiarioConhecidoRef.current === null || cargasCompletadasRef.current <= 1) {
      statusDiarioConhecidoRef.current = atual
      return
    }
    const anterior = statusDiarioConhecidoRef.current
    let mudou = false
    atual.forEach((statusLabel, id) => {
      if (anterior.has(id) && anterior.get(id) !== statusLabel) mudou = true
    })
    if (mudou && !notificacoesSilenciadas) tocarApitoRespostaDiario()
    statusDiarioConhecidoRef.current = atual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveStatusDiario, notificacoesSilenciadas])

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
  const agora = agoraMs
  // Regra do Diário de Bordo: Registro → Diário de Bordo → após 1 dia →
  // Histórico.
  //
  // Uma solicitação concluída não sai mais na hora: ela ainda fica 1 dia no
  // Diário (DIARIO_JANELA_MS, contado a partir do registro — `item.quando`,
  // que vem sempre de uma data real do banco: data_hora, created_at,
  // data_abertura ou data_solicitacao, conforme o tipo). Passado o prazo,
  // deixa de aparecer aqui e segue no Histórico de Solicitações.
  //
  // Uma solicitação AINDA EM ABERTO continua no Diário sem prazo, como
  // sempre foi — some daqui só depois de concluída e cumprido o dia. Sem
  // isso, um pedido pendente há mais de um dia (uma descida não atendida,
  // um S.O.S. em andamento) desapareceria da tela do cliente justamente
  // enquanto ainda precisa de atenção.
  //
  // Nada é apagado nem copiado: é o mesmo registro, deixando de ser listado
  // aqui e seguindo visível no Histórico.
  const diarioAtivo = diarioDeBordo.filter((item) => {
    if (limpoEm && new Date(item.quando) <= limpoEm) return false
    if (item.statusClasse !== 'em-dia') return true
    return agora - new Date(item.quando).getTime() <= DIARIO_JANELA_MS
  })
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

  // Abre o pedido de abastecimento. A checagem de cadastro do RV Marine
  // (telefone + pelo menos uma embarcação) é a mesma da descida e da subida:
  // sem embarcação não há o que abastecer, e sem telefone a marina não tem
  // como responder.
  function abrirModalAbastecimento() {
    if (!cadastroRvMarineOk()) return
    if (combustiveis.length === 0) {
      mostrarAviso('A marina ainda não cadastrou os tipos de combustível disponíveis.')
      return
    }
    setFormAbastecimento({ embarcacao_id: embarcacoes[0]?.id || '', combustivel_id: combustiveis[0]?.id || '', quantidade_litros: '', completarTanque: false })
    setModalAbastecimentoAberto(true)
  }

  // Encontra o agendamento (descida/subida) em aberto mais próximo dessa
  // embarcação, pra já vincular o pedido à linha certa da Fila de Rampa —
  // sem precisar perguntar isso ao cliente.
  function agendamentoRelevante(embarcacaoId) {
    const ativos = agendamentos.filter((a) => a.embarcacao_id === embarcacaoId && a.status === 'solicitado')
    if (ativos.length === 0) return null
    return ativos.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))[0]
  }

  // Registra o pedido. Sem preço, sem valor total, sem QR: as colunas
  // financeiras da tabela ficam em NULL (passaram a aceitar isso na
  // migration_abastecimento_sem_financeiro.sql) em vez de receberem um zero
  // que depois alguém leria como "de graça".
  //
  // "Completar tanque" é o caso de quem não sabe quantos litros faltam — só
  // se sabe depois de encher. Vai com quantidade_litros = 0 (a coluna
  // continua NOT NULL) e o marcador de sempre em observacoes, a mesma
  // convenção dos pedidos que já estavam no banco.
  //
  // Todo pedido nasce em 'solicitado' e a partir daí o relógio corre: 15
  // minutos sem cancelamento e ele vale como confirmado (ver
  // lib/statusAbastecimento.js).
  async function enviarAbastecimento(e) {
    e.preventDefault()
    if (!cliente) return
    const completarTanque = formAbastecimento.completarTanque
    const litros = completarTanque ? 0 : Number(formAbastecimento.quantidade_litros)
    if (!completarTanque && !(litros > 0)) {
      mostrarAviso('Informe quantos litros, ou marque "Completar tanque".')
      return
    }
    setEnviandoAbastecimento(true)
    try {
      const agendamento = agendamentoRelevante(formAbastecimento.embarcacao_id)
      await solicitarAbastecimento({
        marina_id: cliente.marina_id,
        cliente_id: cliente.id,
        embarcacao_id: formAbastecimento.embarcacao_id || null,
        agendamento_id: agendamento?.id || null,
        combustivel_id: formAbastecimento.combustivel_id,
        quantidade_litros: litros,
        status: 'solicitado',
        observacoes: completarTanque ? OBSERVACAO_COMPLETAR_TANQUE : null,
      })
      setModalAbastecimentoAberto(false)
      mostrarAviso('Pedido enviado. A marina tem 15 minutos para confirmar ou cancelar.')
      await carregar()
    } catch (err) {
      alert('Não foi possível enviar o pedido: ' + err.message)
    } finally {
      setEnviandoAbastecimento(false)
    }
  }

  return (
    <div className="painel-cliente" style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <img
        src="/rv-invictus-logo.png"
        alt="RV Invictus · Consultoria e Gestão de Processos"
        className="pagina-cliente-logo"
      />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Nome da marina vem do banco (mesmo padrão do RV e-Náutica,
              TelaClienteENautica.jsx) — antes ficava fixo em texto
              ("Marina Paulo Prates"), o que estava certo enquanto só
              existia essa marina, mas passou a mostrar o nome errado para
              clientes de qualquer outro tenant (ex: CCPP) assim que o RV
              Marine passou a atender mais de uma marina. */}
          <strong className="painel-cliente-marina">{marina?.nome || 'RV Marine'}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* "Sair" aqui não desloga — só volta pra seleção de aplicações
              (mesmo padrão do RV e-Náutica e do "Voltar" nas telas de "Em
              construção"/"Não contratada" em App.jsx). A sessão do
              Supabase segue ativa. */}
          <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} title="Sair" aria-label="Sair"
            onClick={() => (onVoltar ? onVoltar() : supabase.auth.signOut())}>
            <IconLogout size={16} />
          </button>
          {cliente && (
            <MenuConfigCliente
              autorizadosCount={autorizados.filter((a) => a.ativo).length}
              onAbrirAutorizados={abrirModalAutorizados}
              onAbrirMinhaConta={abrirModalDados}
              onAbrirHistorico={() => setModalHistoricoAberto(true)}
              notificacoesSilenciadas={notificacoesSilenciadas}
              onAlternarNotificacoes={alternarNotificacoes}
              cadastroPendente={faltandoParaRvMarine(cliente, embarcacoes).length > 0}
            />
          )}
        </div>
      </header>

      {erroCarregamento && (
        <div className="erro" style={{ marginBottom: 12 }}>
          Não foi possível atualizar seus dados agora ({erroCarregamento}). Tente recarregar a página.
        </div>
      )}

      {!carregando && !cliente && !erroCarregamento && <p>Seu cadastro ainda está em análise pela administração da marina.</p>}

      {cliente && (
        <>
          {/* A faixa de status só aparece quando há algo que IMPEDE o cliente
              de usar a Agenda — hoje isso significa apenas suspensão
              administrativa. Em situação normal ela não existe: o painel do
              cliente não carrega aviso permanente de que está tudo certo. */}
          {(() => {
            const statusAgenda = statusAgendaCliente(cliente)
            if (statusAgenda.liberado || !statusAgenda.texto) return null
            return (
              <p className={`status-texto ${statusAgenda.classe}`} style={{ textAlign: 'center', display: 'block', marginBottom: 12 }}>
                <IconLock size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
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
              disabled={enviandoResgate || (agendamentoNavegando && STATUS_RESGATE_CANCELAVEIS.includes(agendamentoNavegando.resgate_status))}
              onClick={solicitarResgate}
            >
              <IconLifebuoy size={20} />
              {!agendamentoNavegando
                ? 'S.O.S.'
                : enviandoResgate
                  ? 'Enviando...'
                  : MENSAGEM_BOTAO_RESGATE[agendamentoNavegando.resgate_status] || 'S.O.S. · Solicitar resgate'}
            </button>

            {/* O antigo botão "Serviços" abria um seletor com quatro
                opções; três migraram para os outros SaaS (Manutenção → RV
                Manut, Regularização → RV NautDoc, Pagamentos → RV Finance).
                Sobrou o abastecimento, que virou botão direto — e sem nada
                de financeiro: o cliente pede, a marina confirma, e o valor
                se acerta fora do RV Marine. */}
            <button type="button" className="painel-cliente-btn painel-cliente-btn-servicos" onClick={abrirModalAbastecimento}>
              <IconGasStation size={20} /> Abastecimento
            </button>
          </div>

          <h3 className="diario-titulo">Diário de Bordo</h3>
          <div className="lista-cards diario-lista">
            {diarioAtivo.length === 0 && <p className="dica">Nenhum registro ainda.</p>}
            {diarioAtivo.map((item) => {
              const Icone = item.icone
              return (
                // Ícone e título na MESMA linha, no topo do cartão; detalhe e
                // status abaixo, alinhados sob o título. O layout antigo
                // empilhava o ícone acima do título: o estilo inline definia
                // display:flex mas não a direção, e .cliente-card já é uma
                // coluna — então o ícone virava a primeira "linha" do cartão.
                <div key={item.id} className="cliente-card diario-item">
                  <div className="diario-item-topo">
                    <Icone size={20} className="diario-item-icone" />
                    <b>{item.titulo}</b>
                  </div>
                  <div className="diario-item-corpo">
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
            <h3>{modalTipo === 'retirada' ? 'Solicitar descida' : 'Solicitar atracação'}</h3>
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

      {/* O painel "Serviços" foi removido: Manutenção passou ao RV Manut,
          Regularização ao RV NautDoc e Pagamentos ao RV Finance. O
          abastecimento voltou como botão direto, e o modal abaixo é todo
          ele — o pedido e nada mais. Os modais "Pedido registrado", o QR de
          pagamento e a lista "Pagamentos" não voltaram: cobrança não existe
          dentro do RV Marine. Nada foi apagado do banco. */}

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
              {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>

            {/* "Completar tanque" para quem não sabe quantos litros faltam —
                marcando aqui, o campo de litros some, porque não haveria o
                que preencher. */}
            <label className="opcao-checkbox">
              <input type="checkbox" checked={formAbastecimento.completarTanque}
                onChange={(e) => setFormAbastecimento({ ...formAbastecimento, completarTanque: e.target.checked, quantidade_litros: '' })} />
              Completar tanque
            </label>

            {formAbastecimento.completarTanque ? (
              <p className="dica">
                Sem quantidade fechada — a marina completa o tanque e o acerto é feito com a administração.
              </p>
            ) : (
              <input type="number" required min="1" step="1" placeholder="Litros"
                value={formAbastecimento.quantidade_litros}
                onChange={(e) => setFormAbastecimento({ ...formAbastecimento, quantidade_litros: e.target.value })} />
            )}

            <p className="dica">
              A marina tem 15 minutos para confirmar ou cancelar. Passado esse prazo, o pedido é
              confirmado automaticamente. Você pode cancelar dentro dessa janela pelo Diário de Bordo.
            </p>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAbastecimentoAberto(false)}>Cancelar</button>
              <button type="submit" disabled={enviandoAbastecimento}>{enviandoAbastecimento ? 'Enviando...' : 'Confirmar pedido'}</button>
            </div>
          </form>
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
              <input placeholder="Telefone (opcional)" inputMode="numeric" maxLength={15} value={formAutorizado.telefone}
                onChange={(e) => setFormAutorizado({ ...formAutorizado, telefone: maskTelefone(e.target.value) })} />
              <button type="submit" disabled={salvandoAutorizado}>{salvandoAutorizado ? 'Adicionando...' : '+ Adicionar autorizado'}</button>
            </form>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAutorizadosAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* "Minha conta": editável, a pedido explícito — o cliente corrige o
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
            <h3>Minha conta</h3>
            <p className="dica">Esses dados também aparecem para a administração da marina.</p>
            <input placeholder="Nome completo" required value={formDados.nome}
              onChange={(e) => setFormDados({ ...formDados, nome: e.target.value })} />
            <input placeholder="CPF" inputMode="numeric" maxLength={14} value={formDados.cpf_cnpj}
              onChange={(e) => setFormDados({ ...formDados, cpf_cnpj: maskCpf(e.target.value) })} />
            <input placeholder="Nº da Carteira de Habilitação de Amador (CHA)" value={formDados.documento_identidade}
              onChange={(e) => setFormDados({ ...formDados, documento_identidade: e.target.value })} />
            <input type="email" placeholder="E-mail (login)" value={formDados.email}
              onChange={(e) => setFormDados({ ...formDados, email: e.target.value })} />
            <input placeholder="Telefone" inputMode="numeric" maxLength={15} value={formDados.telefone}
              onChange={(e) => setFormDados({ ...formDados, telefone: maskTelefone(e.target.value) })} />
            <input placeholder="Endereço (rua, bairro)" value={formDados.endereco}
              onChange={(e) => setFormDados({ ...formDados, endereco: e.target.value })} />
            <div className="cadastro-linha-endereco">
              <input placeholder="Número" value={formDados.numero_casa}
                onChange={(e) => setFormDados({ ...formDados, numero_casa: e.target.value })} />
              <input placeholder="Complemento" value={formDados.complemento}
                onChange={(e) => setFormDados({ ...formDados, complemento: e.target.value })} />
            </div>

            {/* Embarcações: saíram do cadastro inicial (que virou só a conta
                da plataforma) e passaram a ser completadas aqui, já dentro do
                RV Marine. Salvam separado dos dados pessoais acima, cada uma
                na hora em que é adicionada — são tabelas diferentes. A marina
                também pode cadastrar pelo Painel de Controle; os dois
                caminhos convivem. */}
            {/* O campo "Trocar senha" saiu de "Minha conta" a pedido — troca
                de senha deixou de ser feita por aqui. */}

            <div className="minha-conta-secao">
              <p className="minha-conta-secao-titulo">Embarcações</p>
              {embarcacoes.length === 0 && (
                <p className="embarcacao-vazia">Nenhuma embarcação cadastrada.</p>
              )}
              {embarcacoes.length > 0 && (
                <p className="dica" style={{ margin: '0 0 6px' }}>Corrija o nome e clique em Salvar; apagar o nome e salvar exclui a embarcação.</p>
              )}
              {embarcacoes.map((emb) => {
                const nomeAtual = nomesEmbarcacaoEditados[emb.id] ?? emb.nome
                const alterado = nomeAtual.trim() !== emb.nome
                return (
                  <div key={emb.id} className="embarcacao-item">
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {/* size (não width/flex) faz a caixa acompanhar o
                          tamanho do nome digitado, em vez de esticar pro
                          resto da linha — mesmo ajuste já feito no lado do
                          Administrador (TelaClientes.jsx); mínimo de 6 pra
                          não colapsar com o campo vazio. */}
                      <input size={Math.max(nomeAtual.length, 6)} value={nomeAtual}
                        onChange={(e) => setNomesEmbarcacaoEditados({ ...nomesEmbarcacaoEditados, [emb.id]: e.target.value })} />
                      <button type="button" className="voltar" disabled={!alterado || salvandoEdicaoEmbarcacaoId === emb.id}
                        onClick={() => salvarNomeEmbarcacao(emb)}>
                        {salvandoEdicaoEmbarcacaoId === emb.id ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                    <span className="embarcacao-tipo">{emb.tipo}{emb.registro ? ` · ${emb.registro}` : ''}</span>
                  </div>
                )
              })}
              {!novaEmbarcacaoAberta && (
                <button type="button" className="voltar" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setNovaEmbarcacaoAberta(true)}>
                  + Adicionar embarcação
                </button>
              )}
              {novaEmbarcacaoAberta && (
                <>
                  <select value={novaEmbarcacao.tipo}
                    onChange={(e) => setNovaEmbarcacao({ ...novaEmbarcacao, tipo: e.target.value })}>
                    {TIPOS_EMBARCACAO.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input placeholder="Nome da embarcação" value={novaEmbarcacao.nome}
                    onChange={(e) => setNovaEmbarcacao({ ...novaEmbarcacao, nome: e.target.value })} />
                  <input placeholder="Número de inscrição (opcional)" value={novaEmbarcacao.registro}
                    onChange={(e) => setNovaEmbarcacao({ ...novaEmbarcacao, registro: e.target.value })} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="voltar"
                      disabled={salvandoEmbarcacao || !novaEmbarcacao.nome.trim()}
                      onClick={adicionarEmbarcacao}>
                      {salvandoEmbarcacao ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button type="button" disabled={salvandoEmbarcacao} onClick={cancelarNovaEmbarcacao}>
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalDadosAberto(false)}>Cancelar</button>
              <button type="submit" disabled={salvandoDados}>{salvandoDados ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Histórico de Solicitações: TODA solicitação já feita pelo cliente
          (descida/subida, S.O.S., manutenção, regularização,
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

      {/* Aviso temporário — flutua sobre o painel e some sozinho (ver
          mostrarAviso). Não empurra nada da tela, então não muda o layout. */}
      {aviso && <div className="aviso-temporario" role="status">{aviso}</div>}

      {/* Mesma assinatura do rodapé do Painel de Controle: identifica a
          aplicação (RV Marine) e credita a RV Invictus. As telas de entrada
          — login, cadastro e seleção de aplicações — seguem com "Developed
          by", porque ali o usuário ainda não escolheu aplicação nenhuma. */}
      <a className="pagina-cliente-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">RV Marine by RVinvictus.com.br</a>
    </div>
  )
}
