import { useEffect, useRef, useState } from 'react'
import { IconLogout, IconHome, IconPlayerPlay, IconCalendarEvent, IconCertificate, IconUserCircle, IconBell } from '@tabler/icons-react'
import { supabase, db } from '../lib/supabase'
import { buscarMarina, salvarCliente } from '../lib/db'
import {
  HABILITACOES, labelHabilitacao, camposDocumentoFaltando, CAMPOS_DOCUMENTO, buscarMinhaMatricula, enviarMatricula,
  modulosAulaComVideo, aulasConcluidas, alternarAulaConcluida,
  listarMeusAgendamentos, listarMeusCertificados, labelTipoAgendamento,
  listarMinhasNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas,
  declararProntidaoTeste,
  solicitarReagendamento,
} from '../lib/enautica'
import { maskData, dataMascaradaParaIso, isoParaDataMascarada, maskTelefone } from '../lib/mascaras'
import { abrirCertificado } from '../lib/enauticaDocumentos'

// Área do aluno no RV e-Náutica — mesma linguagem visual do painel do
// cliente do RV Marine (TelaClienteDashboard.jsx): wrapper ".painel-cliente",
// logo no topo, header com o nome do tenant + sair. Sem NENHUMA etapa de
// pagamento (ao contrário do AlunoFlow.jsx original do rsnautica) — o único
// "gate" é a matrícula ser aprovada pela equipe da escola.
//
// Aulas, Agendamentos e Meus certificados têm conteúdo real, ligado ao
// Supabase (matrículas/agendamentos/certificados de enautica) — só o vídeo
// de cada aula preparatória é opcional (ver ConfiguracoesENautica.jsx: sem
// a escola cadastrar o link, a aula mostra "Conteúdo em preparação").
//
// NÃO existe (nunca existiu de verdade, a pedido do Alex) uma aba de
// "Documentos" aqui: os 4 documentos de matrícula não são entregues pelo
// aluno — são gerados pela ESCOLA a partir dos dados da matrícula (ver
// ModalDocumentosAluno.jsx, aberto pelo Painel de Controle). O aluno só
// entra nisso preenchendo os dados corretamente — por isso "Meus dados"
// abaixo cobre também os campos de documento (RG, endereço etc.), não só
// nome/e-mail/telefone: sem um jeito de corrigir um dado errado depois de
// enviado, um RG digitado errado ficava travado pra sempre.
const ABAS_ALUNO = [
  { chave: 'inicio', label: 'Início', Icone: IconHome },
  { chave: 'aulas', label: 'Aulas preparatórias', Icone: IconPlayerPlay },
  { chave: 'agenda', label: 'Agendamentos', Icone: IconCalendarEvent },
  { chave: 'certs', label: 'Meus certificados', Icone: IconCertificate },
  { chave: 'dados', label: 'Meus dados', Icone: IconUserCircle },
]

// "Início" (aba nova, a pedido do Alex) — um guia de estudos da trilha
// completa até a Carteira de Habilitação de Amador (CHA), pra quem acabou
// de ser aprovado e não sabe bem o que vem a seguir. É só leitura (nenhum
// dado do Supabase aqui) e por isso fica fora do carregar()/estado do
// componente — cada passo aponta pra aba de verdade onde a ação acontece.
// Os números da prova teórica (quantidade de questões, nota mínima) são
// informação pública sobre o exame da autoridade marítima para Arrais
// Amador — não são específicos da RV Invictus nem inventados — mas o texto
// avisa que podem variar conforme a Capitania, porque a escola é quem
// confirma o formato exato com o aluno antes da prova.
const TRILHA_INICIO = [
  {
    onde: 'Aba "Aulas preparatórias"',
    titulo: 'Assista às aulas preparatórias',
    texto: 'Estude no seu ritmo pelos módulos em vídeo liberados pela escola. Marque cada um como concluído conforme for terminando.',
  },
  {
    onde: 'Aba "Agendamentos"',
    titulo: 'Avise que está pronto para a prova teórica',
    texto: 'Quando se sentir preparado, responda "Sim, estou pronto(a)" no card de prova teórica. A escola vê seu aviso e entra em contato para agendar.',
  },
  {
    onde: 'Na Capitania dos Portos',
    titulo: 'Realize a prova teórica',
    texto: 'A avaliação teórica é aplicada diretamente pela autoridade marítima (Capitania dos Portos), não pela escola. Costuma ser de múltipla escolha, com cerca de 20 questões sobre nomenclatura náutica, segurança da navegação, mecânica e motores, meteorologia e regras de tráfego aquaviário, exigindo em torno de 50% de acertos para aprovação — confirme o formato exato com a escola antes da data, pois pode variar conforme a Capitania.',
  },
  {
    onde: 'Aba "Agendamentos"',
    titulo: 'Aprovado na teórica, solicite a prova prática',
    texto: 'Com a teórica concluída, peça à escola o agendamento da avaliação prática (o mesmo card acima, ou diretamente com seu instrutor).',
  },
  {
    onde: 'Sino de notificações',
    titulo: 'Você recebe a data da aula prática',
    texto: 'A escola marca o compromisso e você é avisado por notificação aqui dentro, com data, hora e local.',
  },
  {
    onde: 'Na escola',
    titulo: 'Realize a aula/avaliação prática',
    texto: 'Acontece presencialmente na escola, com instrutores habilitados da RV Invictus.',
  },
  {
    onde: 'Feito pela escola',
    titulo: 'Seu processo é expedido na Capitania',
    texto: 'Com as duas etapas concluídas, a escola monta e protocola seu processo junto à Capitania dos Portos.',
  },
  {
    onde: 'App Gov.br',
    titulo: 'Sua CHA chega pelo Gov.br',
    texto: 'No prazo definido pela autoridade marítima, sua Carteira de Habilitação de Amador (arrais/motonauta) é emitida e passa a ficar disponível direto no seu app Gov.br.',
  },
]

function TelaInicio() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="dica">Do estudo até a sua carteira na mão (ou melhor, no app): veja o caminho completo, passo a passo.</p>
      {TRILHA_INICIO.map((passo, i) => (
        <div key={passo.titulo} className="cliente-card">
          <div className="cabecalho-cliente">
            <div className="titulo-cliente">
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: '50%', background: 'var(--cor-primaria)', color: '#fff',
                  fontSize: 12, fontWeight: 700, marginRight: 8, flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span className="nome">{passo.titulo}</span>
            </div>
          </div>
          <div className="dica" style={{ fontWeight: 600, margin: '2px 0 4px' }}>{passo.onde}</div>
          <div className="linha">{passo.texto}</div>
        </div>
      ))}
    </div>
  )
}

// Sino de notificações — substitui, dentro da própria plataforma, o que no
// rsnautica (referência operacional) era um e-mail avulso a cada matrícula
// decidida/agendamento marcado/certificado emitido (ver criarNotificacao em
// lib/enautica.js). Mesmo padrão visual/comportamento de menu suspenso do
// MenuConfigCliente do RV Marine (clique fora fecha, veja
// TelaClienteDashboard.jsx): abre a lista, marcar uma lida ou "Marcar todas
// como lidas" no rodapé.
function SinoNotificacoes({ notificacoes, onAbrirUma, onMarcarTodasLidas }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  const naoLidas = notificacoes.filter((n) => !n.lida).length

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  return (
    <div className="menu-acoes" ref={ref}>
      <button type="button" className="nav-item" style={{ color: 'var(--cor-primaria)', position: 'relative' }}
        title="Notificações" aria-label="Notificações" onClick={() => setAberto(!aberto)}>
        <IconBell size={16} />
        {naoLidas > 0 && <span className="ponto-pendencia" aria-hidden="true" style={{ position: 'absolute', top: 2, right: 2 }} />}
      </button>
      {aberto && (
        <div className="menu-acoes-dropdown" style={{ width: 280, maxHeight: 320, overflowY: 'auto' }}>
          {notificacoes.length === 0 && <p className="dica" style={{ padding: 8 }}>Nenhuma notificação ainda.</p>}
          {notificacoes.map((n) => (
            <button key={n.id} type="button" onClick={() => onAbrirUma(n)}
              style={{ textAlign: 'left', whiteSpace: 'normal', fontWeight: n.lida ? 400 : 700 }}>
              {n.titulo}
              {n.mensagem && <div className="dica" style={{ fontWeight: 400, margin: '2px 0 0' }}>{n.mensagem}</div>}
            </button>
          ))}
          {naoLidas > 0 && (
            <button type="button" onClick={() => { onMarcarTodasLidas(); setAberto(false) }}>Marcar todas como lidas</button>
          )}
        </div>
      )}
    </div>
  )
}

export default function TelaClienteENautica({ perfil, onVoltar }) {
  const [cliente, setCliente] = useState(null)
  // Enquanto true, ainda não sabemos se existe cadastro ou não — usado só
  // pra não piscar "Seu cadastro ainda está em análise" durante a primeira
  // busca (ver useEffect/carregar abaixo): sem isso, `cliente` começa como
  // `null` e esse aviso aparecia por uma fração de segundo em TODO
  // carregamento, mesmo quando o cadastro já existe e vai aparecer no
  // instante seguinte.
  const [carregando, setCarregando] = useState(true)
  const [matricula, setMatricula] = useState(null)
  const [marina, setMarina] = useState(null)
  const [erroCarregamento, setErroCarregamento] = useState(null)
  const [aba, setAba] = useState('inicio')
  const [agendamentos, setAgendamentos] = useState([])
  const [certificados, setCertificados] = useState([])
  const [concluidas, setConcluidas] = useState(() => new Set())
  const [notificacoes, setNotificacoes] = useState([])

  const [habilitacao, setHabilitacao] = useState('arrais')
  const [formFaltando, setFormFaltando] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState(null)
  const [modalMatriculaAberto, setModalMatriculaAberto] = useState(false)
  const [aceitouPrivacidade, setAceitouPrivacidade] = useState(false)

  // "Meus dados" (aba 'dados') — era só leitura, com um texto avisando
  // "edição chega numa próxima fase". Agora edita de verdade, reaproveitando
  // salvarCliente (mesma função do RV Marine) — os dados moram na mesma
  // tabela (marina.clientes), então não precisa de nada novo no banco.
  // `editandoDados`/`formDados` só existem enquanto o aluno está de fato
  // editando; fora disso a aba mostra os valores como texto simples, igual
  // antes.
  const [editandoDados, setEditandoDados] = useState(false)
  const [formDados, setFormDados] = useState(null)
  const [salvandoDados, setSalvandoDados] = useState(false)
  const [erroDados, setErroDados] = useState(null)

  // "Estou pronto para a prova teórica" — ver declararProntidaoTeste em
  // lib/enautica.js. `alterandoProntidao` reabre a pergunta mesmo depois de
  // já ter respondido (mesmo botão "Alterar resposta" do rsnautica).
  const [salvandoProntidao, setSalvandoProntidao] = useState(false)
  const [alterandoProntidao, setAlterandoProntidao] = useState(false)

  async function responderProntidao(resposta) {
    setSalvandoProntidao(true)
    try {
      await declararProntidaoTeste(matricula.id, resposta)
      setMatricula((m) => ({ ...m, pronto_teste: resposta }))
      setAlterandoProntidao(false)
    } catch (err) {
      alert('Não foi possível salvar sua resposta: ' + err.message)
    } finally {
      setSalvandoProntidao(false)
    }
  }

  // Além de nome/e-mail/telefone, "Meus dados" também edita os campos que
  // entram nos documentos de matrícula (RG, endereço etc. — CAMPOS_DOCUMENTO
  // em lib/enautica.js). Antes esses campos só eram perguntados UMA vez, na
  // hora da matrícula, e só se estivessem vazios (camposDocumentoFaltando)
  // — um RG digitado errado nunca tinha como ser corrigido depois, porque
  // "já preenchido" fazia o campo nem aparecer de novo no formulário. Aqui
  // o aluno vê e corrige o que quiser, a qualquer momento.
  function abrirEdicaoDados() {
    const extras = {}
    CAMPOS_DOCUMENTO.forEach((c) => {
      extras[c.chave] = c.tipo === 'date' ? isoParaDataMascarada(cliente[c.chave]) : (cliente[c.chave] || '')
    })
    setFormDados({
      nome: cliente.nome || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      ...extras,
    })
    setErroDados(null)
    setEditandoDados(true)
  }

  async function salvarMeusDados(e) {
    e.preventDefault()
    setErroDados(null)
    // A data de nascimento chega mascarada (dd/mm/aaaa) — a coluna no banco
    // é `date` e espera aaaa-mm-dd, mesma conversão que o formulário de
    // matrícula já faz (enviarPedido, abaixo).
    const campos = { ...formDados }
    if (campos.data_nascimento) {
      const iso = dataMascaradaParaIso(campos.data_nascimento)
      if (!iso) { setErroDados('Data de nascimento inválida.'); return }
      campos.data_nascimento = iso
    } else {
      campos.data_nascimento = null
    }
    setSalvandoDados(true)
    // Mesmo cuidado do RV Marine (TelaClienteDashboard.jsx/enviarMeusDados):
    // "E-mail" aqui é o mesmo campo usado pra entrar no sistema, então trocar
    // só marina.clientes.email deixaria o aluno vendo um e-mail diferente do
    // que ele efetivamente usa pra logar. Se o valor mudou, atualiza o login
    // (Supabase Auth) também — que exige confirmação por link antes de valer
    // de verdade, por isso o aviso ao final.
    const emailAtual = (cliente.email || '').trim().toLowerCase()
    const emailNovo = (campos.email || '').trim().toLowerCase()
    const trocouEmail = emailNovo && emailNovo !== emailAtual
    try {
      await salvarCliente({ id: cliente.id, ...campos })
      if (trocouEmail) {
        const { error } = await supabase.auth.updateUser({ email: emailNovo })
        if (error) throw error
      }
      setEditandoDados(false)
      await carregar()
      if (trocouEmail) alert('Dados salvos. Confirme o link enviado ao novo e-mail para passar a entrar com ele.')
    } catch (err) {
      setErroDados(err.message)
    } finally {
      setSalvandoDados(false)
    }
  }

  async function carregar() {
    try {
      const { data: cli, error: erroCli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
      if (erroCli) throw erroCli
      setCliente(cli)
      setErroCarregamento(null)
      if (!cli) return
      const [mat, mar, ags, certs, notifs] = await Promise.all([
        buscarMinhaMatricula(cli.id),
        buscarMarina(cli.marina_id),
        listarMeusAgendamentos(cli.id),
        listarMeusCertificados(cli.id),
        listarMinhasNotificacoes(cli.id),
      ])
      setMatricula(mat)
      setMarina(mar)
      setAgendamentos(ags)
      setCertificados(certs)
      setNotificacoes(notifs)
      setConcluidas(aulasConcluidas(cli.id))
    } catch (err) {
      setErroCarregamento(err.message)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [perfil?.id])

  // Realtime: a aprovação/recusa feita pela equipe da escola aparece na hora,
  // sem precisar recarregar a página — mesmo padrão do RV Marine.
  useEffect(() => {
    if (!cliente?.id) return
    const canal = supabase
      .channel(`enautica-minha-matricula-${cliente.id}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'matriculas', filter: `cliente_id=eq.${cliente.id}` }, () => carregar())
      // Certificados filtram por cliente_id igual matrículas; agendamentos
      // não têm essa coluna (é `alunos_ids`, um array — não dá pra filtrar
      // no `filter:` do realtime), então escuta a tabela inteira da escola
      // e recarrega, deixando o RLS/query decidir o que é meu na hora do
      // `carregar()`. Tráfego baixo (poucos agendamentos por escola).
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'certificados', filter: `cliente_id=eq.${cliente.id}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos' }, () => carregar())
      // Notificação nova (matrícula decidida, agendamento marcado,
      // certificado emitido) aparece no sino na hora, sem F5.
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'notificacoes', filter: `cliente_id=eq.${cliente.id}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id])

  async function enviarPedido(e) {
    e.preventDefault()
    setErroEnvio(null)
    // Data de nascimento chega mascarada (dd/mm/aaaa) — a coluna no banco é
    // `date` e espera aaaa-mm-dd. Convertida aqui, na saída, pra não mexer
    // no formato que o resto da tela usa (dadosFaltando/formFaltando ficam
    // sempre com o texto mascarado, igual o aluno está vendo).
    const dadosFaltando = { ...formFaltando }
    if (dadosFaltando.data_nascimento) {
      const iso = dataMascaradaParaIso(dadosFaltando.data_nascimento)
      if (!iso) { setErroEnvio('Data de nascimento inválida.'); return }
      dadosFaltando.data_nascimento = iso
    }
    setEnviando(true)
    try {
      await enviarMatricula({
        clienteId: cliente.id, marinaId: cliente.marina_id, habilitacao, dadosFaltando,
      })
      await carregar()
      setModalMatriculaAberto(false)
    } catch (err) {
      setErroEnvio(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const camposFaltando = cliente ? camposDocumentoFaltando(cliente) : []

  function marcarAula(moduloId, concluida) {
    setConcluidas(alternarAulaConcluida(cliente.id, moduloId, concluida))
  }

  // Antes gerava um .txt cru (conferi o rsnautica: o "Baixar certificado" de
  // lá faz exatamente a mesma coisa — não existe um certificado formatado em
  // nenhum dos dois sistemas). Agora usa o mesmo motor de impressão dos
  // outros documentos (enauticaDocumentos.js/abrirCertificado), num desenho
  // próprio da RV Invictus — ver comentário em gerarCertificado().
  function baixarCertificado(cert) {
    const docConfig = marina?.config_json?.documentos || {}
    abrirCertificado(cert, cliente, marina, docConfig, labelHabilitacao)
  }

  async function abrirNotificacao(n) {
    if (n.lida) return
    try {
      await marcarNotificacaoLida(n.id)
      setNotificacoes((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida: true } : x)))
    } catch {
      // Falha ao marcar como lida não é grave — o aviso já foi visto na
      // hora do clique; a próxima abertura do sino tenta de novo sozinha.
    }
  }

  async function marcarTodasLidas() {
    if (!cliente) return
    try {
      await marcarTodasNotificacoesLidas(cliente.id)
      setNotificacoes((atual) => atual.map((x) => ({ ...x, lida: true })))
    } catch {
      // Mesma tolerância de abrirNotificacao acima.
    }
  }

  return (
    // minHeight em dvh (não vh): no celular, 100vh conta a altura da tela
    // INTEIRA, incluindo a área que a barra de ferramentas do navegador
    // ocupa quando está visível — como o rodapé abaixo usa marginTop:'auto'
    // pra ficar colado no fim desta coluna, ele acabava "empurrado" pra
    // baixo da barra, fora da área visível, e só aparecia rolando a
    // página. 100dvh é a altura realmente visível AGORA (já descontando a
    // barra), então o rodapé sobe junto e fica visível sem precisar rolar.
    <div className="painel-cliente" style={{ maxWidth: 480, margin: '0 auto', padding: 24, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <img src="/rv-invictus-logo.png" alt="RV Invictus · Consultoria e Gestão de Processos" className="pagina-cliente-logo" />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 24 }}>
        <strong className="painel-cliente-marina">{marina?.nome || 'RV e-Náutica'}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {cliente && (
            <SinoNotificacoes notificacoes={notificacoes} onAbrirUma={abrirNotificacao} onMarcarTodasLidas={marcarTodasLidas} />
          )}
          {/* "Sair" aqui não desloga — só volta pra seleção de aplicações
              (mesmo padrão do "Voltar" nas telas de "Em construção"/"Não
              contratada" em App.jsx). A sessão do Supabase segue ativa. */}
          <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} title="Sair" aria-label="Sair" onClick={() => (onVoltar ? onVoltar() : supabase.auth.signOut())}>
            <IconLogout size={16} />
          </button>
        </div>
      </header>

      {erroCarregamento && (
        <div className="erro" style={{ marginBottom: 12 }}>
          Não foi possível atualizar seus dados agora ({erroCarregamento}). Tente recarregar a página.
        </div>
      )}

      {!carregando && !cliente && !erroCarregamento && <p>Seu cadastro ainda está em análise pela administração.</p>}

      {/* Sem matrícula ainda: a tela inicial só oferece 3 botões, um por
          habilitação (ver HABILITACOES em lib/enautica.js) — escolher um
          abre o modal de pedido (padrão dourado/navy do resto do RV Marine,
          .modal-fundo + .modal-card) já com a habilitação decidida, e nele
          só entram os campos de documento que ainda faltam (ver
          camposDocumentoFaltando). Também cobre o caso de matrícula
          recusada: o aluno pode mandar um novo pedido pelos mesmos botões. */}
      {cliente && (!matricula || matricula.status === 'recusada') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matricula?.status === 'recusada' && (
            <p className="status-texto cancelado">
              Sua matrícula anterior foi recusada{matricula.motivo_recusa ? `: ${matricula.motivo_recusa}` : '.'} Você pode enviar um novo pedido abaixo.
            </p>
          )}
          {HABILITACOES.map((h) => (
            <button
              key={h.chave} type="button"
              className={`enautica-botao-habilitacao enautica-botao-habilitacao--${h.chave}`}
              onClick={() => { setHabilitacao(h.chave); setFormFaltando({}); setErroEnvio(null); setAceitouPrivacidade(false); setModalMatriculaAberto(true) }}
            >
              {h.label}
            </button>
          ))}
        </div>
      )}

      {modalMatriculaAberto && (
        <div className="modal-fundo" onClick={() => setModalMatriculaAberto(false)}>
          <form className="modal-card modal-card--matricula" onClick={(e) => e.stopPropagation()} onSubmit={enviarPedido}>
            <h3>Matrícula</h3>

            {/* Sem texto explicativo aqui (removido a pedido) — os campos
                abaixo são só os que faltam no cadastro do cliente (ver
                camposDocumentoFaltando em lib/enautica.js); a data de
                nascimento usa uma máscara dd/mm/aaaa em vez do seletor
                nativo <input type="date">, que destoa do tema escuro deste
                modal. O rótulo de cada campo vira só o placeholder — nada
                de título fora do preenchimento. */}
            {camposFaltando.map((c) => (
              <input
                key={c.chave} type="text" required inputMode={c.tipo === 'date' ? 'numeric' : undefined}
                placeholder={c.tipo === 'date' ? 'Data de nascimento (dd/mm/aaaa)' : c.label}
                value={formFaltando[c.chave] || ''}
                onChange={(e) => setFormFaltando({
                  ...formFaltando,
                  [c.chave]: c.tipo === 'date' ? maskData(e.target.value) : e.target.value,
                })}
              />
            ))}

            {erroEnvio && <p className="erro">{erroEnvio}</p>}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" required checked={aceitouPrivacidade} onChange={(e) => setAceitouPrivacidade(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>
                Li e aceito a{' '}
                <a href="https://rvinvictus.com.br/privacidade" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--cor-primaria)' }}>
                  Política de Privacidade
                </a>{' '}
                e autorizo o uso dos meus dados para fins de matrícula.
              </span>
            </label>

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalMatriculaAberto(false)}>Cancelar</button>
              <button type="submit" disabled={enviando || !aceitouPrivacidade}>{enviando ? 'Enviando…' : 'Enviar pedido'}</button>
            </div>
          </form>
        </div>
      )}

      {cliente && matricula?.status === 'pendente' && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <p className="status-texto pendente">Matrícula em análise</p>
          <p className="dica">Seu pedido para <b>{labelHabilitacao(matricula.habilitacao)}</b> está aguardando aprovação da escola. Você será avisado assim que a decisão sair.</p>
        </div>
      )}

      {cliente && matricula?.status === 'aprovada' && (
        <>
          <div className="abas" style={{ flexWrap: 'wrap' }}>
            {ABAS_ALUNO.map((a) => (
              <button key={a.chave} className={aba === a.chave ? 'ativo' : ''} onClick={() => setAba(a.chave)}>
                <a.Icone size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> {a.label}
              </button>
            ))}
          </div>

          {aba === 'inicio' && <TelaInicio />}

          {aba === 'aulas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {modulosAulaComVideo(marina).map((m) => (
                <div key={m.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente"><span className="nome">{m.titulo}</span></div>
                  </div>
                  <div className="linha">{m.desc}</div>
                  {m.youtubeId ? (
                    <div className="cliente-card-acoes">
                      <a
                        className="botao-secundario" style={{ textDecoration: 'none' }}
                        href={`https://www.youtube.com/watch?v=${m.youtubeId}`} target="_blank" rel="noopener noreferrer"
                      >
                        Assistir aula
                      </a>
                    </div>
                  ) : (
                    <p className="dica" style={{ margin: '6px 0 0' }}>Conteúdo em preparação pela escola.</p>
                  )}
                  <label className="opcao-checkbox" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={concluidas.has(m.id)} onChange={(e) => marcarAula(m.id, e.target.checked)} />
                    Marcar como concluída
                  </label>
                </div>
              ))}
            </div>
          )}

          {aba === 'agenda' && (
            <div className="lista-cards">
              <div className="cliente-card">
                <div className="cabecalho-cliente">
                  <div className="titulo-cliente"><span className="nome">Prova teórica</span></div>
                </div>
                {matricula.pronto_teste && !alterandoProntidao ? (
                  <>
                    <div className={`linha ${matricula.pronto_teste === 'sim' ? 'status-texto em-dia' : ''}`}>
                      {matricula.pronto_teste === 'sim'
                        ? 'Você declarou que está pronto(a) para a avaliação teórica. A escola vai entrar em contato para agendar.'
                        : 'Você disse que ainda não se sente pronto(a). Continue estudando e avise quando estiver.'}
                    </div>
                    <div className="cliente-card-acoes">
                      <button type="button" className="botao-secundario" onClick={() => setAlterandoProntidao(true)}>Alterar resposta</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="linha">Você está pronto(a) para agendar e realizar sua avaliação teórica?</div>
                    <div className="cliente-card-acoes">
                      <button type="button" className="botao-secundario" disabled={salvandoProntidao} onClick={() => responderProntidao('sim')}>
                        ✓ Sim, estou pronto(a)
                      </button>
                      <button type="button" className="botao-secundario" disabled={salvandoProntidao} onClick={() => responderProntidao('nao')}>
                        Ainda não
                      </button>
                    </div>
                  </>
                )}
              </div>

              {agendamentos.length === 0 && <p className="dica" style={{ textAlign: 'center' }}>Nenhum compromisso marcado ainda.</p>}
              {agendamentos.map((ag) => (
                <div key={ag.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente"><span className="nome">{labelTipoAgendamento(ag.tipo)}</span></div>
                  </div>
                  <div className="linha">
                    {new Date(`${ag.data}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {ag.hora}
                  </div>
                  <div className="linha"><b>Local:</b> {ag.local}</div>
                  <div className={`status-texto ${ag.status === 'confirmado' ? 'em-dia' : ag.status === 'concluido' ? '' : 'cancelado'}`}>
                    {ag.status === 'confirmado' ? 'Confirmado' : ag.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                  </div>
                </div>
              ))}

              {/* Reagendamento — sem cobrança (ao contrário do rsnautica). O aluno
                  solicita aqui; a escola vê o badge e entra em contato. */}
              <div className="cliente-card">
                <div className="cabecalho-cliente">
                  <div className="titulo-cliente"><span className="nome">Solicitar reagendamento</span></div>
                </div>
                <div className="linha" style={{ fontSize: 13 }}>
                  Em caso de reprovação na avaliação teórica, solicite aqui seu reagendamento. A escola entrará em contato.
                </div>
                {matricula.reagendamento_solicitado ? (
                  <div className="linha status-texto em-dia">✓ Solicitação enviada. Aguarde o contato da escola.</div>
                ) : (
                  <div className="cliente-card-acoes">
                    <button
                      type="button" className="botao-secundario"
                      onClick={async () => {
                        if (!window.confirm('Confirma a solicitação de reagendamento da avaliação teórica?')) return
                        try {
                          await solicitarReagendamento(matricula.id)
                          setMatricula((m) => ({ ...m, reagendamento_solicitado: true }))
                        } catch (err) {
                          alert('Erro ao solicitar: ' + err.message)
                        }
                      }}
                    >
                      Solicitar reagendamento
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {aba === 'certs' && (
            <div className="lista-cards">
              <p className="dica">
                Este é um recibo interno da escola, não o documento oficial — sua habilitação náutica é emitida
                pela Marinha do Brasil e chega automaticamente na sua conta Gov.br depois da aprovação.
              </p>
              {certificados.length === 0 && <p className="dica" style={{ textAlign: 'center' }}>Nenhum certificado disponível ainda.</p>}
              {certificados.map((c) => (
                <div key={c.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente"><span className="nome">{labelHabilitacao(c.habilitacao)}</span></div>
                  </div>
                  <div className="linha"><b>Emitido em:</b> {new Date(`${c.data_emissao}T12:00`).toLocaleDateString('pt-BR')}</div>
                  <div className="linha"><b>Status:</b> {c.status === 'entregue' ? 'Entregue' : 'Disponível'}</div>
                  <div className="cliente-card-acoes">
                    <button type="button" className="botao-secundario" onClick={() => baixarCertificado(c)}>Baixar certificado</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {aba === 'dados' && !editandoDados && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="linha"><b>Nome:</b> {cliente.nome}</div>
              <div className="linha"><b>E-mail:</b> {cliente.email || '—'}</div>
              <div className="linha"><b>Telefone:</b> {cliente.telefone || '—'}</div>
              <div className="linha"><b>Habilitação matriculada:</b> {labelHabilitacao(matricula.habilitacao)}</div>
              <p className="dica">A habilitação matriculada não é editável por aqui — fale com a escola para alterar.</p>

              {/* Campos que entram nos documentos que a ESCOLA gera pra
                  Capitania (ver nota no topo do arquivo) — mostrados aqui
                  só pra conferência; "Editar dados" abaixo cobre também
                  eles, não só nome/e-mail/telefone. */}
              <p className="dica" style={{ marginTop: 8, fontWeight: 600 }}>Dados usados nos seus documentos de matrícula:</p>
              {CAMPOS_DOCUMENTO.map((c) => (
                <div key={c.chave} className="linha">
                  <b>{c.label}:</b> {c.tipo === 'date' ? (isoParaDataMascarada(cliente[c.chave]) || '—') : (cliente[c.chave] || '—')}
                </div>
              ))}

              <button type="button" className="botao-secundario" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={abrirEdicaoDados}>
                Editar dados
              </button>
            </div>
          )}

          {aba === 'dados' && editandoDados && (
            <form onSubmit={salvarMeusDados} className="form-vertical" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>
                Nome
                <input required type="text" value={formDados.nome} onChange={(e) => setFormDados({ ...formDados, nome: e.target.value })} />
              </label>
              <label>
                E-mail
                <input type="email" value={formDados.email} onChange={(e) => setFormDados({ ...formDados, email: e.target.value })} />
              </label>
              <label>
                Telefone
                <input type="text" value={formDados.telefone} onChange={(e) => setFormDados({ ...formDados, telefone: maskTelefone(e.target.value) })} />
              </label>

              {/* Antes esses campos só eram perguntados uma vez (na
                  matrícula) e só se estivessem vazios — um dado errado não
                  tinha como ser corrigido depois. Agora ficam aqui, sempre
                  editáveis, junto com o resto de "Meus dados". */}
              {CAMPOS_DOCUMENTO.map((c) => (
                <label key={c.chave}>
                  {c.label}
                  <input
                    type="text" inputMode={c.tipo === 'date' ? 'numeric' : undefined}
                    placeholder={c.tipo === 'date' ? 'dd/mm/aaaa' : undefined}
                    value={formDados[c.chave] || ''}
                    onChange={(e) => setFormDados({
                      ...formDados,
                      [c.chave]: c.tipo === 'date' ? maskData(e.target.value) : e.target.value,
                    })}
                  />
                </label>
              ))}

              {erroDados && <p className="erro">{erroDados}</p>}
              <div className="acoes-modal" style={{ padding: 0 }}>
                <button type="button" onClick={() => setEditandoDados(false)} disabled={salvandoDados}>Cancelar</button>
                <button type="submit" disabled={salvandoDados}>{salvandoDados ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
          )}
        </>
      )}

      <a className="pagina-cliente-rodape" style={{ marginTop: 'auto' }} href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">RV e-Náutica by RVinvictus.com.br</a>
    </div>
  )
}
