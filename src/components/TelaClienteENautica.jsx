import { useEffect, useRef, useState } from 'react'
import { IconLogout, IconHome, IconPlayerPlay, IconCalendarEvent, IconRoute, IconBell, IconSettings } from '@tabler/icons-react'
import { supabase, db } from '../lib/supabase'
import { buscarMarina, salvarCliente } from '../lib/db'
import {
  HABILITACOES, labelHabilitacao, camposDocumentoFaltando, CAMPOS_DOCUMENTO, buscarMinhaMatricula, enviarMatricula,
  modulosAulaComVideo,
  listarMeusAgendamentos, labelTipoAgendamento,
  listarMinhasNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas,
  declararProntidaoTeste,
  solicitarReagendamento,
} from '../lib/enautica'
import { maskData, dataMascaradaParaIso, isoParaDataMascarada, maskTelefone, maskCep, maskUf } from '../lib/mascaras'

// Aplica a máscara certa pra cada campo de CAMPOS_DOCUMENTO (lib/enautica.js),
// usada tanto no modal de matrícula (campos que ainda faltam) quanto em
// "Meus dados" (edição). Antes só a data de nascimento tinha máscara —
// telefone, CEP e UF ficavam em texto livre, aceitando qualquer coisa.
function maskarCampoDocumento(chave, tipo, valor) {
  if (tipo === 'date') return maskData(valor)
  if (chave === 'telefone') return maskTelefone(valor)
  if (chave === 'cep') return maskCep(valor)
  if (chave === 'uf') return maskUf(valor)
  return valor
}

// Área do aluno no RV e-Náutica — mesma linguagem visual do painel do
// cliente do RV Marine (TelaClienteDashboard.jsx): wrapper ".painel-cliente",
// logo no topo, header com o nome do tenant + sair. Sem NENHUMA etapa de
// pagamento (ao contrário do AlunoFlow.jsx original do rsnautica) — o único
// "gate" é a matrícula ser aprovada pela equipe da escola.
//
// Aulas e Agendamentos têm conteúdo real, ligado ao Supabase (matrículas/
// agendamentos de enautica) — só o vídeo de cada aula preparatória é
// opcional (ver ConfiguracoesENautica.jsx: sem a escola cadastrar o link, a
// aula mostra "Conteúdo em preparação").
//
// NÃO existe mais (removida a pedido do Alex) uma aba de "Meus
// certificados": o aluno não acompanha mais o certificado interno pelo
// app — isso volta a ser um controle só da escola, pelo Painel de Controle
// (TelaAlunosENautica.jsx, que continua emitindo/marcando entregue).
//
// NÃO existe (nunca existiu de verdade, a pedido do Alex) uma aba de
// "Documentos" aqui: os 4 documentos de matrícula não são entregues pelo
// aluno — são gerados pela ESCOLA a partir dos dados da matrícula (ver
// ModalDocumentosAluno.jsx, aberto pelo Painel de Controle). O aluno só
// entra nisso preenchendo os dados corretamente — por isso a edição desses
// campos (RG, endereço etc.) continua existindo, só que agora atrás da
// engrenagem no cabeçalho (ver abrirEdicaoDados), não numa aba própria.
//
// "Início" virou a página da matrícula (habilitação, status, dados
// cadastrados) — antes era a Trilha da Habilitação, que se mudou pro lugar
// de "Meus dados" (removida daqui a pedido do Alex: a edição de dados saiu
// das abas e foi pra engrenagem, então sobrou o espaço pra trilha).
const ABAS_ALUNO = [
  { chave: 'inicio', label: 'Início', Icone: IconHome },
  { chave: 'trilha', label: 'Trilha', Icone: IconRoute },
  { chave: 'aulas', label: 'Aulas', Icone: IconPlayerPlay },
  { chave: 'agenda', label: 'Agendamentos', Icone: IconCalendarEvent },
]

// "Início" (aba nova, a pedido do Alex) — um guia de estudos da trilha
// completa até a Carteira de Habilitação de Amador (CHA), pra quem acabou
// de ser aprovado e não sabe bem o que vem a seguir. É só leitura (nenhum
// dado do Supabase aqui) e por isso fica fora do carregar()/estado do
// componente — cada passo aponta pra aba de verdade onde a ação acontece.
// Os números da prova teórica (quantidade de questões, nota mínima) foram
// checados em fontes independentes (a própria Marinha do Brasil, via a
// página da Capitania de Itajaí, e duas escolas náuticas de fora do
// sistema) antes de entrar aqui: 40 questões de múltipla escolha (5
// alternativas cada), 20 acertos (50%) pra aprovar, até 2 horas de prova.
// O conteúdo é definido pelo Anexo 5-A da NORMAM-211/DPC, então é o mesmo
// formato em qualquer Capitania do país — não varia de escola pra escola
// nem de região pra região, ao contrário do que o texto dizia antes.
const TRILHA_INICIO = [
  {
    onde: 'Aba "Aulas"',
    titulo: 'Assista às aulas preparatórias',
    texto: 'Estude no seu ritmo pelos módulos em vídeo liberados pela escola.',
  },
  {
    onde: 'Aba "Agendamentos"',
    titulo: 'Avise que está pronto para a prova teórica',
    texto: 'Quando se sentir preparado, responda "Sim, estou pronto(a)" no card de prova teórica. A escola vê seu aviso e entra em contato para agendar.',
  },
  {
    onde: 'Na Capitania dos Portos',
    titulo: 'Realize a prova teórica',
    texto: 'A avaliação teórica é aplicada diretamente pela autoridade marítima (Capitania dos Portos), não pela escola. São 40 questões de múltipla escolha, sobre regras de tráfego aquaviário, sinalização náutica, manobra, segurança e combate a incêndio, sobrevivência no mar, primeiros socorros e meteorologia. É preciso acertar pelo menos 20 (50%) para ser aprovado, em até duas horas.',
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
    texto: 'Acontece presencialmente na escola, com instrutores habilitados.',
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
      {/* Mesma fonte/peso do título "Diário de Bordo" do painel do RV
          Marine (.diario-titulo, ver TelaClienteDashboard.jsx) — título de
          seção, não da tela (esse já é o header lá em cima). */}
      <h3 className="diario-titulo">Trilha da Habilitação</h3>
      {TRILHA_INICIO.map((passo, i) => {
        // Último passo (a CHA chegando pelo Gov.br) é o "destino final" da
        // trilha — ganha o tratamento escuro com trama de losangos dourados
        // do manual de marca (mesmo usado nas telas de entrada e nos
        // painéis do cliente do RV Marine, ver ".cliente-card--marca" no
        // index.css), só pra se diferenciar visualmente dos passos
        // intermediários, sem criar nenhuma cor nova.
        const ultimo = i === TRILHA_INICIO.length - 1
        return (
          <div key={passo.titulo} className={`cliente-card${ultimo ? ' cliente-card--marca' : ''}`}>
            <div className="cabecalho-cliente">
              <div className="titulo-cliente">
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: '50%',
                    background: ultimo ? '#D4AF37' : 'var(--cor-primaria)', color: ultimo ? '#0D1B2A' : '#fff',
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
        )
      })}
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
  const [notificacoes, setNotificacoes] = useState([])

  const [habilitacao, setHabilitacao] = useState('arrais')
  const [formFaltando, setFormFaltando] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState(null)
  const [modalMatriculaAberto, setModalMatriculaAberto] = useState(false)
  const [aceitouPrivacidade, setAceitouPrivacidade] = useState(false)

  // "Meus dados" (modal aberto pela engrenagem do cabeçalho, ver
  // abrirEdicaoDados) — edita de verdade, reaproveitando salvarCliente
  // (mesma função do RV Marine) — os dados moram na mesma tabela
  // (marina.clientes), então não precisa de nada novo no banco.
  // `editandoDados`/`formDados` controlam se o modal está aberto.
  const [editandoDados, setEditandoDados] = useState(false)
  const [formDados, setFormDados] = useState(null)
  const [salvandoDados, setSalvandoDados] = useState(false)
  const [erroDados, setErroDados] = useState(null)

  // Aviso temporário (mesmo padrão do RV Marine — TelaClienteDashboard.jsx —
  // usado lá pro aviso de "complete seu cadastro" antes de solicitar a
  // descida). Aqui avisa o aluno, ao tentar abrir Trilha/Aulas/Agendamentos
  // antes da matrícula ser aprovada, que essas abas ainda não estão
  // liberadas — em vez de simplesmente trocar de aba sem mostrar conteúdo.
  const [aviso, setAviso] = useState(null)
  const avisoRef = useRef(null)
  function mostrarAviso(texto, duracaoMs = 4000) {
    if (avisoRef.current) clearTimeout(avisoRef.current)
    setAviso(texto)
    avisoRef.current = setTimeout(() => setAviso(null), duracaoMs)
  }
  useEffect(() => () => { if (avisoRef.current) clearTimeout(avisoRef.current) }, [])

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
      const [mat, mar, ags, notifs] = await Promise.all([
        buscarMinhaMatricula(cli.id),
        buscarMarina(cli.marina_id),
        listarMeusAgendamentos(cli.id),
        listarMinhasNotificacoes(cli.id),
      ])
      setMatricula(mat)
      setMarina(mar)
      setAgendamentos(ags)
      setNotificacoes(notifs)
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
      // Agendamentos não têm coluna cliente_id (é `alunos_ids`, um array —
      // não dá pra filtrar no `filter:` do realtime), então escuta a tabela
      // inteira da escola e recarrega, deixando o RLS/query decidir o que é
      // meu na hora do `carregar()`. Tráfego baixo (poucos agendamentos por
      // escola).
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos' }, () => carregar())
      // Notificação nova (matrícula decidida, agendamento marcado etc.)
      // aparece no sino na hora, sem F5.
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
    <div className="painel-cliente" style={{ maxWidth: 480, margin: '0 auto', padding: '24px 24px 68px', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <img src="/rv-invictus-logo.png" alt="RV Invictus · Consultoria e Gestão de Processos" className="pagina-cliente-logo" />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 24 }}>
        {/* Nome de exibição aqui pode ser diferente do nome da marina no RV
            Marine (marina.nome, que aparece em TelaClienteDashboard.jsx) —
            a mesma marina pode ter uma escola náutica com razão social/nome
            fantasia próprio (ex.: Marina Paulo Prates → "Escola RS
            Náutica"). config_json.nomeEscolaEnautica é opcional; sem ele,
            cai no nome da marina normalmente. */}
        <strong className="painel-cliente-marina">{marina?.config_json?.nomeEscolaEnautica || marina?.nome || 'RV e-Náutica'}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {cliente && (
            <SinoNotificacoes notificacoes={notificacoes} onAbrirUma={abrirNotificacao} onMarcarTodasLidas={marcarTodasLidas} />
          )}
          {/* Engrenagem: única porta pra editar os dados pessoais/documento
              (nome, RG, endereço etc.) — mesmo padrão do RV Marine
              (MenuConfigCliente → "Minha conta" em TelaClienteDashboard.jsx),
              só que aqui é um botão direto (não um menu) porque só existe
              essa ação. Só aparece com matrícula aprovada, que é quando
              existe algo pra editar de fato. */}
          {cliente && matricula?.status === 'aprovada' && (
            <button
              type="button" className="nav-item" style={{ color: 'var(--cor-primaria)' }}
              title="Editar meus dados" aria-label="Editar meus dados" onClick={abrirEdicaoDados}
            >
              <IconSettings size={16} />
            </button>
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

      {/* Barra de abas — sempre visível pra quem já tem cadastro, mesmo
          antes da matrícula ser aprovada: é assim que o aluno chega em
          "Início" pra solicitar a matrícula. Fica no topo, antes de
          qualquer conteúdo de aba, pra não ficar "escondida" atrás dos
          cards/botões de matrícula quando Início tem bastante coisa pra
          mostrar. Trilha/Aulas/Agendamentos só têm conteúdo de verdade
          depois da aprovação — antes disso, clicar nelas mostra um aviso
          (ver mostrarAviso) em vez de trocar de aba. "Início" vira uma
          barra horizontal cheia no topo (cor fixa: gradiente laranja do
          S.O.S.); os outros 3 ficam numa fileira logo abaixo — "Trilha"
          fixo em azul-petróleo, Aulas/Agendamentos em branco (ver
          .abas-enautica* no index.css). A cor de cada botão é sempre a
          mesma; só a aba selecionada ganha destaque (sombra). O rótulo
          fica num <span> à parte pra centralizar de verdade
          (verticalmente) com o ícone, mesmo em botões com texto de
          tamanhos diferentes. */}
      {cliente && (
        <div className="abas-enautica">
          <button
            className={`abas-enautica-inicio${aba === 'inicio' ? ' ativo' : ''}`}
            onClick={() => setAba('inicio')}
          >
            <IconHome size={22} />
            <span>Início</span>
          </button>
          <div className="abas-enautica-linha">
            {ABAS_ALUNO.filter((a) => a.chave !== 'inicio').map((a) => (
              <button
                key={a.chave}
                className={[aba === a.chave ? 'ativo' : '', a.chave === 'trilha' ? 'abas-enautica-aulas' : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  if (matricula?.status !== 'aprovada') {
                    mostrarAviso('Esta área libera assim que sua matrícula for aprovada pela escola.')
                    return
                  }
                  setAba(a.chave)
                }}
              >
                <a.Icone size={18} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Início = a própria página de solicitação de matrícula, sempre — a
          pedido do Alex, ela continua aparecendo mesmo depois de aprovada,
          porque o aluno pode voltar aqui e pedir uma habilitação diferente
          (ex.: já aprovado em moto, pede arrais depois). Os botões abrem o
          mesmo modal de pedido (padrão dourado/navy do resto do RV Marine,
          .modal-fundo + .modal-card); nele só entram os campos de documento
          que ainda faltam (ver camposDocumentoFaltando) — como os dados já
          preenchidos continuam salvos no cadastro, o formulário aparece
          menor (ou vazio) num pedido seguinte. Só não mostra os botões com
          uma matrícula "pendente" (aguardando decisão da escola — ver bloco
          abaixo): evita pedido duplicado enquanto o anterior ainda está em
          análise. */}
      {aba === 'inicio' && cliente && matricula?.status !== 'pendente' && (
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
                key={c.chave} type="text" required
                inputMode={c.tipo === 'date' || c.chave === 'telefone' || c.chave === 'cep' ? 'numeric' : undefined}
                placeholder={c.tipo === 'date' ? 'Data de nascimento (dd/mm/aaaa)' : c.chave === 'cep' ? 'CEP' : c.label}
                value={formFaltando[c.chave] || ''}
                onChange={(e) => setFormFaltando({
                  ...formFaltando,
                  [c.chave]: maskarCampoDocumento(c.chave, c.tipo, e.target.value),
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

      {aba === 'inicio' && cliente && matricula?.status === 'pendente' && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <p className="status-texto pendente">Matrícula em análise</p>
          <p className="dica">Seu pedido para <b>{labelHabilitacao(matricula.habilitacao)}</b> está aguardando aprovação da escola. Você será avisado assim que a decisão sair.</p>
        </div>
      )}

      {matricula?.status === 'aprovada' && (
        <>
          {/* Conteúdo do "Início" pra quem já está aprovado fica no bloco
              acima (página de solicitação de matrícula, sempre visível) —
              aqui só as outras 3 abas, que só têm conteúdo de verdade
              depois da aprovação. */}
          {aba === 'trilha' && <TelaInicio />}

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
                    {/* Só "Sim, estou pronto(a)" — removido "Ainda não" a
                        pedido do Alex: enquanto o aluno não confirma, o
                        card já fica parado nesta pergunta (mesmo estado
                        "ainda não respondeu"); não precisa de um botão que
                        grava explicitamente uma resposta negativa. */}
                    <div className="cliente-card-acoes">
                      <button type="button" className="botao-secundario" disabled={salvandoProntidao} onClick={() => responderProntidao('sim')}>
                        ✓ Sim, estou pronto(a)
                      </button>
                    </div>
                  </>
                )}
              </div>

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

        </>
      )}

      {/* Edição de "Meus dados" — agora um modal aberto pela engrenagem no
          cabeçalho (não mais uma aba própria; ver nota em ABAS_ALUNO acima),
          mesmo padrão visual/estrutura do modal "Minha conta" do RV Marine
          (TelaClienteDashboard.jsx): .modal-fundo + .modal-card ganham o
          fundo escuro com losango dourado automaticamente (ver
          ".painel-cliente .modal-card" no index.css), sem precisar de
          nenhuma classe extra aqui. */}
      {editandoDados && formDados && (
        <div className="modal-fundo" onClick={() => setEditandoDados(false)}>
          <form onSubmit={salvarMeusDados} className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Meus dados</h3>
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
                editáveis, junto com o resto de "Meus dados". "telefone"
                fica de fora (já tem o campo dele logo acima) — mesmo
                motivo da leitura, ver comentário lá. */}
            {CAMPOS_DOCUMENTO.filter((c) => c.chave !== 'telefone').map((c) => (
              <label key={c.chave}>
                {c.label}
                <input
                  type="text"
                  inputMode={c.tipo === 'date' || c.chave === 'cep' ? 'numeric' : undefined}
                  placeholder={c.tipo === 'date' ? 'dd/mm/aaaa' : c.chave === 'uf' ? 'ex.: SP' : undefined}
                  value={formDados[c.chave] || ''}
                  onChange={(e) => setFormDados({
                    ...formDados,
                    [c.chave]: maskarCampoDocumento(c.chave, c.tipo, e.target.value),
                  })}
                />
              </label>
            ))}

            {erroDados && <p className="erro">{erroDados}</p>}
            <div className="acoes-modal">
              <button type="button" onClick={() => setEditandoDados(false)} disabled={salvandoDados}>Cancelar</button>
              <button type="submit" disabled={salvandoDados}>{salvandoDados ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {aviso && <div className="aviso-temporario" role="status">{aviso}</div>}

      <a className="pagina-cliente-rodape pagina-cliente-rodape--fixo" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">RV e-Náutica by RVinvictus.com.br</a>
    </div>
  )
}
