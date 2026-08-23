import { IconSettings } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'

const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'documentacao', label: 'Despachos' },
  { chave: 'abastecimento', label: 'Abastecimento' },
]

// Cabeçalho mostra só o cargo (ex: "Admin"), nunca o nome cadastrado da
// pessoa (ex: "Admin Teste") — a pedido da administração, pra não expor um
// nome de conta de teste/pessoal em nenhuma tela interna (Painel de
// Controle, Clientes, Manutenção, Despachos, Abastecimento — todas passam
// por este mesmo Layout). Vale para as 3 roles internas (ver
// PAPEIS_INTERNOS em App.jsx).
const LABEL_CARGO = { admin: 'Admin', funcionario: 'Funcionário', operador: 'Operador' }

// Nessas telas o cargo some inteiro do cabeçalho (nem "Admin" aparece) — a
// pedido da administração. Financeiro já ficava assim antes; agora
// Manutenção, Despachos e Abastecimento entraram na mesma lista. Painel de
// Controle e Clientes continuam mostrando o cargo normalmente.
const TELAS_SEM_CARGO = ['financeiro', 'manutencao', 'documentacao', 'abastecimento']

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
            {!TELAS_SEM_CARGO.includes(telaAtiva) && (
              <span className="usuario">{LABEL_CARGO[perfil?.role] || 'Usuário'}</span>
            )}
            <MenuAcoesPainel acoes={acoesPainel} />
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
