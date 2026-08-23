import { useEffect, useState } from 'react'
import { supabase, db } from './lib/supabase'
import { TEMA_PADRAO } from './lib/tema'
import { buscarMarina } from './lib/db'
import { APLICACOES } from './lib/apps'
import Home from './components/Home'
import FichaCadastro from './components/FichaCadastro'
import RedefinirSenha from './components/RedefinirSenha'
import Layout from './components/Layout'
import PaginaMarcaDagua from './components/PaginaMarcaDagua'
import TelaVagas from './components/TelaVagas'
import TelaClientes from './components/TelaClientes'
import TelaFinanceiro from './components/TelaFinanceiro'
import TelaManutencao from './components/TelaManutencao'
import TelaAbastecimento from './components/TelaAbastecimento'
import TelaClienteDashboard from './components/TelaClienteDashboard'

// Telas de RV Marine — a única das 4 aplicações RV Invictus (ver
// lib/apps.js) já desenvolvida. "Despachos" saiu daqui (não foi apagado, só
// desligado do menu — ver TelaDocumentacao.jsx): vai virar a base do RV
// NautDoc quando essa aplicação for desenvolvida.
const TELAS = {
  // O título mostrado no topo da tela é o nome da marina (não "Painel de
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
  // Qual das 4 aplicações RV Invictus (lib/apps.js) está escolhida no menu
  // lateral — null é o estado inicial "nenhuma escolhida ainda" (sidebar
  // mostra o seletor das 4; a área de conteúdo mostra só a marca d'água,
  // ver PaginaMarcaDagua.jsx). `telaAtiva` abaixo só é relevante quando
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

  // Cliente final ("clientes dos nossos clientes" — os clientes da marina):
  // painel simplificado, somente leitura dos próprios dados.
  if (!PAPEIS_INTERNOS.includes(perfil.role)) {
    return <TelaClienteDashboard perfil={perfil} />
  }

  // Admin / funcionário / operador ("nossos clientes" — a equipe da
  // marina): shell interno com sidebar.

  // Nenhuma das 4 aplicações escolhida ainda: sidebar mostra o seletor,
  // conteúdo mostra só a marca d'água convidando a escolher uma. Sem
  // título nenhum no cabeçalho aqui (antes era "RV Invictus", redundante
  // com a própria logo já centralizada no cabeçalho) — só a logo.
  if (!appSelecionada) {
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={setAppSelecionada} perfil={perfil} titulo="">
        <PaginaMarcaDagua />
      </Layout>
    )
  }

  // RV NautDoc / RV e-Náutica / RV Engenharia: ainda não têm telas próprias
  // — mostram só o título escolhido na sidebar e "Em construção" com a
  // marca d'água na área de conteúdo, até serem desenvolvidas.
  if (appSelecionada !== 'marine') {
    const app = APLICACOES.find((a) => a.chave === appSelecionada)
    const nomeApp = app ? `${app.prefixo} ${app.nome}` : ''
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={setAppSelecionada} perfil={perfil} titulo={nomeApp}>
        <PaginaMarcaDagua texto="Em construção" />
      </Layout>
    )
  }

  // RV Marine: shell interno já existente, com os itens de sempre. Só a
  // tela "vagas" (Painel de Controle) usa o nome de verdade da marina no
  // título — as demais continuam com o próprio nome da tela (TELAS acima).
  const { titulo: tituloTela, Componente } = TELAS[telaAtiva]
  const titulo = telaAtiva === 'vagas' ? (nomeMarina || tituloTela) : tituloTela

  return (
    <Layout
      appSelecionada={appSelecionada} setAppSelecionada={setAppSelecionada}
      telaAtiva={telaAtiva} setTelaAtiva={setTelaAtiva} perfil={perfil} titulo={titulo}
      acoesPainel={telaAtiva === 'vagas' ? acoesVagas : null}
    >
      <Componente
        marinaId={perfil?.marina_id} perfil={perfil}
        onAcoes={telaAtiva === 'vagas' ? setAcoesVagas : undefined}
      />
    </Layout>
  )
}
