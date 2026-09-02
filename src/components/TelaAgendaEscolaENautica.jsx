import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  TIPOS_AGENDAMENTO, listarAgendamentosEscola, listarMatriculasAprovadas,
  criarAgendamento, labelHabilitacao,
} from '../lib/enautica'
import { buscarMarina, buscarClientesPorIds } from '../lib/db'
import { abrirListaPratica } from '../lib/enauticaDocumentos'

// Segunda tela da equipe da escola no RV e-Náutica — fiel ao que existe de
// verdade no rsnautica (TabAgendamentos, em PainelAdmin.jsx): NÃO é uma
// lista de "compromissos marcados" navegável com status editável (isso já
// existiu aqui numa versão anterior — era invenção minha, sem checar a
// fonte, removida a pedido do Alex). É um painel único de "Controle de
// notificações": configura tipo/data/hora/local uma vez, escolhe entre os
// alunos aptos (com "Selecionar todos" e, por aluno, os indicadores de
// quem já foi notificado de Aula Prática/Avaliação Teórica antes — bolinha
// verde/cinza, igual ao rsnautica) e confirma. A tabela `agendamentos`
// segue existindo (é de lá, `alunos_ids` como array), só não vira uma
// lista de cards na tela — serve só pra alimentar os indicadores e pro
// aluno ver o próprio compromisso no painel dele (TelaClienteENautica.jsx).
//
// "Lista de Alunos para Aulas Práticas": no rsnautica ela não está presa a
// um agendamento salvo — é gerada na hora, a partir de quem está
// selecionado + os campos de data/hora/local já preenchidos no formulário
// (ver ModalBaixarZip em PainelAdmin.jsx, que chama gerarListaPratica com
// os alunos escolhidos e os campos do momento, sem depender de nenhuma
// linha gravada). Reproduzido aqui do mesmo jeito: o botão usa o form
// atual, não um compromisso já criado.
const FORM_VAZIO = { tipo: 'pratica', data: '', hora: '', local: '', alunosIds: [] }

export default function TelaAgendaEscolaENautica({ marinaId }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [aprovados, setAprovados] = useState([])
  const [form, setForm] = useState(FORM_VAZIO)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState(null)
  const [erroForm, setErroForm] = useState(null)
  const [enviado, setEnviado] = useState(false)
  const [gerandoLista, setGerandoLista] = useState(false)

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

  // Realtime: se outro administrador logado em outra aba marcar um
  // compromisso, os indicadores de notificado atualizam sozinhos aqui.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-agendamentos-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  // Habilitação de cada aluno (a matrícula aprovada é a única fonte disso)
  // — a Lista de Alunos precisa saber ARA/MTA/Ambas pra separar os horários
  // de prática de cada categoria (ver gerarListaPratica).
  const habilitacaoPorId = useMemo(() => {
    const mapa = {}
    aprovados.forEach((m) => { mapa[m.cliente_id] = m.habilitacao })
    return mapa
  }, [aprovados])

  // Indicadores "já notificado" por aluno/tipo — mesmo dado que o rsnautica
  // mostra como bolinha verde/cinza em TabAgendamentos: true se existe
  // algum compromisso daquele tipo que já inclui o aluno. Calculado ao vivo
  // a partir dos agendamentos já carregados, sem tabela nova.
  const notificadoPorId = useMemo(() => {
    const mapa = {}
    agendamentos.forEach((ag) => {
      ;(ag.alunos_ids || []).forEach((id) => {
        if (!mapa[id]) mapa[id] = { pratica: false, teorica: false }
        mapa[id][ag.tipo] = true
      })
    })
    return mapa
  }, [agendamentos])

  const todosSelecionados = aprovados.length > 0 && form.alunosIds.length === aprovados.length
  function alternarTodos() {
    setForm((f) => ({ ...f, alunosIds: todosSelecionados ? [] : aprovados.map((m) => m.cliente_id) }))
  }

  function alternarAluno(id) {
    setForm((f) => ({
      ...f,
      alunosIds: f.alunosIds.includes(id) ? f.alunosIds.filter((x) => x !== id) : [...f.alunosIds, id],
    }))
  }

  async function enviarForm(e) {
    e.preventDefault()
    setErroForm(null)
    setEnviado(false)
    if (form.alunosIds.length === 0) { setErroForm('Escolha ao menos um aluno.'); return }
    setCriando(true)
    try {
      await criarAgendamento({ marinaId, tipo: form.tipo, data: form.data, hora: form.hora, local: form.local, alunosIds: form.alunosIds })
      setEnviado(true)
      await carregar()
    } catch (err) {
      setErroForm(err.message)
    } finally {
      setCriando(false)
    }
  }

  // Gera a Lista de Alunos a partir de quem está selecionado agora + os
  // campos de data/hora/local já preenchidos no formulário — não depende
  // de já ter clicado em "Marcar compromisso" (ver nota no topo do
  // arquivo). Só faz sentido pra Aula prática.
  async function gerarListaAlunos() {
    if (form.alunosIds.length === 0) { setErroForm('Escolha ao menos um aluno.'); return }
    setErroForm(null)
    // Aba já aberta no clique (síncrono) — se abrir só depois do `await`
    // que busca marina/alunos, o navegador bloqueia o pop-up silenciosamente
    // na maioria dos casos.
    const janela = window.open('', '_blank')
    if (!janela) {
      alert('Não foi possível abrir a lista: o navegador bloqueou o pop-up. Permita pop-ups para este site e tente de novo.')
      return
    }
    setGerandoLista(true)
    try {
      const [marina, clientes] = await Promise.all([
        buscarMarina(marinaId),
        buscarClientesPorIds(form.alunosIds),
      ])
      const alunosComHabilitacao = clientes.map((c) => ({ ...c, habilitacao: habilitacaoPorId[c.id] || '' }))
      const docConfig = marina?.config_json?.documentos || {}
      abrirListaPratica({ data: form.data, hora: form.hora, local: form.local }, alunosComHabilitacao, marina, docConfig, janela)
    } catch (err) {
      janela.close()
      alert('Não foi possível gerar a lista: ' + err.message)
    } finally {
      setGerandoLista(false)
    }
  }

  return (
    <div>
      <strong>Controle de notificações</strong>
      <p className="dica" style={{ margin: '4px 0 10px' }}>
        Aula prática ou avaliação teórica — pode juntar vários alunos no mesmo horário, se for uma turma.
      </p>

      {erro && <p className="erro">Não foi possível carregar a agenda ({erro}).</p>}

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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="minha-conta-secao-titulo">Alunos</span>
          {aprovados.length > 0 && (
            <button type="button" onClick={alternarTodos} style={{ fontSize: 12, background: 'none', border: 'none', color: 'var(--cor-primaria)', cursor: 'pointer', padding: 0 }}>
              {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          )}
        </div>
        {aprovados.length === 0 && <p className="dica">Nenhum aluno com matrícula aprovada ainda.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto', border: aprovados.length ? '1px solid var(--cor-toggle-off)' : 'none', borderRadius: 8, padding: aprovados.length ? 8 : 0 }}>
          {aprovados.map((m) => (
            <label key={m.cliente_id} className="opcao-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <input type="checkbox" checked={form.alunosIds.includes(m.cliente_id)} onChange={() => alternarAluno(m.cliente_id)} />
              <span style={{ flex: 1 }}>
                {m.clientes?.nome || 'Aluno'} ({labelHabilitacao(m.habilitacao)})
                {/* Só relevante pra avaliação teórica — ver "estou pronto"
                    em TelaClienteENautica.jsx/TelaMatriculasENautica.jsx. */}
                {m.pronto_teste === 'sim' && (
                  <span className="status-texto em-dia" style={{ marginLeft: 6, fontSize: 11 }}>✓ pronto p/ teórica</span>
                )}
                {m.reagendamento_solicitado && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#fef3c7', color: '#b45309', border: '0.5px solid #fde68a', fontWeight: 600 }}>↺ reagendamento</span>
                )}
              </span>
              {/* Indicadores "já notificado" — mesmo conceito do rsnautica
                  (bolinha verde/cinza por tipo), ver notificadoPorId acima. */}
              <span style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--cor-texto-suave)' }}>
                <span title="Aula prática" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, display: 'inline-block', background: notificadoPorId[m.cliente_id]?.pratica ? '#4ade80' : 'transparent', border: `1.3px solid ${notificadoPorId[m.cliente_id]?.pratica ? '#4ade80' : '#ccc'}` }} />
                  prática
                </span>
                <span title="Avaliação teórica" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, display: 'inline-block', background: notificadoPorId[m.cliente_id]?.teorica ? '#4ade80' : 'transparent', border: `1.3px solid ${notificadoPorId[m.cliente_id]?.teorica ? '#4ade80' : '#ccc'}` }} />
                  teórica
                </span>
              </span>
            </label>
          ))}
        </div>

        {erroForm && <p className="erro">{erroForm}</p>}
        {enviado && <p className="dica" style={{ fontWeight: 600 }}>Compromisso marcado — os alunos selecionados foram notificados.</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" disabled={criando}>
            {criando ? 'Marcando…' : 'Marcar compromisso'}
          </button>
          {form.tipo === 'pratica' && (
            <button type="button" className="botao-secundario" disabled={gerandoLista} onClick={gerarListaAlunos}>
              {gerandoLista ? 'Gerando…' : 'Lista de alunos (Capitania)'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
