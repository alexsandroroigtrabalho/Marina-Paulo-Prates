import { useEffect, useState } from 'react'
import { buscarMarina, atualizarConfigMarina } from '../lib/db'
import {
  MODULOS_AULA, extrairYoutubeId, listarMatriculas, excluirMatriculaDefinitivamente, labelHabilitacao,
} from '../lib/enautica'
import { maskCnpj, maskCpf } from '../lib/mascaras'

// Configurações do RV e-Náutica, mesmo padrão de ConfiguracoesPainel.jsx (RV
// Marine): abas por categoria, tudo gravado em marina.marinas.config_json —
// abre via engrenagem no cabeçalho (ver TelaMatriculasENautica.jsx/onAcoes),
// só admin edita de verdade (funcionário/operador só consultam, campos
// desabilitados — mesma regra e mesmo motivo do RV Marine: a policy
// "admin_atualiza_propria_marina" no banco só libera UPDATE de
// marina.marinas pra role='admin', então mesmo contornando a tela o banco
// recusaria a escrita).
//
// Duas categorias:
//   - Aulas preparatórias (config_json.aulas): vídeo de cada uma das 3
//     aulas. Sem isso preenchido, a aba do aluno nunca mostra vídeo nenhum.
//   - Documentos (config_json.documentos): dados institucionais da escola
//     que entram nos 4 documentos gerados por aluno (ver
//     lib/enauticaDocumentos.js e o botão "Documentos" na aba Aprovadas de
//     TelaMatriculasENautica.jsx) — CNPJ e responsável técnico não têm
//     coluna própria em marina.marinas (só nome/email/telefone/endereco),
//     por isso ficam aqui dentro do config_json, mesmo mecanismo já usado
//     pra "aulas".
// "Histórico" (pedido do Alex, 05/09/2026): antes era a 2ª aba do Painel de
// Controle (TelaAlunosENautica.jsx) — saiu de lá e virou uma categoria aqui
// dentro de Configurações. Revisão de 06/09/2026 (pedido do Alex):
// simplificado pra só 2 ações — "Exportar planilha" (CSV com TODOS os
// arquivados, é um relatório) e "Limpar histórico" (apaga TODOS os
// arquivados de vez, sem selecionar um por um — mesmo padrão de
// TelaAgendamentosENautica.jsx). Restaurar/Baixar documentos/seleção
// individual saíram — se precisar de volta, avisar.
const CATEGORIAS = [
  { chave: 'aulas', label: 'Aulas preparatórias' },
  { chave: 'documentos', label: 'Documentos' },
  { chave: 'historico', label: 'Histórico' },
]

const DOC_CAMPOS_VAZIOS = {
  cnpj: '', responsavelNome: '', responsavelCargo: '', responsavelCpf: '', instrutorNome: '', instrutorCpf: '',
  // Usados só na Lista de Alunos para Aulas Práticas (agenda → aula
  // prática → botão "Lista de alunos"): o rsnautica tem esses dois valores
  // fixos no código ("TRAMANDAÍ" / "Agência da Capitania dos Portos em
  // Tramandaí") porque só atende uma cidade — a RV Invictus atende mais de
  // uma escola/marina, então isso precisa ser configurável por escola.
  municipio: '', capitania: '',
  // Nome da ESCOLA náutica (ex.: "RS Náutica") pra aparecer nos documentos
  // — diferente do nome da marina/tenant no RV Marine (marina.nome, ex.:
  // "Marina Paulo Prates"), que é outra coisa. Pedido do Alex (06/09/2026):
  // a coluna "Escola Náutica" da Ata Presencial usava marina.nome por
  // engano; agora usa este campo (com marina.nome só de fallback, se vazio).
  nomeEscola: '',
}

export default function ConfiguracoesENautica({ aberto, onFechar, ehAdmin, marinaId }) {
  const [categoria, setCategoria] = useState('aulas')
  const [formAulas, setFormAulas] = useState(() => MODULOS_AULA.map((m) => ({ id: m.id, nome: m.titulo, valor: '' })))
  const [formDocumentos, setFormDocumentos] = useState(DOC_CAMPOS_VAZIOS)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  // Categoria "Histórico" — carregada só quando o admin abre essa aba (não
  // precisa disso pronto se ele só quer editar aulas/documentos).
  const [historicoAlunos, setHistoricoAlunos] = useState([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(false)
  const [limpandoHistorico, setLimpandoHistorico] = useState(false)

  async function carregar() {
    if (!marinaId) return
    const marina = await buscarMarina(marinaId)
    const overridesAulas = marina?.config_json?.aulas || []
    setFormAulas(MODULOS_AULA.map((m) => {
      const cfg = overridesAulas.find((o) => o.id === m.id)
      return { id: m.id, nome: cfg?.nome || m.titulo, valor: cfg?.youtubeId || '' }
    }))
    setFormDocumentos({ ...DOC_CAMPOS_VAZIOS, ...(marina?.config_json?.documentos || {}) })
    setMensagem('')
  }
  useEffect(() => { if (aberto) carregar() }, [aberto, marinaId])

  async function carregarHistorico() {
    if (!marinaId) return
    setCarregandoHistorico(true)
    try {
      const mats = await listarMatriculas(marinaId)
      setHistoricoAlunos(mats.filter((m) => m.arquivado))
    } catch (err) {
      setMensagem('Não foi possível carregar o histórico: ' + err.message)
    } finally {
      setCarregandoHistorico(false)
    }
  }
  useEffect(() => {
    if (aberto && categoria === 'historico') carregarHistorico()
  }, [aberto, categoria, marinaId])

  // "Limpar histórico" — apaga TODOS os alunos arquivados de vez (mesma
  // função excluirMatriculaDefinitivamente de sempre). Sem seleção por
  // linha — é tudo ou nada, com confirmação antes por ser irreversível
  // (mesmo padrão do "Limpar histórico" de TelaAgendamentosENautica.jsx).
  async function limparHistoricoTotal() {
    if (historicoAlunos.length === 0) return
    if (!window.confirm(`Limpar o histórico inteiro (${historicoAlunos.length} aluno${historicoAlunos.length > 1 ? 's' : ''})? Essa ação não pode ser desfeita — os dados das matrículas somem de vez.`)) return
    setLimpandoHistorico(true)
    try {
      for (const m of historicoAlunos) await excluirMatriculaDefinitivamente(m.id)
      await carregarHistorico()
    } catch (err) {
      alert('Não foi possível limpar o histórico: ' + err.message)
    } finally {
      setLimpandoHistorico(false)
    }
  }

  // Exportar planilha — CSV simples (abre certinho no Excel/Sheets), com
  // TODOS os alunos do histórico (não só os selecionados — é um relatório,
  // não uma ação em lote). ";" como separador e BOM no início do arquivo:
  // sem isso o Excel em português confunde a vírgula decimal com o
  // separador de coluna e/ou mostra acento errado.
  function exportarPlanilhaHistorico() {
    const linhas = [
      ['Nome', 'Telefone', 'Habilitação', 'Arquivado em'],
      ...historicoAlunos.map((m) => [
        m.clientes?.nome || '',
        m.clientes?.telefone || '',
        labelHabilitacao(m.habilitacao),
        m.arquivado_em ? new Date(m.arquivado_em).toLocaleDateString('pt-BR') : '',
      ]),
    ]
    const csv = linhas.map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historico-enautica-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function mudarCampoAula(id, valor) {
    setFormAulas((f) => f.map((c) => (c.id === id ? { ...c, valor } : c)))
  }

  function mudarNomeAula(id, nome) {
    setFormAulas((f) => f.map((c) => (c.id === id ? { ...c, nome } : c)))
  }

  function mudarCategoria(c) {
    setCategoria(c)
    setMensagem('')
  }

  async function salvarAulas(e) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')
    try {
      // Extrai o ID de cada campo na hora de salvar (não a cada tecla) —
      // assim o admin pode colar a URL inteira e ver ela normal no campo
      // até confirmar; só o que vai pro banco é o ID puro. O nome só é
      // salvo quando o admin de fato mudou (diferente do "Aula 0N" padrão)
      // — assim uma escola que nunca editou nada não grava lixo no
      // config_json à toa, e o padrão (MODULOS_AULA) continua valendo.
      const aulas = formAulas
        .map((c) => {
          const original = MODULOS_AULA.find((m) => m.id === c.id)
          const nomeMudou = c.nome.trim() && c.nome.trim() !== original?.titulo
          return { id: c.id, nome: nomeMudou ? c.nome.trim() : undefined, youtubeId: extrairYoutubeId(c.valor) }
        })
        .filter((c) => c.nome || c.youtubeId)
      await atualizarConfigMarina(marinaId, { aulas })
      setMensagem('Vídeos das aulas preparatórias salvos com sucesso.')
    } catch (err) {
      setMensagem('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function salvarDocumentos(e) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')
    try {
      await atualizarConfigMarina(marinaId, { documentos: formDocumentos })
      setMensagem('Dados dos documentos salvos com sucesso.')
    } catch (err) {
      setMensagem('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  return (
    <div className="modal-fundo configuracoes-modal-dourado" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', maxWidth: categoria === 'historico' ? 720 : 560 }}>
        <h3 style={{ marginTop: 0 }}>Configurações do e-Náutica</h3>

        {!ehAdmin && (
          <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>
            Somente administradores podem alterar estas configurações. Você pode conferir os valores atuais, mas os campos abaixo estão desabilitados para o seu perfil.
          </p>
        )}

        <div className="abas" style={{ marginBottom: 16 }}>
          {CATEGORIAS.map((c) => (
            <button key={c.chave} type="button" className={categoria === c.chave ? 'ativo' : ''} onClick={() => mudarCategoria(c.chave)}>
              {c.label}
            </button>
          ))}
        </div>

        {categoria === 'aulas' && (
          <form onSubmit={salvarAulas} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {MODULOS_AULA.map((m) => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label>
                      Nome da aula
                      <input
                        type="text" disabled={!ehAdmin}
                        value={formAulas.find((c) => c.id === m.id)?.nome ?? m.titulo}
                        onChange={(e) => mudarNomeAula(m.id, e.target.value)}
                      />
                    </label>
                    <p className="dica" style={{ margin: '0 0 2px' }}>Tema sugerido: {m.desc}</p>
                    <label>
                      Vídeo do YouTube
                      <input
                        type="text" placeholder="https://youtube.com/watch?v=..." disabled={!ehAdmin}
                        value={formAulas.find((c) => c.id === m.id)?.valor || ''}
                        onChange={(e) => mudarCampoAula(m.id, e.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
            {mensagem && <p className="dica" style={{ margin: 0, fontWeight: 600 }}>{mensagem}</p>}
            <div className="acoes-modal">
              <button type="button" onClick={onFechar}>Fechar</button>
              <button type="submit" disabled={!ehAdmin || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}

        {categoria === 'documentos' && (
          <form onSubmit={salvarDocumentos} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label>
                  Nome da escola náutica
                  <input type="text" placeholder="Ex: RS Náutica" disabled={!ehAdmin} value={formDocumentos.nomeEscola}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, nomeEscola: e.target.value })} />
                </label>
                <label>
                  CNPJ da escola
                  <input type="text" inputMode="numeric" disabled={!ehAdmin} value={formDocumentos.cnpj}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, cnpj: maskCnpj(e.target.value) })} />
                </label>
                <label>
                  Nome do responsável técnico
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.responsavelNome}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, responsavelNome: e.target.value })} />
                </label>
                <label>
                  Cargo do responsável técnico
                  <input type="text" placeholder="Ex: Diretor técnico" disabled={!ehAdmin} value={formDocumentos.responsavelCargo}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, responsavelCargo: e.target.value })} />
                </label>
                <label>
                  CPF do responsável técnico
                  <input type="text" inputMode="numeric" disabled={!ehAdmin} value={formDocumentos.responsavelCpf}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, responsavelCpf: maskCpf(e.target.value) })} />
                </label>
                <label>
                  Nome do instrutor
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.instrutorNome}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, instrutorNome: e.target.value })} />
                </label>
                <label>
                  CPF do instrutor
                  <input type="text" inputMode="numeric" disabled={!ehAdmin} value={formDocumentos.instrutorCpf}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, instrutorCpf: maskCpf(e.target.value) })} />
                </label>
                <label>
                  Município
                  <input type="text" placeholder="Ex: Torres" disabled={!ehAdmin} value={formDocumentos.municipio}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, municipio: e.target.value })} />
                </label>
                <label>
                  Capitania/Agência responsável
                  <input type="text" placeholder="Ex: Agência da Capitania dos Portos em Torres" disabled={!ehAdmin} value={formDocumentos.capitania}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, capitania: e.target.value })} />
                </label>
              </div>
            </div>
            {mensagem && <p className="dica" style={{ margin: 0, fontWeight: 600 }}>{mensagem}</p>}
            <div className="acoes-modal">
              <button type="button" onClick={onFechar}>Fechar</button>
              <button type="submit" disabled={!ehAdmin || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}

        {categoria === 'historico' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Revisão de 06/09/2026 (pedido do Alex): sem texto explicativo,
                sem seleção por linha — só as 2 ações que sobraram no
                cabeçalho. "Exportar planilha" é sempre sobre TODOS os
                arquivados (é um relatório); "Limpar histórico" apaga todos
                de vez (ver limparHistoricoTotal acima). */}
            <div className="cliente-card-acoes" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="botao-secundario" disabled={historicoAlunos.length === 0} onClick={exportarPlanilhaHistorico}>
                Exportar planilha
              </button>
              <button type="button" className="botao-secundario perigo" disabled={!ehAdmin || historicoAlunos.length === 0 || limpandoHistorico} onClick={limparHistoricoTotal}>
                {limpandoHistorico ? 'Limpando…' : 'Limpar histórico'}
              </button>
            </div>
            {/* Classe ".tabela" (em vez de estilo inline claro) — pega
                automaticamente o tema escuro/dourado já definido em
                ".configuracoes-modal-dourado .modal-card .tabela" no
                index.css, em vez de ficar branca dentro do modal escuro. */}
            <div className="table-scroll" style={{ overflow: 'auto', maxHeight: '52vh' }}>
              <table className="tabela" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Telefone</th>
                    <th>Habilitação</th>
                    <th>Arquivado em</th>
                  </tr>
                </thead>
                <tbody>
                  {carregandoHistorico && (
                    <tr><td colSpan={4} style={{ padding: 16 }}>Carregando…</td></tr>
                  )}
                  {!carregandoHistorico && historicoAlunos.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 16 }}>Nenhum aluno no histórico.</td></tr>
                  )}
                  {historicoAlunos.map((m) => (
                    <tr key={m.id}>
                      <td style={{ textAlign: 'left' }}>{m.clientes?.nome || 'Aluno sem nome'}</td>
                      <td>{m.clientes?.telefone || '—'}</td>
                      <td>{labelHabilitacao(m.habilitacao)}</td>
                      <td>{m.arquivado_em ? new Date(m.arquivado_em).toLocaleDateString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="acoes-modal">
              <button type="button" onClick={onFechar}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

