import { supabase } from '../lib/supabase'

const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'documentacao', label: 'Despachos' },
]

export default function Layout({ children, telaAtiva, setTelaAtiva, perfil, titulo, headerExtra }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav>
          {ITENS_MENU.map(({ chave, label }) => (
            <button
              key={chave}
              className={`nav-item ${telaAtiva === chave ? 'ativo' : ''}`}
              onClick={() => setTelaAtiva(chave)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="nav-item sair" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </aside>
      <main className="conteudo">
        <header className="topo">
          <h1>{titulo}</h1>
          <div className="topo-centro">{headerExtra}</div>
          <span className="usuario">{perfil?.nome || 'Usuário'} ({perfil?.role || '...'})</span>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
