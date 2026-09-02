import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listarMatriculas, aprovarMatricula, recusarMatricula, resolverReagendamento,
  listarAgendamentosEscola, criarAgendamento, TIPOS_AGENDAMENTO, labelTipoAgendamento,
  listarCertificadosEscola, emitirCertificado, atualizarStatusCertificado,
  labelHabilitacao,
} from '../lib/enautica'
import { buscarMarina, buscarClientesPorIds } from '../lib/db'
import { abrirListaPratica, baixarZipDocumentosAlunos } from '../lib/enauticaDocumentos'
import ModalDocumentosAluno from './ModalDocumentosAluno'

// "Painel de Controle" do e-Náutica (1ª das 2 abas da escola, a outra é
// Agendamentos — ver TelaAgendamentosENautica.jsx) — substitui as antigas 3
// abas (Matrículas / Agenda / Certificados, hoje em
// TelaMatriculasENautica.jsx, TelaAgendaEscolaENautica.jsx e
// TelaCertificadosEscolaENautica.jsx — os 3 arquivos continuam no projeto,
// só não são mais importados em App.jsx, caso precise voltar atrás).
// MUDANÇA GRANDE, escolhida explicitamente pelo Alex (não é invenção livre
// nem port do rsnautica, que nunca teve nada parecido): em vez de 3 listas
// separadas, cada aluno aparece 1 vez numa tabela só, com uma trilha
// "Matrícula → Agenda → Certificado" mostrando em que ponto da jornada ele
// está. Clicar na linha abre um painel com tudo daquele aluno (mesmas ações
// de sempre: aprovar/recusar, documentos, agenda, certificado). As ações em
// massa que existiam nas 3 telas (aprovar vários, baixar .zip de vários,
// marcar uma turma, emitir vários certificados) continuam aqui, na barra
// que aparece quando alguém marca as caixinhas da tabela.
//
// O painel "Próximos compromissos" que existia no topo desta tela virou a
// aba Agendamentos, por pedido do Alex — lá dá pra ver TODOS os
// compromissos (não só os futuros), com mais espaço.
const FILTROS = [
  { chave: 'todos', label: 'Todos' },
  { chave: 'pendente', label: 'Pendentes' },
  { chave: 'aprovada', label: 'Aprovadas' },
  { chave: 'recusada', label: 'Recusadas' },
]

const FORM_AGENDA_VAZIO = { tipo: 'pratica', data: '', hora: '', local: '' }

export default function TelaAlunosENautica({ marinaId }) {
  const [matriculas, setMatriculas] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [certificados, setCertificados] = useState([])
  const [erro, setErro] = useState(null)

  const [filtro, setFiltro] = useState('todos')
  const [selecionados, setSelecionados] = useState(new Set())
  const [linhaAberta, setLinhaAberta] = useState(null)
  const [processandoId, setProcessandoId] = useState(null)
  const [baixandoZip, setBaixandoZip] = useState(false)
  const [emitindoCerts, setEmitindoCerts] = useState(false)
  const [matriculaDocumentos, setMatriculaDocumentos] = useState(null)

  // Modal "Marcar compromisso" — mesma lógica que já existia numa tela
  // própria, agora aberta sob demanda (a partir da barra de seleção ou do
  // painel de um único aluno) em vez de ocupar uma aba inteira o tempo todo.
  const [modalAgenda, setModalAgenda] = useState(null) // { alunosIds, nomes } | null
  const [formAgenda, setFormAgenda] = useState(FORM_AGENDA_VAZIO)
  const [criandoAgenda, setCriandoAgenda] = useState(false)
  const [erroAgenda, setErroAgenda] = useState(null)
  const [agendaEnviada, setAgendaEnviada] = useState(false)
  const [gerandoLista, setGerandoLista] = useState(false)

  async function carregar() {
    if (!marinaId) return
    try {
      const [mats, ags, certs] = await Promise.all([
        listarMatriculas(marinaId), listarAgendamentosEscola(marinaId), listarCertificadosEscola(marinaId),
      ])
      setMatriculas(mats)
      setAgendamentos(ags)
      setCertificados(certs)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    }
  }

  useEffect(() => { carregar() }, [marinaId])

  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-alunos-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'matriculas', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'certificados', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Um aluno = uma matrícula + o que já existe de agenda/certificado pra
  // aquele cliente/habilitação. Calculado ao vivo a partir dos 3 selects
  // já carregados, sem tabela nova.
  const alunos = useMemo(() => {
    return matriculas.map((m) => {
      const meusAgendamentos = agendamentos
        .filter((ag) => (ag.alunos_ids || []).includes(m.cliente_id))
        .sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))
      const proximoCompromisso = meusAgendamentos.find((ag) => ag.data >= hojeISO) || null
      const certificado = certificados.find((c) => c.cliente_id === m.cliente_id && c.habilitacao === m.habilitacao) || null
      return { matricula: m, agendamentos: meusAgendamentos, proximoCompromisso, certificado }
    })
  }, [matriculas, agendamentos, certificados, hojeISO])

  // Trilha "Matrícula → Agenda → Certificado" — só reflete dado que já
  // existe de verdade (status da matrícula, se há algum agendamento, status
  // do certificado); não inventa nenhuma etapa nova.
  function trilha(aluno) {
    const { matricula, agendamentos: ags, certificado } = aluno
    if (matricula.status === 'recusada') {
      return [{ label: 'Matrícula', estado: 'erro' }, { label: 'Agenda', estado: 'todo' }, { label: 'Certificado', estado: 'todo' }]
    }
    const matriculaEstado = matricula.status === 'aprovada' ? 'ok' : 'ativo'
    const agendaEstado = certificado || ags.length > 0 ? 'ok' : matricula.status === 'aprovada' ? 'ativo' : 'todo'
    const certEstado = certificado?.status === 'entregue' ? 'ok' : certificado ? 'ativo' : (ags.length > 0 ? 'ativo' : 'todo')
    return [
      { label: 'Matrícula', estado: matriculaEstado },
      { label: 'Agenda', estado: agendaEstado },
      { label: 'Certificado', estado: certEstado },
    ]
  }

  function mudarFiltro(f) {
    setFiltro(f)
    setSelecionados(new Set())
  }

  const alunosFiltrados = filtro === 'todos' ? alunos : alunos.filter((a) => a.matricula.status === filtro)
  const contagemPendentes = alunos.filter((a) => a.matricula.status === 'pendente').length

  function alternarSelecao(id) {
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }
  const todosSelecionados = alunosFiltrados.length > 0 && alunosFiltrados.every((a) => selecionados.has(a.matricula.id))
  function alternarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(alunosFiltrados.map((a) => a.matricula.id)))
  }

  const selecionadosAlunos = alunos.filter((a) => selecionados.has(a.matricula.id))
  const selPendentes = selecionadosAlunos.length > 0 && selecionadosAlunos.every((a) => a.matricula.status === 'pendente')
  const selAprovados = selecionadosAlunos.length > 0 && selecionadosAlunos.every((a) => a.matricula.status === 'aprovada')
  const selAprovadosSemCert = selAprovados && selecionadosAlunos.some((a) => !a.certificado)

  async function aprovar(matricula) {
    setProcessandoId(matricula.id)
    try {
      await aprovarMatricula(matricula)
      await carregar()
    } catch (err) {
      alert('Não foi possível aprovar a matrícula: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function recusar(matricula) {
    const motivo = window.prompt(`Recusar a matrícula de ${matricula.clientes?.nome || 'este aluno'}? Descreva o motivo (o aluno vai ver esse texto):`)
    if (motivo === null) return
    setProcessandoId(matricula.id)
    try {
      await recusarMatricula(matricula, motivo.trim())
      await carregar()
    } catch (err) {
      alert('Não foi possível recusar a matrícula: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function aprovarSelecionados() {
    if (!selPendentes) return
    setProcessandoId('lote')
    try {
      for (const a of selecionadosAlunos) await aprovarMatricula(a.matricula)
      setSelecionados(new Set())
      await carregar()
    } catch (err) {
      alert('Não foi possível aprovar todos os selecionados: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function toggleReagendamento(matricula) {
    setProcessandoId(matricula.id)
    try {
      await resolverReagendamento(matricula.id)
      await carregar()
    } catch (err) {
      alert('Erro ao atualizar: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function emitirCertificadoRow(aluno) {
    setProcessandoId(aluno.matricula.id)
    try {
      await emitirCertificado({ marinaId, clienteId: aluno.matricula.cliente_id, habilitacao: aluno.matricula.habilitacao })
      await carregar()
    } catch (err) {
      alert('Não foi possível emitir o certificado: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function alternarStatusCertificadoRow(aluno) {
    if (!aluno.certificado) return
    setProcessandoId(aluno.matricula.id)
    try {
      await atualizarStatusCertificado(aluno.certificado.id, aluno.certificado.status === 'entregue' ? 'disponível' : 'entregue')
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar o status: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function emitirCertificadosSelecionados() {
    if (!selAprovadosSemCert) return
    setEmitindoCerts(true)
    try {
      for (const a of selecionadosAlunos) {
        if (a.certificado) continue
        await emitirCertificado({ marinaId, clienteId: a.matricula.cliente_id, habilitacao: a.matricula.habilitacao })
      }
      setSelecionados(new Set())
      await carregar()
    } catch (err) {
      alert('Não foi possível emitir todos os certificados: ' + err.message)
    } finally {
      setEmitindoCerts(false)
    }
  }

  // "Baixar documentos (N)" em massa — mesma ideia do rsnautica (seleção
  // múltipla + ação em massa). Busca o cadastro completo (CPF, RG,
  // endereço...) só dos alunos selecionados, na hora.
  async function baixarZipSelecionados() {
    if (!selAprovados) return
    setBaixandoZip(true)
    try {
      const ids = selecionadosAlunos.map((a) => a.matricula.cliente_id)
      const [marina, clientes] = await Promise.all([buscarMarina(marinaId), buscarClientesPorIds(ids)])
      const clientePorId = {}
      clientes.forEach((c) => { clientePorId[c.id] = c })
      const alunosParaZip = selecionadosAlunos
        .map((a) => ({ cliente: clientePorId[a.matricula.cliente_id], habilitacao: a.matricula.habilitacao }))
        .filter((al) => al.cliente)
      const docConfig = marina?.config_json?.documentos || {}
      await baixarZipDocumentosAlunos(alunosParaZip, marina, docConfig, labelHabilitacao)
    } catch (err) {
      alert('Não foi possível gerar o .zip: ' + err.message)
    } finally {
      setBaixandoZip(false)
    }
  }

  function abrirModalAgenda(ids, nomes) {
    setFormAgenda(FORM_AGENDA_VAZIO)
    setErroAgenda(null)
    setAgendaEnviada(false)
    setModalAgenda({ alunosIds: ids, nomes })
  }

  async function enviarAgenda(e) {
    e.preventDefault()
    setErroAgenda(null)
    setAgendaEnviada(false)
    setCriandoAgenda(true)
    try {
      await criarAgendamento({
        marinaId, tipo: formAgenda.tipo, data: formAgenda.data, hora: formAgenda.hora,
        local: formAgenda.local, alunosIds: modalAgenda.alunosIds,
      })
      setAgendaEnviada(true)
      await carregar()
    } catch (err) {
      setErroAgenda(err.message)
    } finally {
      setCriandoAgenda(false)
    }
  }

  async function gerarListaAlunos() {
    setErroAgenda(null)
    const janela = window.open('', '_blank')
    if (!janela) {
      alert('Não foi possível abrir a lista: o navegador bloqueou o pop-up. Permita pop-ups para este site e tente de novo.')
      return
    }
    setGerandoLista(true)
    try {
      const [marina, clientes] = await Promise.all([buscarMarina(marinaId), buscarClientesPorIds(modalAgenda.alunosIds)])
      const habilitacaoPorId = {}
      alunos.forEach((a) => { habilitacaoPorId[a.matricula.cliente_id] = a.matricula.habilitacao })
      const alunosComHabilitacao = clientes.map((c) => ({ ...c, habilitacao: habilitacaoPorId[c.id] || '' }))
      const docConfig = marina?.config_json?.documentos || {}
      abrirListaPratica({ data: formAgenda.data, hora: formAgenda.hora, local: formAgenda.local }, alunosComHabilitacao, marina, docConfig, janela)
    } catch (err) {
      janela.close()
      alert('Não foi possível gerar a lista: ' + err.message)
    } finally {
      setGerandoLista(false)
    }
  }

  const corEtapa = { ok: '#3F8F5F', ativo: '#B45309', todo: '#B9C2CC', erro: '#A23B2E' }

  return (
    <div>
      {erro && <p className="erro">Não foi possível carregar os alunos ({erro}).</p>}

      <div className="abas">
        {FILTROS.map((f) => (
          <button key={f.chave} className={filtro === f.chave ? 'ativo' : ''} onClick={() => mudarFiltro(f.chave)}>
            {f.label} {f.chave === 'pendente' && contagemPendentes > 0 ? `(${contagemPendentes})` : ''}
          </button>
        ))}
      </div>

      {/* Barra de ações em massa — só aparece com alguma seleção, e só
          habilita cada ação quando ela faz sentido pra TODOS os
          selecionados (evita, por ex., tentar emitir certificado de um
          aluno ainda pendente). */}
      {alunosFiltrados.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={alternarTodos} style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--cor-primaria)', cursor: 'pointer', padding: 0 }}>
            {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
          {selecionados.size > 0 && (
            <>
              <button type="button" className="botao-secundario" disabled={!selPendentes || processandoId === 'lote'} onClick={aprovarSelecionados}>
                {processandoId === 'lote' ? 'Aprovando…' : `Aprovar selecionados (${selecionados.size})`}
              </button>
              <button type="button" className="botao-secundario" disabled={!selAprovados || baixandoZip} onClick={baixarZipSelecionados}>
                {baixandoZip ? 'Gerando .zip…' : `Baixar documentos (${selecionados.size})`}
              </button>
              <button
                type="button" className="botao-secundario" disabled={!selAprovados}
                onClick={() => abrirModalAgenda(selecionadosAlunos.map((a) => a.matricula.cliente_id), selecionadosAlunos.map((a) => a.matricula.clientes?.nome || 'Aluno'))}
              >
                Marcar compromisso ({selecionados.size})
              </button>
              <button type="button" className="botao-secundario" disabled={!selAprovadosSemCert || emitindoCerts} onClick={emitirCertificadosSelecionados}>
                {emitindoCerts ? 'Emitindo…' : `Emitir certificados (${selecionados.size})`}
              </button>
            </>
          )}
        </div>
      )}

      <div className="table-scroll" style={{ overflowX: 'auto', background: 'var(--cor-card)', borderRadius: 'var(--raio)', boxShadow: 'var(--sombra)' }}>
        {/* Larguras fixas por coluna (em vez de deixar o navegador decidir
            pelo conteúdo de cada linha): sem isso, "Etapa" e "Contato"
            deslizavam pra esquerda/direita dependendo do tamanho do nome de
            cada aluno — com <colgroup>, a coluna sempre fica na mesma
            posição em toda linha, alinhada com o cabeçalho. */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: 36 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thEsq}></th>
              <th style={thEsq}>Aluno</th>
              <th style={thEsq}>Etapa</th>
              <th style={thEsq}>Contato</th>
              <th style={thEsq}></th>
            </tr>
          </thead>
          <tbody>
            {alunosFiltrados.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, color: 'var(--cor-texto-suave)' }}>Nenhum aluno {filtro === 'todos' ? '' : `com matrícula ${filtro === 'pendente' ? 'pendente' : filtro === 'aprovada' ? 'aprovada' : 'recusada'} `}no momento.</td></tr>
            )}
            {alunosFiltrados.map((a) => {
              const m = a.matricula
              const aberta = linhaAberta === m.id
              return (
                <Fragment key={m.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setLinhaAberta(aberta ? null : m.id)}>
                    <td style={tdEsq} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selecionados.has(m.id)} onChange={() => alternarSelecao(m.id)} />
                    </td>
                    <td style={tdEsq}>
                      <b style={{ color: 'var(--cor-primaria)' }}>{m.clientes?.nome || 'Aluno sem nome'}</b>
                      <div style={{ fontSize: 11.5, color: 'var(--cor-texto-suave)' }}>{labelHabilitacao(m.habilitacao)}</div>
                    </td>
                    <td style={tdEsq}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {trilha(a).map((etapa) => (
                          <span key={etapa.label} title={etapa.label} style={{ fontSize: 10, color: corEtapa[etapa.estado], fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 2, background: etapa.estado === 'todo' ? 'transparent' : corEtapa[etapa.estado], border: `1.3px solid ${corEtapa[etapa.estado]}` }} />
                            {etapa.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...tdEsq, color: 'var(--cor-texto-suave)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.clientes?.email || ''}>{m.clientes?.email || '—'}</td>
                    <td style={{ ...tdEsq, textAlign: 'right', color: 'var(--cor-texto-suave)', fontSize: 11 }}>{aberta ? '▲' : '▼'}</td>
                  </tr>
                  {aberta && (
                    <tr>
                      <td colSpan={5} style={{ padding: '0 14px 14px' }} onClick={(e) => e.stopPropagation()}>
                        {/* Painel do aluno — estilo "linha discreta": um único
                            bloco com nome/hábilitação no topo, dados abaixo,
                            ações por último. */}
                        <div style={{ border: '1px solid var(--cor-toggle-off)', borderRadius: 8, padding: '14px 16px', background: '#FBFAF8' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {m.pronto_teste === 'sim' && (
                                <span className="status-texto em-dia" style={{ fontSize: 12 }}>✓ pronto p/ prova teórica</span>
                              )}
                              {m.reagendamento_solicitado && (
                                <button
                                  type="button" title="Clique para marcar como atendido" disabled={processandoId === m.id}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '1px 7px', borderRadius: 10, background: '#fef3c7', color: '#b45309', border: '0.5px solid #fde68a', fontWeight: 600, cursor: 'pointer' }}
                                  onClick={() => toggleReagendamento(m)}
                                >
                                  ↺ reagendamento
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12.5, color: 'var(--cor-texto)' }}>
                            <span><b style={{ color: 'var(--cor-texto-suave)' }}>Telefone:</b> {m.clientes?.telefone || '—'}</span>
                            {m.status === 'recusada' && m.motivo_recusa && (
                              <span><b style={{ color: 'var(--cor-texto-suave)' }}>Motivo da recusa:</b> {m.motivo_recusa}</span>
                            )}
                            {a.proximoCompromisso && (
                              <span>
                                <b style={{ color: 'var(--cor-texto-suave)' }}>Próximo compromisso:</b>{' '}
                                {new Date(`${a.proximoCompromisso.data}T12:00`).toLocaleDateString('pt-BR')} às {a.proximoCompromisso.hora} — {a.proximoCompromisso.tipo_label || labelTipoAgendamento(a.proximoCompromisso.tipo)}
                              </span>
                            )}
                            {a.certificado && (
                              <span><b style={{ color: 'var(--cor-texto-suave)' }}>Certificado:</b> {a.certificado.status === 'entregue' ? 'entregue' : 'disponível, aguardando retirada'}</span>
                            )}
                          </div>

                          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {m.status === 'pendente' && (
                              <>
                                <button type="button" className="botao-secundario" disabled={processandoId === m.id} onClick={() => aprovar(m)}>Aprovar</button>
                                <button type="button" className="botao-secundario perigo" disabled={processandoId === m.id} onClick={() => recusar(m)}>Recusar</button>
                              </>
                            )}
                            {m.status === 'aprovada' && (
                              <>
                                <button type="button" className="botao-secundario" onClick={() => setMatriculaDocumentos(m)}>Documentos</button>
                                <button
                                  type="button" className="botao-secundario"
                                  onClick={() => abrirModalAgenda([m.cliente_id], [m.clientes?.nome || 'Aluno'])}
                                >
                                  Marcar compromisso
                                </button>
                                {!a.certificado && (
                                  <button type="button" className="botao-secundario" disabled={processandoId === m.id} onClick={() => emitirCertificadoRow(a)}>
                                    {processandoId === m.id ? 'Emitindo…' : 'Emitir certificado'}
                                  </button>
                                )}
                                {a.certificado && (
                                  <button
                                    type="button" className={`botao-secundario${a.certificado.status === 'entregue' ? ' em-dia' : ''}`}
                                    disabled={processandoId === m.id} onClick={() => alternarStatusCertificadoRow(a)}
                                  >
                                    {a.certificado.status === 'entregue' ? '✓ Certificado entregue' : 'Marcar certificado como entregue'}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {matriculaDocumentos && (
        <ModalDocumentosAluno matricula={matriculaDocumentos} onFechar={() => setMatriculaDocumentos(null)} />
      )}

      {modalAgenda && (
        <div className="modal-fundo" onClick={() => setModalAgenda(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Marcar compromisso</h3>
            <p className="dica" style={{ margin: '0 0 12px' }}>
              {modalAgenda.nomes.length === 1 ? modalAgenda.nomes[0] : `${modalAgenda.nomes.length} alunos: ${modalAgenda.nomes.join(', ')}`}
            </p>
            <form onSubmit={enviarAgenda} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={formAgenda.tipo} onChange={(e) => setFormAgenda({ ...formAgenda, tipo: e.target.value })}>
                {TIPOS_AGENDAMENTO.map((t) => <option key={t.chave} value={t.chave}>{t.label}</option>)}
              </select>
              <div className="form-inline">
                <input type="date" required value={formAgenda.data} onChange={(e) => setFormAgenda({ ...formAgenda, data: e.target.value })} />
                <input type="time" required value={formAgenda.hora} onChange={(e) => setFormAgenda({ ...formAgenda, hora: e.target.value })} />
              </div>
              <input
                type="text" required placeholder="Local (ex: Capitania dos Portos)"
                value={formAgenda.local} onChange={(e) => setFormAgenda({ ...formAgenda, local: e.target.value })}
              />
              {erroAgenda && <p className="erro">{erroAgenda}</p>}
              {agendaEnviada && <p className="dica" style={{ fontWeight: 600 }}>Compromisso marcado — os alunos selecionados foram notificados.</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={criandoAgenda}>{criandoAgenda ? 'Marcando…' : 'Marcar compromisso'}</button>
                {formAgenda.tipo === 'pratica' && (
                  <button type="button" className="botao-secundario" disabled={gerandoLista} onClick={gerarListaAlunos}>
                    {gerandoLista ? 'Gerando…' : 'Lista de alunos (Capitania)'}
                  </button>
                )}
              </div>
            </form>
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAgenda(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const thEsq = { textAlign: 'left', padding: '11px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--cor-texto-suave)', borderBottom: '1px solid #EAF2F5' }
const tdEsq = { textAlign: 'left', padding: '11px 12px', borderBottom: '1px solid #EAF2F5', verticalAlign: 'middle' }
