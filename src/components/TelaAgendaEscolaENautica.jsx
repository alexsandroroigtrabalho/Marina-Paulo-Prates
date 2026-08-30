import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  TIPOS_AGENDAMENTO, listarAgendamentosEscola, listarMatriculasAprovadas,
  criarAgendamento, atualizarStatusAgendamento, labelHabilitacao,
} from '../lib/enautica'

// Segunda tela da equipe da escola no RV e-Náutica: marcar aulas práticas e
// avaliações teóricas pros alunos com matrícula aprovada — mesmo conceito
// do rsnautica antigo (tabela `agendamentos`, um compromisso pode juntar
// vários alunos de uma vez, ver `alunos_ids`). Só quem já está aprovado
// aparece pra selecionar; não existe reagendamento por pagamento aqui
// (diferente do rsnautica antigo — ver decisão de não ter cobrança).
const STATUS_OPCOES = [
  { chave: 'confirmado', label: 'Confirmado' },
  { chave: 'concluido', label: 'Concluído' },
  { chave: 'cancelado', label: 'Cancelado' },
]

const FORM_VAZIO = { tipo: 'pratica', data: '', hora: '', local: '', alunosIds: [] }

export default function TelaAgendaEscolaENautica({ marinaId }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [aprovados, setAprovados] = useState([])
  const [form, setForm] = useState(FORM_VAZIO)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState(null)
  const [erroForm, setErroForm] = useState(null)
  const [salvandoStatusId, setSalvandoStatusId] = useState(null)

  async function carregar() {
    if (!marinaId) return
    try {
      const [ags, aps] = await Promise.all([listarAgendamentosEscola(marinaId), listarMatriculasAprovadas(marinaId)])
      setAgendamentos(ags)
      setAprovados(aps)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    }
  }

  useEffect(() => { carregar() }, [marinaId])

  // Realtime: mesmo padrão de TelaMatriculasENautica.jsx.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-agendamentos-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  // Nome do aluno por id — resolvido a partir da lista de aprovados (quem
  // marca um agendamento só escolhe entre eles). Um aluno cujo status mudou
  // depois de já estar num agendamento antigo cai no fallback "Aluno".
  const nomePorId = useMemo(() => {
    const mapa = {}
    aprovados.forEach((m) => { mapa[m.cliente_id] = m.clientes?.nome })
    return mapa
  }, [aprovados])

  function alternarAluno(id) {
    setForm((f) => ({
      ...f,
      alunosIds: f.alunosIds.includes(id) ? f.alunosIds.filter((x) => x !== id) : [...f.alunosIds, id],
    }))
  }

  async function enviarForm(e) {
    e.preventDefault()
    setErroForm(null)
    if (form.alunosIds.length === 0) { setErroForm('Escolha ao menos um aluno.'); return }
    setCriando(true)
    try {
      await criarAgendamento({ marinaId, tipo: form.tipo, data: form.data, hora: form.hora, local: form.local, alunosIds: form.alunosIds })
      setForm(FORM_VAZIO)
      await carregar()
    } catch (err) {
      setErroForm(err.message)
    } finally {
      setCriando(false)
    }
  }

  async function mudarStatus(id, status) {
    setSalvandoStatusId(id)
    try {
      await atualizarStatusAgendamento(id, status)
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar o status: ' + err.message)
    } finally {
      setSalvandoStatusId(null)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <strong>Marcar novo compromisso</strong>
        <p className="dica" style={{ margin: '4px 0 10px' }}>
          Aula prática ou avaliação teórica — pode juntar vários alunos no mesmo horário, se for uma turma.
        </p>
        <form onSubmit={enviarForm} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {TIPOS_AGENDAMENTO.map((t) => <option key={t.chave} value={t.chave}>{t.label}</option>)}
          </select>
          <div className="form-inline">
            <input type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            <input type="time" required value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
          </div>
          <input
            type="text" required placeholder="Local (ex: Capitania dos Portos)"
            value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })}
          />

          <span className="minha-conta-secao-titulo">Alunos</span>
          {aprovados.length === 0 && <p className="dica">Nenhum aluno com matrícula aprovada ainda.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {aprovados.map((m) => (
              <label key={m.cliente_id} className="opcao-checkbox">
                <input type="checkbox" checked={form.alunosIds.includes(m.cliente_id)} onChange={() => alternarAluno(m.cliente_id)} />
                {m.clientes?.nome || 'Aluno'} ({labelHabilitacao(m.habilitacao)})
              </label>
            ))}
          </div>

          {erroForm && <p className="erro">{erroForm}</p>}
          <button type="submit" disabled={criando} style={{ alignSelf: 'flex-start' }}>
            {criando ? 'Marcando…' : 'Marcar compromisso'}
          </button>
        </form>
      </div>

      {erro && <p className="erro">Não foi possível carregar a agenda ({erro}).</p>}

      <strong>Compromissos marcados</strong>
      <div className="lista-cards" style={{ marginTop: 10 }}>
        {agendamentos.length === 0 && <p className="dica">Nenhum compromisso marcado ainda.</p>}
        {agendamentos.map((ag) => (
          <div key={ag.id} className="cliente-card">
            <div className="cabecalho-cliente">
              <div className="titulo-cliente"><span className="nome">{ag.tipo_label}</span></div>
            </div>
            <div className="linha">
              <b>Data:</b> {new Date(`${ag.data}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {ag.hora}
            </div>
            <div className="linha"><b>Local:</b> {ag.local}</div>
            <div className="linha">
              <b>Alunos:</b> {(ag.alunos_ids || []).map((id) => nomePorId[id] || 'Aluno').join(', ') || '—'}
            </div>
            <div className="linha">
              <b>Status:</b>{' '}
              <select
                value={ag.status} disabled={salvandoStatusId === ag.id}
                onChange={(e) => mudarStatus(ag.id, e.target.value)}
              >
                {STATUS_OPCOES.map((s) => <option key={s.chave} value={s.chave}>{s.label}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
