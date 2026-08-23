import { IconSettings, IconArrowLeft, IconLogout } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { APLICACOES } from '../lib/apps'

// Itens de RV Marine — a única das 4 aplicações com telas prontas hoje.
// "Despachos" saiu daqui (não foi apagado, só desligado do menu): vai virar
// a base do RV NautDoc quando essa aplicação for desenvolvida — o
// componente (TelaDocumentacao.jsx) e os dados continuam intactos.
const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'abastecimento', label: 'Abastecimento' },
]

// Cabeçalho mostra só o cargo (ex: "Admin"), nunca o nome cadastrado da
// pessoa (ex: "Admin Teste") — a pedido da administração, pra não expor um
// nome de conta de teste/pessoal em nenhuma tela interna. Só faz sentido
// dentro de RV Marine (as outras 3 aplicações não têm usuário "logado" numa
// tela de trabalho, são só "Em construção").
const LABEL_CARGO = { admin: 'Admin', funcionario: 'Funcionário', operador: 'Operador' }

// Nessas telas o cargo some inteiro do cabeçalho (nem "Admin" aparece) — a
// pedido da administração. Só o Painel de Controle continua mostrando o
// cargo normalmente.
const TELAS_SEM_CARGO = ['financeiro', 'manutencao', 'abastecimento', 'clientes']

// Botão de engrenagem no cabeçalho, do lado do nome do usuário — abre direto
// a tela única "Configurações do sistema" (Painel de Controle). Só aparece
// quando a tela ativa é o Painel de Controle (TelaVagas repassa a ação via
// App.jsx; nas outras telas `acoes` vem null).
function MenuAcoesPainel({ acoes }) {
  if (!acoes) return null
  return (
    <button type="button" className="menu-acoes-botao" onClick={acoes.abrirConfiguracoes} title="Configurações do sistema">
      <IconSettings size={18} />
    </button>
  )
}

export default function Layout({
  children, appSelecionada, setAppSelecionada, telaAtiva, setTelaAtiva, perfil, titulo, acoesPainel,
}) {
  const app = APLICACOES.find((a) => a.chave === appSelecionada)

  // Único caso em que a logo do cabeçalho some por completo: a tela de
  // seleção de aplicações (nenhuma das 4 escolhida ainda), que já mostra
  // sua própria marca d'água grande no corpo via PaginaMarcaDagua.jsx — uma
  // segunda logo (mesmo em marca d'água) no topo ficaria redundante ali. Em
  // todas as outras telas (Painel de Controle, Clientes, Financeiro,
  // Manutenção, Abastecimento e as 3 aplicações "Em construção") a logo
  // continua no cabeçalho, na mesma posição/tamanho/arquivo de sempre — com
  // opacidade reduzida (ver .topo-logo no index.css), virando marca d'água
  // ali mesmo em vez de sumir — EXCETO no Painel de Controle, onde a logo
  // volta a ser sólida (.topo-logo-solida), a pedido explícito: desfaz só
  // essa parte da mudança, sem mexer em mais nada.
  const mostrarLogoTopo = appSelecionada !== null
  const logoSolida = appSelecionada === 'marine' && telaAtiva === 'vagas'

  return (
    <div className="app-shell">
      {/* .sidebar-fixa: fica sempre aberta (mesmo sem o cursor em cima)
          sempre que não há nada de verdade pra navegar — nem aplicação
          escolhida ainda, nem uma das 3 aplicações ainda "Em construção"
          (RV NautDoc / RV e-Náutica / RV Engenharia). Só volta ao
          comportamento dinâmico normal (esconde/revela por hover) dentro
          do RV Marine, que é a única com telas de verdade. */}
      <aside className={`sidebar ${appSelecionada !== 'marine' ? 'sidebar-fixa' : ''}`}>
        <img src="/rv-invictus-logo-dourado.png" alt="RV Invictus" className="sidebar-logo" />

        {app ? (
          <>
            {/* Nome da aplicação escolhida vira título fixo — não é mais um
                item de lista, e as outras 3 aplicações somem daqui. */}
            <p className="app-titulo">{app.prefixo} {app.nome}</p>

            {/* RV Marine tem os itens de verdade; as outras 3 aplicações
                ainda não têm telas — mostram um único item fixo "Em
                construção" no lugar da lista, só pra manter a mesma
                composição visual (título + lista) em qualquer aplicação
                escolhida. Não é clicável (não tem nada pra abrir ainda). */}
            {appSelecionada === 'marine' ? (
              <nav>
                {ITENS_MENU.map(({ chave, label }) => (
                  <button
                    key={chave}
                    className={`nav-item ${telaAtiva === chave ? 'ativo' : ''}`}
                    onClick={(e) => { setTelaAtiva(chave); e.currentTarget.blur() }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            ) : (
              <nav>
                <div className="nav-item ativo nav-item-estatico">Em construção</div>
              </nav>
            )}

            <button
              type="button"
              className="nav-voltar"
              onClick={(e) => { e.currentTarget.blur(); setAppSelecionada(null) }}
            >
              <IconArrowLeft size={14} /> Aplicações
            </button>
          </>
        ) : (
          // Nenhuma aplicação escolhida ainda: seletor das 4 aplicações RV
          // Invictus, no lugar da lista de itens. "RV" e o nome da
          // aplicação em spans separados — o nome tem fonte um pouco maior
          // (e cresce mais ainda no hover), o "RV" fica do mesmo tamanho
          // sempre (ver .nav-app-item-prefixo/-nome no index.css).
          <nav className="nav-apps">
            {APLICACOES.map(({ chave, prefixo, nome }) => (
              <button
                key={chave}
                className="nav-app-item"
                onClick={(e) => { setAppSelecionada(chave); e.currentTarget.blur() }}
              >
                <span className="nav-app-item-prefixo">{prefixo}</span>{' '}
                <span className="nav-app-item-nome">{nome}</span>
              </button>
            ))}
          </nav>
        )}

        <a className="sidebar-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">RVinvictus.com.br</a>
      </aside>
      <main className="conteudo">
        <header className="topo">
          {/* Cabeçalho institucional único da área interna, em 3 colunas
              (título | logo | ações) — a logo fica sempre centralizada no
              meio da página, na MESMA posição/tamanho/arquivo de sempre, em
              QUALQUER aba, exceto a tela de seleção de aplicações (onde
              mostrarLogoTopo é false — ver acima; a coluna do meio fica
              vazia, sem tirar título/ações do lugar, já que as colunas de
              fora têm a mesma largura — ver grid-template-columns
              1fr auto 1fr abaixo). Opacidade reduzida (.topo-logo no
              index.css): a logo virou marca d'água no próprio cabeçalho, em
              vez de sumir ou se mudar pro corpo da página. Versão preta da
              logo: o fundo aqui é claro, a combinação que o manual reserva
              pra logo dourada é só sobre fundo escuro (sidebar/login). */}
          <div className="topo-titulo-area">
            {titulo && <h1>{titulo}</h1>}
          </div>
          <div className="topo-logo-area">
            {mostrarLogoTopo && (
              <img
                src="/rv-invictus-logo.png"
                alt="RV Invictus"
                className={`topo-logo ${logoSolida ? 'topo-logo-solida' : ''}`}
              />
            )}
          </div>
          <div className="topo-direita">
            {appSelecionada === 'marine' && !TELAS_SEM_CARGO.includes(telaAtiva) && (
              <span className="usuario">{LABEL_CARGO[perfil?.role] || 'Usuário'}</span>
            )}
            <MenuAcoesPainel acoes={acoesPainel} />
            {/* Sair saiu do menu lateral — agora fica sempre visível aqui,
                no canto superior direito da página, qualquer que seja a
                aplicação/tela atual. */}
            <button type="button" className="botao-sair" onClick={(e) => { e.currentTarget.blur(); supabase.auth.signOut() }}>
              <IconLogout size={16} /> Sair
            </button>
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
