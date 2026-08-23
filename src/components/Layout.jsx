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

  return (
    <div className="app-shell">
      {/* .sidebar-fixa: enquanto nenhuma aplicação está escolhida, a sidebar
          fica sempre aberta (mesmo sem o cursor em cima) — só volta a
          esconder/revelar por hover (comportamento normal) depois que uma
          aplicação é selecionada. */}
      <aside className={`sidebar ${!appSelecionada ? 'sidebar-fixa' : ''}`}>
        <img src="/rv-invictus-logo-dourado.png" alt="RV Invictus" className="sidebar-logo" />

        {app ? (
          <>
            {/* Nome da aplicação escolhida vira título fixo — não é mais um
                item de lista, e as outras 3 aplicações somem daqui. */}
            <p className="app-titulo">{app.prefixo} {app.nome}</p>

            {/* Só RV Marine tem itens; as outras 3 aplicações ainda não têm
                telas (App.jsx mostra "Em construção" na área de conteúdo). */}
            {appSelecionada === 'marine' && (
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
          <h1>{titulo}</h1>
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
