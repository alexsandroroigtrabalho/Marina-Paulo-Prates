import { IconSettings, IconArrowLeft, IconLogout } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { APLICACOES, TELAS_RV_MASTER, buscarApp, temTelas } from '../lib/apps'
import SonsPainelAdmin from './SonsPainelAdmin'

// Cabeçalho mostra só o cargo (ex: "Admin"), nunca o nome cadastrado da
// pessoa (ex: "Admin Teste") — a pedido da administração, pra não expor um
// nome de conta de teste/pessoal em nenhuma tela interna. Só faz sentido
// dentro de RV Marine (as outras 3 aplicações não têm usuário "logado" numa
// tela de trabalho, são só "Em construção").
const LABEL_CARGO = { admin: 'Admin', funcionario: 'Funcionário', operador: 'Operador', rv_master: 'RV Master' }

// Nessas telas o cargo some inteiro do cabeçalho (nem "Admin" aparece) — a
// pedido da administração. Só o Painel de Controle continua mostrando o
// cargo normalmente. Financeiro e Manutenção seguem na lista depois de
// migrarem pro RV Finance e pro RV Manut: a regra é da TELA, não da
// aplicação onde ela mora.
const TELAS_SEM_CARGO = ['financeiro', 'manutencao', 'clientes']

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
  // marinaId: qual marina/escola tocar os apitos (SonsPainelAdmin) — pra
  // equipe normal é sempre igual a perfil.marina_id (repassado como
  // fallback abaixo), mas pro rv_master é o tenant que ele escolheu operar
  // (perfil.marina_id fica sempre vazio pra esse papel).
  // aoVoltarRvMaster: só existe pro rv_master com um tenant já escolhido —
  // mostra o botão "Voltar ao RV Master" no cabeçalho, ao lado de Sair.
  // semSeletorApps: esconde o seletor de aplicações da sidebar — usado só
  // na TelaRvMaster (escolher uma aplicação antes de escolher o cliente não
  // faz sentido).
  marinaId, aoVoltarRvMaster, semSeletorApps,
}) {
  const app = buscarApp(appSelecionada)

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
  // 'vagas' (Painel de Controle) só existe no RV Marine, então não precisa
  // checar a aplicação — a tela já identifica sozinha.
  const logoSolida = telaAtiva === 'vagas'

  return (
    <div className="app-shell">
      {/* Apito global do painel administrativo: montado aqui (o shell que
          envolve TODAS as telas da equipe, em qualquer aplicação/tela
          escolhida) pra tocar os apitos configurados mesmo com o
          administrador fora do Painel de Controle — ver
          SonsPainelAdmin.jsx. Não desenha nada (retorna null). */}
      <SonsPainelAdmin marinaId={marinaId ?? perfil?.marina_id} />
      {/* .sidebar-fixa: fica sempre aberta (mesmo sem o cursor em cima)
          sempre que não há nada de verdade pra navegar — nem aplicação
          escolhida ainda, nem uma das 3 aplicações ainda "Em construção"
          (todas menos o RV Marine). Só volta ao
          comportamento dinâmico normal (esconde/revela por hover) dentro
          do RV Marine, que é a única com telas de verdade. */}
      <aside className={`sidebar ${appSelecionada !== 'marine' ? 'sidebar-fixa' : ''}`}>
        <img src="/rv-invictus-logo-dourado.png" alt="RV Invictus" className="sidebar-logo" />

        {app ? (
          <>
            {/* Nome da aplicação escolhida vira título fixo — não é mais um
                item de lista, e as outras 3 aplicações somem daqui. */}
            <p className="app-titulo">{app.prefixo} {app.nome}</p>

            {/* RV Marine tem os itens de verdade; as outras aplicações
                ainda não têm telas — mostram um único item fixo "Em
                construção" no lugar da lista, só pra manter a mesma
                composição visual (título + lista) em qualquer aplicação
                escolhida. Não é clicável (não tem nada pra abrir ainda). */}
            {temTelas(app) ? (
              <nav>
                {app.telas.map(({ chave, label }) => (
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
        ) : semSeletorApps ? (
          // Tela do rv_master ANTES de escolher um cliente (App.jsx): mesma
          // composição "título fixo + lista de telas" das demais aplicações
          // (linha 81 acima), com "RV MASTER" no lugar do nome do tenant —
          // afinal, pro rv_master, esta É a aplicação dele (a ferramenta da
          // própria RV Invictus, não um cliente). TELAS_RV_MASTER vem de
          // lib/apps.js ("Painel de Controle" e "Clientes" hoje) — lista de
          // verdade clicável, igual à de qualquer outra aplicação (`telaAtiva`/
          // `setTelaAtiva` são os MESMOS props que a `app.telas.map` acima já
          // usa, só que aqui pro conjunto de telas do rv_master).
          // `.nav-rvmaster` carrega o mesmo margin-top:auto que .nav-voltar
          // usa nas outras aplicações, pra empurrar o rodapé (RVinvictus.com.br)
          // pro fundo de verdade da sidebar — sem isso ele ficava colado
          // embaixo da logo, com um vão vazio enorme até o fim da tela.
          <>
            <p className="app-titulo">RV MASTER</p>
            <nav className="nav-rvmaster">
              {TELAS_RV_MASTER.map(({ chave, label }) => (
                <button
                  key={chave}
                  className={`nav-item ${telaAtiva === chave ? 'ativo' : ''}`}
                  onClick={(e) => { setTelaAtiva(chave); e.currentTarget.blur() }}
                >
                  {label}
                </button>
              ))}
            </nav>
          </>
        ) : (
          // Nenhuma aplicação escolhida ainda: seletor das aplicações RV
          // Invictus no lugar da lista de itens — a MESMA lista, na mesma
          // ordem e com os mesmos nomes que o cliente vê depois do login
          // (lib/apps.js é a fonte única; ver SelecaoAplicacoes.jsx). "RV" e
          // o nome da aplicação em spans separados — o nome tem fonte um
          // pouco maior (e cresce mais ainda no hover), o "RV" fica do mesmo
          // tamanho sempre (ver .nav-app-item-prefixo/-nome no index.css).
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
            {telaAtiva && !TELAS_SEM_CARGO.includes(telaAtiva) && (
              <span className="usuario">{LABEL_CARGO[perfil?.role] || 'Usuário'}</span>
            )}
            <MenuAcoesPainel acoes={acoesPainel} />
            {aoVoltarRvMaster && (
              <button type="button" className="botao-sair" title="Voltar ao RV Master" aria-label="Voltar ao RV Master"
                onClick={(e) => { e.currentTarget.blur(); aoVoltarRvMaster() }}>
                <IconArrowLeft size={18} />
              </button>
            )}
            {/* Sair saiu do menu lateral — agora fica sempre visível aqui,
                no canto superior direito da página, qualquer que seja a
                aplicação/tela atual. */}
            <button type="button" className="botao-sair" title="Sair" aria-label="Sair"
              onClick={(e) => { e.currentTarget.blur(); supabase.auth.signOut() }}>
              <IconLogout size={18} />
            </button>
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
