import { useEffect, useState } from 'react'
import { supabase, db } from './lib/supabase'
import { TEMA_PADRAO } from './lib/tema'
import Home from './components/Home'
import FichaCadastro from './components/FichaCadastro'
import Layout from './components/Layout'
import TelaVagas from './components/TelaVagas'
import TelaClientes from './components/TelaClientes'
import TelaFinanceiro from './components/TelaFinanceiro'
import TelaManutencao from './components/TelaManutencao'
import TelaDocumentacao from './components/TelaDocumentacao'
import TelaAbastecimento from './components/TelaAbastecimento'
import TelaClienteDashboard from './components/TelaClienteDashboard'

const TELAS = {
  // O título mostrado no topo da tela é o nome da marina (não "Painel de
  // Controle" — esse nome já aparece no item do menu lateral).
  vagas: { titulo: TEMA_PADRAO.nomeExibicao, Componente: TelaVagas },
  clientes: { titulo: 'Clientes', Componente: TelaClientes },
  financeiro: { titulo: 'Financeiro', Componente: TelaFinanceiro },
  manutencao: { titulo: 'Manutenção', Componente: TelaManutencao },
  documentacao: { titulo: 'Despachos', Componente: TelaDocumentacao },
  abastecimento: { titulo: 'Abastecimento', Componente: TelaAbastecimento },
}

const PAPEIS_INTERNOS = ['admin', 'funcionario', 'operador']

export default function App() {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  // Página de entrada única: 'login' (padrão) ou 'cadastro'. A antiga escolha
  // manual "Sou cliente" / "Administração" (Home -> AreaCliente / AdminLogin,
  // cada uma com formulário próprio) foi removida — agora só existe uma tela
  // de login. Depois de autenticar, `perfil.role` (abaixo) decide sozinho o
  // ambiente: equipe da marina ou cliente final, ambos já existentes.
  const [entrada, setEntrada] = useState('login')
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSessao(session))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessao?.user) { setPerfil(null); return }
    db.from('perfis').select('*').eq('id', sessao.user.id).single().then(({ data }) => setPerfil(data))
  }, [sessao])

  if (carregando) return <div className="tela-central">Carregando...</div>

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
  const { titulo, Componente } = TELAS[telaAtiva]

  return (
    <Layout
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
