import { useEffect, useRef, useState } from 'react'
import { IconSettings } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { exportarClientesCsv, exportarManutencaoCsv, exportarDespachosCsv } from '../lib/exportarPlanilha'

const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'documentacao', label: 'Despachos' },
  { chave: 'abastecimento', label: 'Abastecimento' },
]

// Cada aba com exportação tem sua própria planilha (dados completos da
// área, não só o que está filtrado na tela) — a engrenagem no cabeçalho
// mostra só a opção que faz sentido pra aba ativa no momento. Vagas
// (Painel de Controle) não entra aqui: ela já tem sua própria engrenagem
// (MenuAcoesPainel, com o aviso sonoro e as demais ações do painel).
// Financeiro também não tem opção de exportação por enquanto.
const OPCOES_EXPORTACAO = {
  clientes: { rotulo: 'Exportar planilha de clientes', exportar: exportarClientesCsv },
  manutencao: { rotulo: 'Exportar planilha de manutenção', exportar: exportarManutencaoCsv },
  documentacao: { rotulo: 'Exportar/Baixar planilha', exportar: exportarDespachosCsv },
}

// Engrenagem de exportação no cabeçalho — mesmo padrão visual/interação
// da engrenagem de ações do Painel de Controle (MenuAcoesPainel): ícone
// que abre um dropdown com a opção de planilha da aba ativa. Não aparece
// em abas sem opção de exportação configurada acima.
function MenuExportar({ telaAtiva, marinaId }) {
  const [aberto, setAberto] = useState(false)
  const [exportando, setExportando] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  const opcao = OPCOES_EXPORTACAO[telaAtiva]
  if (!opcao) return null

  async function exportar() {
    if (!marinaId || exportando) return
    setExportando(true)
    try {
      await opcao.exportar(marinaId)
      setAberto(false)
    } catch (err) {
      alert('Não foi possível exportar a planilha: ' + err.message)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="menu-acoes" ref={ref}>
      <button type="button" className="menu-acoes-botao" onClick={() => setAberto(!aberto)} title="Configurações">
        <IconSettings size={18} />
      </button>
      {aberto && (
        <div className="menu-acoes-dropdown">
          <button type="button" onClick={exportar} disabled={exportando}>
            {exportando ? 'Exportando...' : opcao.rotulo}
          </button>
        </div>
      )}
    </div>
  )
}

// Botão de engrenagem no cabeçalho, do lado do nome do usuário — abre direto
// a tela única "Configurações do sistema" (Painel de Controle). Antes era um
// menu dropdown com os itens soltos (aviso sonoro, histórico, combustíveis,
// apitos); todos migraram pra lá (ver ConfiguracoesPainel.jsx), então virou
// um botão simples em vez de dropdown — "Histórico de manobras" ganhou seu
// próprio botão fixo na página do Painel de Controle, por não ser uma
// configuração. Só aparece quando a tela ativa é o Painel de Controle
// (TelaVagas repassa a ação via App.jsx; nas outras telas `acoes` vem null).
function MenuAcoesPainel({ acoes }) {
  if (!acoes) return null
  return (
    <button type="button" className="menu-acoes-botao" onClick={acoes.abrirConfiguracoes} title="Configurações do sistema">
      <IconSettings size={18} />
    </button>
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
            {/* Na aba Financeiro o nome do usuário logado fica de fora do
                cabeçalho, a pedido — nas demais abas continua aparecendo
                normalmente. */}
            {telaAtiva !== 'financeiro' && (
              <span className="usuario">{perfil?.nome || 'Usuário'} ({perfil?.role || '...'})</span>
            )}
            <MenuExportar telaAtiva={telaAtiva} marinaId={perfil?.marina_id} />
            <MenuAcoesPainel acoes={acoesPainel} />
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
