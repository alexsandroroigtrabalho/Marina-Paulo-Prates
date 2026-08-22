import { useEffect, useRef, useState } from 'react'
import { IconSettings } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'

const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'documentacao', label: 'Despachos' },
]

// Menu de engrenagem no cabeçalho, do lado do nome do usuário — reúne as
// ações do Painel de Controle (ativar sons, histórico de manobras, gerenciar
// combustíveis) que antes ficavam como botões fixos em cima da Fila de
// Rampa. Só aparece quando a tela ativa é o Painel de Controle (TelaVagas
// repassa as ações via App.jsx; nas outras telas `acoes` vem null).
function MenuAcoesPainel({ acoes }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  if (!acoes) return null

  function executar(acao) {
    acao()
    setAberto(false)
  }

  return (
    <div className="menu-acoes" ref={ref}>
      <button type="button" className="menu-acoes-botao" onClick={() => setAberto(!aberto)} title="Ações do painel">
        <IconSettings size={18} />
      </button>
      {aberto && (
        <div className="menu-acoes-dropdown">
          <button type="button" onClick={() => executar(acoes.ativarSons)}>
            {acoes.sonsAtivados ? '🔔 Sons ativados' : '🔔 Ativar sons'}
          </button>
          <button type="button" onClick={() => executar(acoes.abrirHistorico)}>Histórico de manobras</button>
          <button type="button" onClick={() => executar(acoes.abrirCombustiveis)}>Gerenciar combustíveis</button>
          <button type="button" onClick={() => executar(acoes.abrirConfigApitos)}>Configurar apitos</button>
        </div>
      )}
    </div>
  )
}

export default function Layout({ children, telaAtiva, setTelaAtiva, perfil, titulo, acoesPainel }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src="/rv-invictus-logo-dourado.png" alt="RV Invictus" className="sidebar-logo" />
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
        <button className="nav-item sair" onClick={(e) => { e.currentTarget.blur(); supabase.auth.signOut() }}>
          Sair
        </button>
        <p className="sidebar-rodape">Desenvolvido por RV Invictus</p>
      </aside>
      <main className="conteudo">
        <header className="topo">
          <h1>{titulo}</h1>
          <div className="topo-direita">
            <span className="usuario">{perfil?.nome || 'Usuário'} ({perfil?.role || '...'})</span>
            <MenuAcoesPainel acoes={acoesPainel} />
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
