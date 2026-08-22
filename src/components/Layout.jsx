import { useEffect, useRef, useState } from 'react'
import { IconSettings } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { listarClientes, listarEmbarcacoes } from '../lib/db'

const ITENS_MENU = [
  { chave: 'vagas', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'documentacao', label: 'Despachos' },
]

// Escapa um valor pra uma célula de CSV separado por ";" (padrão do Excel
// em pt-BR): só entra entre aspas quando o texto tem ";", aspas ou quebra
// de linha, dobrando aspas internas conforme a regra do formato.
function paraCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (/[";\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

// Monta a planilha (CSV) com todos os clientes cadastrados na marina — um
// por linha, com as embarcações vinculadas juntas numa coluna só — e
// dispara o download direto no navegador (sem precisar de backend).
async function exportarClientesCsv(marinaId) {
  const [clientes, embarcacoes] = await Promise.all([
    listarClientes(marinaId),
    listarEmbarcacoes(marinaId),
  ])

  const cabecalho = [
    'Nº', 'Nome', 'E-mail', 'Telefone', 'Carteira/CPF', 'Endereço', 'Observações',
    'Embarcações', 'Cadastro', 'Pagamento', 'Acesso à Agenda',
  ]
  const linhas = clientes.map((c, i) => {
    const embarcacoesDoCliente = embarcacoes
      .filter((e) => e.cliente_id === c.id)
      .map((e) => `${e.nome} (${e.tipo})`)
      .join(' · ')
    const acesso = c.acesso_suspenso
      ? 'Suspenso'
      : c.pagamento_confirmado ? 'Liberado' : 'Aguardando pagamento'
    return [
      i + 1,
      c.nome,
      c.email,
      c.telefone,
      c.cpf_cnpj,
      c.endereco,
      c.observacoes,
      embarcacoesDoCliente,
      c.cadastro_confirmado ? 'Realizado' : 'Pendente',
      c.pagamento_confirmado ? 'Efetuado' : 'Pendente',
      acesso,
    ].map(paraCsv).join(';')
  })

  // BOM no início garante que o Excel abra os acentos corretamente.
  const csv = '﻿' + [cabecalho.map(paraCsv).join(';'), ...linhas].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// Engrenagem de configurações da administração, ao lado do nome do usuário
// no cabeçalho — mesmo padrão visual/interação da engrenagem de ações do
// Painel de Controle (MenuAcoesPainel), mas sempre visível em qualquer
// tela interna. Por enquanto só tem a opção de exportar a planilha de
// clientes; é o lugar natural pra outras configurações administrativas.
function MenuConfigAdmin({ marinaId }) {
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

  async function exportar() {
    if (!marinaId || exportando) return
    setExportando(true)
    try {
      await exportarClientesCsv(marinaId)
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
            {exportando ? 'Exportando...' : 'Exportar clientes (planilha)'}
          </button>
        </div>
      )}
    </div>
  )
}

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
            <MenuConfigAdmin marinaId={perfil?.marina_id} />
            <MenuAcoesPainel acoes={acoesPainel} />
          </div>
        </header>
        <div className="corpo">{children}</div>
      </main>
    </div>
  )
}
