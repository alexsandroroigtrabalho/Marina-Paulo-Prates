import { useEffect, useState } from 'react'
import { supabase, db } from './lib/supabase'
import { TEMA_PADRAO } from './lib/tema'
import { buscarMarina } from './lib/db'
import { buscarApp, nomeCompleto, temTelas, primeiraTela, TELAS_RV_MASTER } from './lib/apps'
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
import TelaClienteDashboard from './components/TelaClienteDashboard'
import TelaMatriculasENautica from './components/TelaMatriculasENautica'
import TelaAgendaEscolaENautica from './components/TelaAgendaEscolaENautica'
import TelaCertificadosEscolaENautica from './components/TelaCertificadosEscolaENautica'
import TelaClienteENautica from './components/TelaClienteENautica'
import AplicacaoNaoContratada from './components/AplicacaoNaoContratada'
import TelaRvMaster from './components/TelaRvMaster'
import TelaPainelControleRvMaster from './components/TelaPainelControleRvMaster'
import AcessoSuspenso from './components/AcessoSuspenso'
import { tenantSuspenso } from './lib/rvMaster'

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
  matriculas: { titulo: 'Matrículas', Componente: TelaMatriculasENautica },
  enauticaAgenda: { titulo: 'Agenda', Componente: TelaAgendaEscolaENautica },
  enauticaCertificados: { titulo: 'Certificados', Componente: TelaCertificadosEscolaENautica },
}

// Qual componente mostrar pro CLIENTE FINAL em cada aplicação com
// `clientePronto: true` (lib/apps.js) — equivalente ao TELAS acima, só que
// pro lado do cliente em vez da equipe. Cada aplicação nova com experiência
// de cliente só precisa de uma linha aqui.
const COMPONENTES_CLIENTE = {
  marine: TelaClienteDashboard,
  enautica: TelaClienteENautica,
}

const PAPEIS_INTERNOS = ['admin', 'funcionario', 'operador']

// rv_master (super-admin da RV Invictus, ver migração
// rv_master_tenant_management) é tratado à parte de PAPEIS_INTERNOS: entra
// na mesma área da equipe, mas sem marina_id fixo — em vez disso escolhe
// qual cliente (marina/escola) operar, na TelaRvMaster.jsx. Acesso de
// verdade aos dados é IRRESTRITO em toda tabela de marina.*/enautica.* (ver
// migrações rv_master_acesso_teste_enautica e rv_master_acesso_total_e_slug
// — policy `rv_master_acesso_total`/equivalentes, sem filtro de marina_id,
// aplicada tabela por tabela) — a trava de `apps_contratados` também não se
// aplica a ele (ver bypass mais abaixo): controlador global de verdade, a
// pedido explícito do Alex.
function ehRvMaster(perfil) {
  return perfil?.role === 'rv_master'
}

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
  // apps_contratados da própria marina/escola (equipe interna) — mesma
  // trava do lado do cliente, aqui pro lado da equipe: a marina/escola só
  // acessa de verdade o que contratou, mesmo enxergando a lista completa no
  // seletor (vitrine). null enquanto carrega.
  const [appsContratadosEquipe, setAppsContratadosEquipe] = useState(null)
  // true quando o TENANT INTEIRO (equipe) está com acesso suspenso pelo RV
  // Master (marina.marinas.status === 'suspenso', ver lib/rvMaster.js
  // tenantSuspenso/alternarSuspensaoTenant) — bloqueia a tela toda com
  // AcessoSuspenso.jsx, ANTES de decidir Layout/telas. Não vale pro próprio
  // rv_master "entrando como" o tenant escolhido: ele precisa continuar
  // conseguindo abrir um cliente suspenso pra investigar/reativar.
  const [marinaSuspensaEquipe, setMarinaSuspensaEquipe] = useState(false)
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
  // Só para rv_master: qual cliente (marina/escola) ele escolheu operar
  // nesta sessão de tela (não é salvo em lugar nenhum — escolhe de novo a
  // cada login, ou ao clicar em "Voltar ao RV Master"). null = ainda não
  // escolheu — mostra a área própria do rv_master (TELAS_RV_MASTER abaixo).
  const [marinaEscolhidaRvMaster, setMarinaEscolhidaRvMaster] = useState(null)
  // Qual tela da área própria do rv_master está ativa (TELAS_RV_MASTER, em
  // lib/apps.js: "painel" ou "clientes") — estado dedicado, separado do
  // `telaAtiva` do RV Marine (linha abaixo), mesmo as duas telas às vezes
  // compartilhando a mesma chave ("clientes" existe nos dois conjuntos) —
  // evita qualquer mistura entre "em qual tela da aplicação-tenant a equipe
  // estava" e "em qual tela da PRÓPRIA área do rv_master ele estava".
  const [telaAtivaRvMaster, setTelaAtivaRvMaster] = useState('painel')

  // marina_id "efetivo" pra tudo que vem depois: da equipe normal (via
  // perfil) ou da escolha manual do rv_master.
  const marinaIdEfetivo = ehRvMaster(perfil) ? marinaEscolhidaRvMaster : perfil?.marina_id
  // Volta pro painel de clientes do RV Master (TelaRvMaster) — só existe
  // pra esse papel, com um tenant já escolhido; equipe normal nunca vê o
  // botão (ver Layout.jsx, aoVoltarRvMaster).
  const aoVoltarRvMaster = ehRvMaster(perfil) && marinaEscolhidaRvMaster ? () => setMarinaEscolhidaRvMaster(null) : undefined

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
    if (!marinaIdEfetivo) { setNomeMarina(null); setAppsContratadosEquipe(null); setMarinaSuspensaEquipe(false); return }
    buscarMarina(marinaIdEfetivo)
      .then((m) => {
        setNomeMarina(m?.nome || null)
        setAppsContratadosEquipe(m?.apps_contratados || ['marine'])
        setMarinaSuspensaEquipe(!ehRvMaster(perfil) && tenantSuspenso(m))
      })
      .catch(() => { setNomeMarina(null); setAppsContratadosEquipe(['marine']); setMarinaSuspensaEquipe(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marinaIdEfetivo, perfil?.role])

  // Quais aplicações o CLIENTE pode de fato acessar (não só ver na
  // vitrine): `apps_contratados` da marina/escola do PRÓPRIO cliente — não
  // de `perfil.marina_id`, que fica vazio pra quem se cadastrou sozinho
  // (ver marina.clientes.marina_id, preenchido no autocadastro). Só é
  // buscado pra quem não é da equipe interna; fica `null` (ainda
  // carregando) até resolver, e `['marine']` — o padrão da coluna no banco
  // — se o cliente ainda nem tem uma linha em `clientes`.
  const [appsContratadosCliente, setAppsContratadosCliente] = useState(null)
  // Mesma trava de tenant inteiro suspenso (ver marinaSuspensaEquipe acima),
  // aqui pro lado do cliente final.
  const [marinaSuspensaCliente, setMarinaSuspensaCliente] = useState(false)
  useEffect(() => {
    if (!perfil || PAPEIS_INTERNOS.includes(perfil.role)) {
      setAppsContratadosCliente(null)
      setMarinaSuspensaCliente(false)
      return
    }
    db.from('clientes').select('marina_id').eq('user_id', perfil.id).maybeSingle()
      .then(({ data: cli }) => {
        if (!cli?.marina_id) { setAppsContratadosCliente(['marine']); setMarinaSuspensaCliente(false); return }
        return buscarMarina(cli.marina_id).then((m) => {
          setAppsContratadosCliente(m?.apps_contratados || ['marine'])
          setMarinaSuspensaCliente(tenantSuspenso(m))
        })
      })
      .catch(() => { setAppsContratadosCliente(['marine']); setMarinaSuspensaCliente(false) })
  }, [perfil])

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

  // Cliente inteiro (marina/escola) com acesso suspenso pelo RV Master —
  // bloqueia TUDO (equipe e cliente final), antes de qualquer Layout/tela.
  // Não vale pro próprio rv_master (marinaSuspensaEquipe já vem false pra
  // ele, ver useEffect acima) nem enquanto os dois estados ainda não
  // resolveram (ambos começam false, então só vira true depois de
  // confirmar de verdade — nunca bloqueia por engano durante o carregamento).
  if (marinaSuspensaEquipe || marinaSuspensaCliente) {
    return <AcessoSuspenso />
  }

  // Cliente final ("clientes dos nossos clientes" — os clientes da marina).
  // O caminho agora é Login → Seleção de aplicações → Aplicação escolhida:
  // o cliente escolhe entre as aplicações da RV Invictus (lib/apps.js, a
  // mesma lista do menu do administrador) antes de entrar em qualquer uma.
  // Só o RV Marine tem tela hoje (o painel do cliente que já existia, sem
  // nenhuma alteração); as demais mostram "Em construção", com volta pra
  // seleção. A sessão do Supabase não é tocada em nenhum desses passos —
  // trocar de aplicação é só estado de tela, o usuário segue logado.
  if (!PAPEIS_INTERNOS.includes(perfil.role) && !ehRvMaster(perfil)) {
    if (!appSelecionada) {
      return <SelecaoAplicacoes onSelecionar={setAppSelecionada} />
    }
    // A lista de aplicações continua mostrando TODAS (vitrine/marketing, a
    // pedido explícito) — quem decide se o acesso de verdade é liberado é
    // este bloco, em duas travas independentes:
    //   1) `clientePronto`: a aplicação já tem experiência pronta para o
    //      cliente final (RV Finance e RV Manut ainda não têm — "Em
    //      construção" pra ele, mesmo já existindo pra equipe).
    //   2) `apps_contratados` da marina/escola do próprio cliente: mesmo
    //      pronta, só quem contratou entra — as demais mostram
    //      AplicacaoNaoContratada em vez do conteúdo de verdade. Só a RV
    //      Master mexe nessa lista (trava no banco); o cliente nunca gerencia
    //      isso sozinho.
    if (appsContratadosCliente === null) return <div className="tela-central">Carregando...</div>
    if (!buscarApp(appSelecionada)?.clientePronto) {
      return (
        <AplicacaoEmConstrucao
          app={buscarApp(appSelecionada)}
          onVoltar={() => setAppSelecionada(null)}
        />
      )
    }
    if (!appsContratadosCliente.includes(appSelecionada)) {
      return (
        <AplicacaoNaoContratada
          app={buscarApp(appSelecionada)}
          onVoltar={() => setAppSelecionada(null)}
        />
      )
    }
    const ComponenteCliente = COMPONENTES_CLIENTE[appSelecionada]
    return <ComponenteCliente perfil={perfil} onVoltar={() => setAppSelecionada(null)} />
  }

  // Admin / funcionário / operador ("nossos clientes" — a equipe da
  // marina) OU rv_master testando uma marina específica: shell interno com
  // sidebar. rv_master escolhe a marina/escola antes de mais nada — sem
  // isso não há `marinaIdEfetivo` pra passar pra nenhuma tela.
  if (ehRvMaster(perfil) && !marinaEscolhidaRvMaster) {
    // Duas telas próprias do rv_master (TELAS_RV_MASTER, lib/apps.js):
    // "painel" = números agregados de todos os clientes (tabela + gráficos
    // de pizza, TelaPainelControleRvMaster.jsx, só leitura) e "clientes" =
    // a gestão cliente por cliente que já existia (cards, cadastrar,
    // ligar/desligar aplicação, suspender — TelaRvMaster.jsx, sem nenhuma
    // mudança de conteúdo, só o rótulo do menu que passou a ser "Clientes"
    // em vez de "Painel de Controle"). Mesmo fallback que `telaDaApp` usa
    // mais abaixo pra RV Marine: se `telaAtivaRvMaster` não bater com
    // nenhuma chave válida (ex.: ainda no valor inicial de outra sessão),
    // volta pro Painel de Controle em vez de quebrar.
    const telaRvMasterValida = TELAS_RV_MASTER.some((t) => t.chave === telaAtivaRvMaster) ? telaAtivaRvMaster : 'painel'
    const tituloRvMaster = TELAS_RV_MASTER.find((t) => t.chave === telaRvMasterValida)?.label
    return (
      <Layout
        appSelecionada={null} setAppSelecionada={escolherApp} perfil={perfil}
        telaAtiva={telaRvMasterValida} setTelaAtiva={setTelaAtivaRvMaster}
        titulo={tituloRvMaster} semSeletorApps
      >
        {telaRvMasterValida === 'clientes'
          ? <TelaRvMaster onEntrarComoTenant={setMarinaEscolhidaRvMaster} />
          : <TelaPainelControleRvMaster />}
      </Layout>
    )
  }

  // Nenhuma aplicação escolhida ainda: sidebar mostra o seletor,
  // conteúdo mostra só a marca d'água convidando a escolher uma. Sem
  // título nenhum no cabeçalho aqui (antes era "RV Invictus", redundante
  // com a própria logo já centralizada no cabeçalho) — só a logo.
  if (!appSelecionada) {
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={escolherApp} perfil={perfil} titulo="" marinaId={marinaIdEfetivo} aoVoltarRvMaster={aoVoltarRvMaster}>
        <PaginaMarcaDagua />
      </Layout>
    )
  }

  const app = buscarApp(appSelecionada)

  // Mesma trava do lado do cliente (ver bloco acima), agora pro lado da
  // equipe: a marina/escola só entra de verdade nas aplicações do próprio
  // `apps_contratados` — o seletor da sidebar continua mostrando todas
  // (vitrine). Só verifica depois de carregar (evita um flash da tela
  // trancada antes do dado chegar).
  if (!ehRvMaster(perfil) && appsContratadosEquipe && !appsContratadosEquipe.includes(appSelecionada)) {
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={escolherApp} perfil={perfil} titulo={nomeCompleto(app)} marinaId={marinaIdEfetivo} aoVoltarRvMaster={aoVoltarRvMaster}>
        <PaginaMarcaDagua texto="Esta aplicação não faz parte do seu plano atual. Fale com a RV Invictus para contratar." />
      </Layout>
    )
  }

  // Aplicações ainda sem telas (NautDoc, Enge, Stock): só o título
  // escolhido na sidebar e "Em construção" com a marca d'água.
  if (!temTelas(app)) {
    return (
      <Layout appSelecionada={appSelecionada} setAppSelecionada={escolherApp} perfil={perfil} titulo={nomeCompleto(app)} marinaId={marinaIdEfetivo} aoVoltarRvMaster={aoVoltarRvMaster}>
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
      marinaId={marinaIdEfetivo} aoVoltarRvMaster={aoVoltarRvMaster}
    >
      <Componente
        marinaId={marinaIdEfetivo} perfil={perfil}
        onAcoes={telaDaApp === 'vagas' ? setAcoesVagas : undefined}
      />
    </Layout>
  )
}
