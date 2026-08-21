import { useEffect, useState } from 'react'
import { supabase, db } from './lib/supabase'
import { TEMA_PADRAO } from './lib/tema'
import Home from './components/Home'
import AreaCliente from './components/AreaCliente'
import AdminLogin from './components/AdminLogin'
import Layout from './components/Layout'
import TelaVagas from './components/TelaVagas'
import TelaClientes from './components/TelaClientes'
import TelaFinanceiro from './components/TelaFinanceiro'
import TelaManutencao from './components/TelaManutencao'
import TelaDocumentacao from './components/TelaDocumentacao'
import TelaClienteDashboard from './components/TelaClienteDashboard'

const TELAS = {
  // O título mostrado no topo da tela é o nome da marina (não "Painel de
  // Controle" — esse nome já aparece no item do menu lateral).
  vagas: { titulo: TEMA_PADRAO.nomeExibicao, Componente: TelaVagas },
  clientes: { titulo: 'Clientes', Componente: TelaClientes },
  financeiro: { titulo: 'Financeiro', Componente: TelaFinanceiro },
  manutencao: { titulo: 'Manutenção', Componente: TelaManutencao },
  documentacao: { titulo: 'Despachos', Componente: TelaDocumentacao },
}

const PAPEIS_INTERNOS = ['admin', 'funcionario', 'operador']

export default function App() {
  const [sessao, setSessao] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [entrada, setEntrada] = useState('home') // home | cliente | admin
  const [telaAtiva, setTelaAtiva] = useState('vagas')
  // Contadores do Painel de Controle, repassados pelo próprio TelaVagas — vão
  // no topo, ao lado do nome da marina, pra economizar a linha que ocupavam.
  const [resumoVagas, setResumoVagas] = useState(null)

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
  const mostrarResumo = telaAtiva === 'vagas' && resumoVagas

  return (
    <Layout
      telaAtiva={telaAtiva} setTelaAtiva={setTelaAtiva} perfil={perfil} titulo={titulo}
      headerExtra={mostrarResumo ? (
        <div className="resumo-topo">
          <div className="pill"><span>Embarcações na água</span><strong>{resumoVagas.naAgua}</strong></div>
          <div className="pill"><span>Serviços em aberto</span><strong>{resumoVagas.servicos}</strong></div>
          <div className="pill"><span>Abastecimentos pendentes</span><strong>{resumoVagas.abastecimentos}</strong></div>
        </div>
      ) : null}
    >
      <Componente marinaId={perfil?.marina_id} perfil={perfil} onResumo={telaAtiva === 'vagas' ? setResumoVagas : undefined} />
    </Layout>
  )
}
