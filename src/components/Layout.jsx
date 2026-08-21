import {
  IconUsers, IconCash, IconTool, IconLogout, IconFileCertificate, IconDeviceTv,
} from '@tabler/icons-react'
import { supabase } from '../lib/supabase'

const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle', Icone: IconDeviceTv },
  { chave: 'clientes', label: 'Clientes', Icone: IconUsers },
  { chave: 'financeiro', label: 'Financeiro', Icone: IconCash },
  { chave: 'manutencao', label: 'Manutenção', Icone: IconTool },
  { chave: 'documentacao', label: 'Despachos', Icone: IconFileCertificate },
]

export default function Layout({ children, telaAtiva, setTelaAtiva, perfil, titulo }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav>
          {ITENS_MENU.map(({ chave, label, Icone }) => (
            <button
              key={chave}
              className={`nav-item ${telaAtiva === chave ? 'ativo' : ''}`}
              onClick={() => setTelaAtiva(chave)}
            >
              <Icone size={18} /> {label}
            </button>
          ))}
        </nav>
        <button className="nav-item sair" onClick={() => supabase.auth.signOut()}>
          <IconLogout size={18} /> Sair
        </button>
      </aside>
      <main className="conteudo">
        <header className="topo">
          <h1>{titulo}</h1>
          <span className="usuario">{perfil?.nome || 'Usuário'} ({perfil?.role || '...'})</span>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
