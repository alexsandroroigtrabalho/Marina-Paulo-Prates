import { IconSettings, IconArrowLeft, IconLogout } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { APLICACOES, TELAS_RV_MASTER, buscarApp, temTelas, ICONES_APLICACAO, DESCRICOES_APLICACAO } from '../lib/apps'
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
  // paginaVendas: telas de PaginaVendas.jsx (aplicação "Em construção" ou
  // fora do plano contratado) — pedido do Alex (06/09/2026): esconde o
  // nome da aplicação e o "Em construção" da sidebar (o cartão de vendas
  // já mostra o nome) e o botão "Sair" do cabeçalho (essa tela não é um
  // destino de trabalho de verdade, só uma vitrine — sair da conta não faz
  // sentido aqui; a volta continua pela seta "Aplicações" na sidebar).
  marinaId, aoVoltarRvMaster, semSeletorApps, paginaVendas,
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
  // checar a aplicação — a tela já identifica sozinha. 'alunosEnautica' é o
  // Painel de Controle do e-Náutica — pedido explícito do Alex, só nesta
  // tela: a logo do cabeçalho fica sólida e na versão PRETA (arquivo
  // rv-invictus-logo-preto.png, já usado como marca d'água em outro lugar
  // do sistema), sem mexer em nenhuma outra tela.
  // paginaVendas entra também aqui (logoSolida): a logo do cabeçalho nessas
  // telas fica em opacidade reduzida (0.14, ver .topo-logo) por padrão — a
  // pedido do Alex (06/09/2026) ela precisa aparecer sólida (opacity: 1)
  // pra dar pra perceber a troca de cor abaixo; numa marca d'água quase
  // invisível a diferença de cor não se notava.
  const logoSolida = telaAtiva === 'vagas' || telaAtiva === 'alunosEnautica' || paginaVendas
  // paginaVendas: pedido do Alex (06/09/2026) — junto com o fundo preto do
  // botão "Fale Conosco", a logo do cabeçalho nas páginas de vendas também
  // passa a ser a versão preta (mesmo arquivo já usado no Painel de
  // Controle do e-Náutica), em vez da versão colorida padrão.
  const logoPreta = telaAtiva === 'alunosEnautica' || paginaVendas

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
          escolhida ainda, nem uma aplicação ainda "Em construção" (sem
          nenhuma tela real, ver `temTelas` em lib/apps.js). Volta ao
          comportamento dinâmico normal (esconde/revela por hover) em
          QUALQUER aplicação que já tenha telas de verdade (RV Marine,
          e-Náutica, Manut, Finance, ...) e também na área própria do
          rv_master (`semSeletorApps`) — todas essas têm conteúdo pra
          navegar, então o menu se comporta do mesmo jeito em qualquer
          uma, não como a vitrine "escolha uma aplicação" (essa sim
          continua sempre aberta, sem precisar de hover).
          `&& !paginaVendas`: pedido do Alex (06/09/2026) — nas páginas de
          vendas o menu lateral também passa a ser dinâmico (esconde/revela
          por hover), em vez de ficar sempre aberto sem nada de verdade pra
          mostrar (o cartão de vendas já cobre nome/ícone/recursos, e a
          seta de voltar saiu daqui, ver nav-voltar mais abaixo). */}
      {/* sidebar-apps: só na tela de seleção de aplicações (nenhuma
          escolhida ainda — app === null e não é a área do rv_master) —
          pedido do Alex (06/09/2026): losangos dourados no fundo e uma
          linha dourada mais marcada na lateral, igual à identidade visual
          da tela de login/seleção do cliente (.tela-login-rv), só nesta
          tela específica do menu, sem mexer nas demais (app escolhido,
          "Em construção", RV Master). */}
      <aside className={`sidebar ${!temTelas(app) && !semSeletorApps && !paginaVendas ? 'sidebar-fixa' : ''} ${!app && !semSeletorApps ? 'sidebar-apps' : ''} ${paginaVendas ? 'sidebar-vendas' : ''}`}>
        {/* paginaVendas: pedido do Alex (06/09/2026) — troca a logo
            horizontal (elmo + "RV Invictus" lado a lado) e o link do
            rodapé pela logo VERTICAL (elmo em cima, "RV Invictus" embaixo,
            rv-invictus-vertical-dourado.png), sozinha e centralizada na
            vertical do menu (margin:auto no .sidebar-logo-vertical, ver
            index.css) — sem título de aplicação, sem lista de telas, sem
            seta de voltar (foi pro canto superior direito) e sem link do
            site aqui embaixo, não sobra mais nada além da logo pra
            preencher o menu lateral. */}
        {paginaVendas ? (
          <img src="/rv-invictus-vertical-dourado.png" alt="RV Invictus" className="sidebar-logo-vertical" />
        ) : (
          <img src="/rv-invictus-logo-dourado.png" alt="RV Invictus" className="sidebar-logo" />
        )}

        {app ? (
          <>
            {/* paginaVendas: nem o nome da aplicação nem "Em construção"
                aparecem aqui — pedido do Alex (06/09/2026), o cartão de
                vendas no corpo já mostra o nome, repetir na sidebar é
                redundante. Sobra só a seta de voltar, abaixo. */}
            {!paginaVendas && (
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
              </>
            )}

            {/* Só o ícone, sem o texto "Aplicações" — pedido do Alex
                (06/09/2026): o texto de voltar pra aplicações some do
                menu lateral dinâmico (o botão continua funcionando igual,
                só ficou mais discreto — o botão "Sair" do cabeçalho agora
                cobre esse mesmo caminho nos Painéis de Controle, ver
                botao-sair abaixo).
                paginaVendas: pedido do Alex (06/09/2026) — a seta sai
                inteiramente do menu lateral e vai pro canto superior
                direito da página (ver botao-sair no cabeçalho, mais
                abaixo), então some daqui pra não duplicar. */}
            {!paginaVendas && (
              <button
                type="button"
                className="nav-voltar"
                title="Aplicações"
                aria-label="Aplicações"
                onClick={(e) => { e.currentTarget.blur(); setAppSelecionada(null) }}
              >
                <IconArrowLeft size={14} />
              </button>
            )}
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
          // usa, só que aqui pro conjunto de telas do rv_master). A lista
          // fica NO TOPO (logo abaixo do título), sem margin-top:auto — quem
          // empurra o rodapé (RVinvictus.com.br) pro fundo de verdade da
          // sidebar é o `<div className="nav-rvmaster-espaco">` isolado
          // depois dela, não a lista em si (mesmo papel que `.nav-voltar`
          // cumpre lá em cima, só que aqui sem nenhum botão de "voltar" de
          // verdade — o rv_master não tem uma tela "acima" da própria dele). */}
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
            <div className="nav-rvmaster-espaco" aria-hidden="true" />
          </>
        ) : (
          // Nenhuma aplicação escolhida ainda: seletor das aplicações RV
          // Invictus no lugar da lista de itens — a MESMA lista, na mesma
          // ordem e com os mesmos nomes que o cliente vê depois do login
          // (lib/apps.js é a fonte única; ver SelecaoAplicacoes.jsx).
          // Pedido do Alex (06/09/2026, ajustado no mesmo dia): cartões no
          // mesmo desenho dos botões que o cliente vê na seleção de
          // aplicações (ícone em selo dourado + nome + descrição, contorno
          // dourado, mesmo hover), em versão pequena — ícone EM CIMA do
          // nome (não do lado) e grade de 2 colunas (não coluna única),
          // do tamanho da sidebar — mesma composição do cartão grande
          // (.selecao-app-item), só menor. ICONES_APLICACAO/
          // DESCRICOES_APLICACAO vêm de lib/apps.js, a mesma fonte que
          // SelecaoAplicacoes.jsx usa, pra nunca divergir de lá.
          <nav className="nav-apps">
            {APLICACOES.map(({ chave, prefixo, nome }) => {
              const Icone = ICONES_APLICACAO[chave]
              return (
                <button
                  key={chave}
                  type="button"
                  className="nav-app-card"
                  onClick={(e) => { setAppSelecionada(chave); e.currentTarget.blur() }}
                >
                  {/* size 15 (era 14, chegou a 17 num ajuste intermediário) —
                      acompanha o selo do ícone, reduzido de novo junto com
                      o cartão pra ficar mais quadrado (ver
                      .nav-app-card-icone no index.css). */}
                  <span className="nav-app-card-icone"><Icone size={15} stroke={1} /></span>
                  <span className="nav-app-card-nome">{prefixo} {nome}</span>
                  <span className="nav-app-card-desc">{DESCRICOES_APLICACAO[chave]}</span>
                </button>
              )
            })}
          </nav>
        )}

        {/* paginaVendas: link do rodapé some junto (ver comentário na logo
            vertical acima) — a marca já está representada pela logo
            vertical sozinha no meio do menu.
            !app && !semSeletorApps (a própria tela de seleção de
            aplicações): pedido do Alex (06/09/2026) — "remova o site da
            rv invictus do rodapé também", junto com os losangos do fundo
            (ver .sidebar.sidebar-apps no index.css) — nessa tela o link
            só disputava espaço com a grade de cartões, sem função além da
            que a logo no topo já cumpre. */}
        {!paginaVendas && !(!app && !semSeletorApps) && (
          <a className="sidebar-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">RVinvictus.com.br</a>
        )}
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
                src={logoPreta ? '/rv-invictus-logo-preto.png' : '/rv-invictus-logo.png'}
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
                aplicação/tela atual.
                Pedido do Alex (06/09/2026): nos Painéis de Controle (RV
                Marine "vagas" e e-Náutica "alunosEnautica") este botão
                deixa de encerrar a sessão — volta pra tela de seleção de
                aplicações (setAppSelecionada(null)), igual ao antigo
                botão "Aplicações" da sidebar (que perdeu o texto, ver
                nav-voltar acima). Sair de verdade (signOut) continua
                existindo normalmente em qualquer outra tela, inclusive a
                própria seleção de aplicações — dá pra chegar nele saindo
                do Painel de Controle primeiro.
                paginaVendas entra no mesmo caso das Painéis de Controle
                (seta de voltar, não Sair) — pedido do Alex (06/09/2026):
                a seta que antes ficava no menu lateral da página de
                vendas passou pra cá. */}
            {paginaVendas || telaAtiva === 'vagas' || telaAtiva === 'alunosEnautica' ? (
              <button type="button" className="botao-sair" title="Aplicações" aria-label="Voltar para a seleção de aplicações"
                onClick={(e) => { e.currentTarget.blur(); setAppSelecionada(null) }}>
                <IconArrowLeft size={18} />
              </button>
            ) : (
              <button type="button" className="botao-sair" title="Sair" aria-label="Sair"
                onClick={(e) => { e.currentTarget.blur(); supabase.auth.signOut() }}>
                <IconLogout size={18} />
              </button>
            )}
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
