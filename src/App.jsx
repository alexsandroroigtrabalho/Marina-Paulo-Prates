import { useEffect, useState } from 'react'
import { supabase, db } from './lib/supabase'
import { TEMA_PADRAO } from './lib/tema'
import Home from './components/Home'
import AreaCliente from './components/AreaCliente'
import AdminLogin from './components/AdminLogin'
import Layout from './components/Layout'
import PainelMarina from './components/PainelMarina'
import TelaVagas from './components/TelaVagas'
import TelaClientes from './components/TelaClientes'
import TelaFinanceiro from './components/TelaFinanceiro'
import TelaManutencao from './components/TelaManutencao'
import TelaDocumentacao from './components/TelaDocumentacao'
import TelaAbastecimento from './components/TelaAbastecimento'
import TelaClienteDashboard from './components/TelaClienteDashboard'

const TELAS = {
  painel: { titulo: 'Painel da marina', Componente: null },
  vagas: { titulo: 'Painel de Controle', Componente: TelaVagas },
  clientes: { titulo: 'Planilha de cadastros', Componente: TelaClientes },
  financeiro: { titulo: 'Financeiro', Componente: TelaFinanceiro },
  manutencao: { titulo: 'Manutenção', Componente: TelaManutencao },
  documentacao: { titulo: 'Documentação e Regularização', Componente: TelaDocumentacao },
  abastecimento: { titulo: 'Abastecimento', Componente: TelaAbastecimento },
}

const PAPEIS_INTERNOS = ['admin', 'funcionario', 'operador']

export default function App() {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [entrada, setEntrada] = useState('home') // home | cliente | admin
  const [telaAtiva, setTelaAtiva] = useState('painel')

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

  // Não logado: Home -> escolha de perfil (cliente ou administração)
  if (!sessao) {
    if (entrada === 'cliente') return <AreaCliente onVoltar={() => setEntrada('home')} />
    if (entrada === 'admin') return <AdminLogin onVoltar={() => setEntrada('home')} />
    return (
      <Home
        nomeMarina={TEMA_PADRAO.nomeExibicao}
        onEscolherCliente={() => setEntrada('cliente')}
        onEscolherAdmin={() => setEntrada('admin')}
      />
    )
  }

  // Logado, aguardando perfil carregar
  if (!perfil) return <div className="tela-central">Carregando perfil...</div>

  // Cliente final: painel simplificado (somente leitura dos próprios dados)
  if (!PAPEIS_INTERNOS.includes(perfil.role)) {
    return <TelaClienteDashboard perfil={perfil} />
  }

  // Admin / funcionário / operador: shell interno com sidebar
  const { titulo, Componente } = TELAS[telaAtiva]

  return (
    <Layout telaAtiva={telaAtiva} setTelaAtiva={setTelaAtiva} perfil={perfil} titulo={titulo}>
      {telaAtiva === 'painel'
        ? <PainelMarina irPara={setTelaAtiva} />
        : <Componente marinaId={perfil?.marina_id} perfil={perfil} />}
    </Layout>
  )
}
