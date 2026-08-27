import { useEffect, useState } from 'react'
import { supabase, db } from './lib/supabase'
import { TEMA_PADRAO } from './lib/tema'
import { buscarMarina } from './lib/db'
import { buscarApp, nomeCompleto, temTelas, primeiraTela } from './lib/apps'
import Home from './components/Home'
import FichaCadastro from './components/FichaCadastro'
import RedefinirSenha from './components/RedefinirSenha'
import Layout from './components/Layout'
import PaginaMarcaDagua from './components/PaginaMarcaDagua'
import SelecaoAplicacoes from './components/SelecaoAplicacoes'
import AplicacaoEmConstrucao from './components/AplicacaoEmConstrucao'
import TelaVagas from './components/TelaVagas'
import TelaClientes from './components/TelaClientes'
import TelaFinanceiro from './components/TelaFinanceiro'
import TelaManutencao from './components/TelaManutencao'
import TelaAbastecimento from './components/TelaAbastecimento'
import TelaClienteDashboard from './components/TelaClienteDashboard'

// Catálogo de telas da área administrativa: chave → componente e título.
// QUAL aplicação mostra QUAIS telas é decidido em lib/apps.js (campo
// `telas`), a fonte única — aqui só se resolve a chave em componente. Foi o
// que permitiu o RV Finance e o RV Manut nascerem reaproveitando telas que
// já existiam e funcionavam, em vez de reescrevê-las.
//
// "Despachos" continua fora do menu (não foi apagado — ver
// TelaDocumentacao.jsx): vai virar a base do RV NautDoc.
const TELAS = {
  // O título do Painel de Controle é o nome da marina (não "Painel de
  // Controle" — esse nome já aparece no item do menu lateral).
  vagas: { titulo: TEMA_PADRAO.nomeExibicao, Componente: TelaVagas },
  clientes: { titulo: 'Clientes', Componente: TelaClientes },
  financeiro: { titulo: 'Financeiro', Componente: TelaFinanceiro },
  manutencao: { titulo: 'Manutenção', Componente: TelaManutencao },
  abastecimento: { titulo: 'Abastecimento', Componente: TelaAbastecimento },
}

const PAPEIS_INTERNOS = ['admin', 'funcionario', 'operador']

export default function App() {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  // Nome de verdade da marina (marinas.nome), usado como título do Painel
  // de Controle no cabeçalho — antes ficava fixo em
  // TEMA_PADRAO.nomeExibicao ("Marina Paulo Prates", o nome do app de
  // referência), então todo cliente via esse nome errado ali. null
  // enquanto carrega; TELAS.vagas.titulo abaixo cai no nome de referência
  // só nesse intervalo bem curto.
  const [nomeMarina, setNomeMarina] = useState(null)
  const [carregando, setCarregando] = useState(true)
  // true quando o usuário chegou pelo link de "Esqueci minha senha" (evento
  // 'PASSWORD_RECOVERY' do Supabase Auth, disparado ao abrir o link do
  // e-mail) — nesse caso o Supabase já autentica a sessão, mas ela só serve
  // pra autorizar a troca de senha; a tela RedefinirSenha.jsx precisa
  // aparecer antes de liberar qualquer outra tela do sistema.
  const [recuperandoSenha, setRecuperandoSenha] = useState(false)
  // Página de entrada única: 'login' (padrão) ou 'cadastro'. A antiga escolha
  // manual "Sou cliente" / "Administração" (Home -> AreaCliente / AdminLogin,
  // cada uma com formulário próprio) foi removida — agora só existe uma tela
  // de login. Depois de autenticar, `perfil.role` (abaixo) decide sozinho o
  // ambiente: equipe da marina ou cliente final, ambos já existentes.
  const [entrada, setEntrada] = useState('login')
  // Qual aplicação RV Invictus (lib/apps.js) está escolhida — null é o
  // estado inicial "nenhuma escolhida ainda". Vale pros dois públicos: o
  // cliente vê a tela de seleção (SelecaoAplicacoes.jsx) e o administrador
  // vê o seletor na sidebar com a marca d'água no conteúdo
  // (PaginaMarcaDagua.jsx). `telaAtiva` abaixo só é relevante quando
  // appSelecionada === 'marine'.
  const [appSelecionada, setAppSelecionada] = useState(null)
  const [telaAtiva, setTelaAtiva] = useState('vagas')
  // Ações do Painel de Controle (sons, histórico, combustíveis), repassadas
  // pelo TelaVagas — viram um menu de engrenagem no cabeçalho, do lado do
  // usuário, em vez de botões fixos em cima da Fila de Rampa.
  const [acoesVagas, setAcoesVagas] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessao(session)
      setCarregando(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setSessao(session)
      if (event === 'PASSWORD_RECOVERY') setRecuperandoSenha(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessao?.user) { setPerfil(null); return }
    db.from('perfis').select('*').eq('id', sessao.user.id).single().then(({ data }) => setPerfil(data))
  }, [sessao])

  useEffect(() => {
    if (!perfil?.marina_id) { setNomeMarina(null); return }
    buscarMarina(perfil.marina_id).then((m) => setNomeMarina(m?.nome || null)).catch(() => setNomeMarina(null))
  }, [perfil?.marina_id])

  // Trocar de aplicação precisa reposicionar a tela ativa: cada aplicação
  // tem o seu próprio conjunto (lib/apps.js). Sem isto, sair do RV Marine
  // em "Clientes" e entrar no RV Finance deixaria `telaAtiva` apontando pra
  // uma tela que não existe ali. `null` volta pro seletor de aplicações.
  function escolherApp(chave) {
    setAppSelecionada(chave)
    setTelaAtiva(chave ? primeiraTela(buscarApp(chave)) : null)
    setAcoesVagas(null)
  }

  if (carregando) return <div className="tela-central">Carregando...</div>

  // Link de redefinição de senha clicado: pede a nova senha antes de
  // liberar qualquer tela do sistema, mesmo já havendo uma sessão válida.
  if (recuperandoSenha) {
    return <RedefinirSenha onConcluido={() => setRecuperandoSenha(false)} />
  }

  // Não logado: uma única tela de login. "Realizar cadastro" leva à ficha de
  // cadastro já existente — não há criação de conta nova nesse fluxo.
  if (!sessao) {
    if (entrada === 'cadastro') return <FichaCadastro onVoltar={() => setEntrada('login')} />
    return <Home onCadastro={() => setEntrada('cadastro')} />
  }

  // Logado, aguardando perfil carregar
  if (!perfil) return <div className="tela-central">Carregando perfil...</div>

  // Cliente final ("clientes dos nossos clientes" — os clientes da marina).
  // O caminho agora é Login → Seleção de aplicações → Aplicação escolhida:
  // o cliente escolhe entre as aplicações da RV Invictus (lib/apps.js, a
  // mesma lista do menu do administrador) antes de entrar em qualquer uma.
  // Só o RV Marine tem tela hoje (o painel do cliente que já existia, sem
  // nenhuma alteração); as demais mostram "Em construção", com volta pra
  // seleção. A sessão do Supabase não é tocada em nenhum desses passos —
  // trocar de aplicação é só estado de tela, o usuário segue logado.
  if (!PAPEIS_INTERNOS.includes(perfil.role)) {
    if (!appSelecionada) {
      return <SelecaoAplicacoes onSelecionar={setAppSelecionada} />
    }
    // `clientePronto` (não a lista de telas): RV Finance e RV Manut já
    // existem para a equipe da marina, mas ainda não têm experiência para o
    // cliente final — para ele continuam "Em construção".
    if (!buscarApp(appSelecionada)?.clientePronto) {
      return (
        <AplicacaoEmConstrucao
          app={buscarApp(appSelecionada)}
          onVoltar={() => setAppSelecionada(null)}
        />
      )
    }
    return <TelaClienteDashboard perfil={perfil} />
  }

  // Admin / funcionário / operador ("nossos clientes" — a equipe da
  // marina): shell interno com sidebar.

  // Nenhuma aplicação escolhida ainda: sidebar mostra o seletor,
  // conteúdo mostra só a marca d'água convidando a escolher uma. Sem
  // título nenhum no cabeçalho aqui (antes era "RV Invictus", redundante
  // com a própria logo já centralizada no cabeçalho) — só a logo.
  if (!appSelecionada) {
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={escolherApp} perfil={perfil} titulo="">
        <PaginaMarcaDagua />
      </Layout>
    )
  }

  // Aplicações ainda sem telas (NautDoc, e-Náutica, Enge, Stock): só o
  // título escolhido na sidebar e "Em construção" com a marca d'água.
  const app = buscarApp(appSelecionada)
  if (!temTelas(app)) {
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={escolherApp} perfil={perfil} titulo={nomeCompleto(app)}>
        <PaginaMarcaDagua texto="Em construção" />
      </Layout>
    )
  }

  // Aplicação com telas (RV Marine, RV Finance, RV Manut): shell interno.
  // `telaAtiva` pode não pertencer a esta aplicação no primeiro render
  // depois de uma troca — daí o fallback pra primeira tela dela, que evita
  // procurar em TELAS uma chave que a aplicação atual não tem.
  const telaDaApp = app.telas.some((t) => t.chave === telaAtiva) ? telaAtiva : primeiraTela(app)
  const { titulo: tituloTela, Componente } = TELAS[telaDaApp]
  // Só o Painel de Controle usa o nome real da marina no título; as demais
  // usam o próprio nome da tela.
  const titulo = telaDaApp === 'vagas' ? (nomeMarina || tituloTela) : tituloTela

  return (
    <Layout
      appSelecionada={appSelecionada} setAppSelecionada={escolherApp}
      telaAtiva={telaDaApp} setTelaAtiva={setTelaAtiva} perfil={perfil} titulo={titulo}
      acoesPainel={telaDaApp === 'vagas' ? acoesVagas : null}
    >
      <Componente
        marinaId={perfil?.marina_id} perfil={perfil}
        onAcoes={telaDaApp === 'vagas' ? setAcoesVagas : undefined}
      />
    </Layout>
  )
}
