import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarMatriculas, listarAgendamentosEscola, labelTipoAgendamento, excluirAgendamento, criarNotificacoesEmLote } from '../lib/enautica'
import { buscarMarina, buscarClientesPorIds } from '../lib/db'
import { abrirListaPratica } from '../lib/enauticaDocumentos'

// 2ª aba do e-Náutica pro lado da escola (a 1ª é o Painel de Controle — ver
// TelaAlunosENautica.jsx), por pedido do Alex: os compromissos marcados
// (aulas práticas e avaliações teóricas) merecem uma tela própria, em vez
// de ocupar espaço no topo da tabela de alunos. Marcar um compromisso NOVO
// continua sendo feito a partir do Painel de Controle (seleciona os alunos
// aprovados na tabela, "Marcar compromisso"), pra não duplicar essa ação em
// dois lugares. Aqui dá pra reimprimir a Lista de Alunos (Capitania) de um
// compromisso de aula prática já existente, e pra desfazer um compromisso
// marcado por engano ("Cancelar compromisso") — antes disso não existia
// NENHUM jeito de corrigir um agendamento errado, em lugar nenhum do
// sistema. Um agendamento aqui só tem um estado (existe/não existe, sempre
// "confirmado" — a pedido do Alex, sem outros status como concluído), então
// desmarcar é apagar a linha, não mudar um campo.
export default function TelaAgendamentosENautica({ marinaId }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [matriculas, setMatriculas] = useState([])
  const [erro, setErro] = useState(null)
  const [gerandoListaId, setGerandoListaId] = useState(null)
  const [cancelandoId, setCancelandoId] = useState(null)

  async function carregar() {
    if (!marinaId) return
    try {
      const [ags, mats] = await Promise.all([listarAgendamentosEscola(marinaId), listarMatriculas(marinaId)])
      setAgendamentos(ags)
      setMatriculas(mats)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    }
  }

  useEffect(() => { carregar() }, [marinaId])

  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-agendamentos-tela-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'matriculas', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const nomePorId = useMemo(() => {
    const mapa = {}
    matriculas.forEach((m) => { mapa[m.cliente_id] = m.clientes?.nome || 'Aluno' })
    return mapa
  }, [matriculas])
  const habilitacaoPorId = useMemo(() => {
    const mapa = {}
    matriculas.forEach((m) => { mapa[m.cliente_id] = m.habilitacao })
    return mapa
  }, [matriculas])

  const proximos = useMemo(
    () => agendamentos.filter((ag) => ag.data >= hojeISO).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`)),
    [agendamentos, hojeISO],
  )
  const anteriores = useMemo(
    () => agendamentos.filter((ag) => ag.data < hojeISO).sort((a, b) => `${b.data}${b.hora}`.localeCompare(`${a.data}${a.hora}`)),
    [agendamentos, hojeISO],
  )

  // Reimprime a Lista de Alunos (Capitania) de um compromisso de aula
  // prática que já existe, com os mesmos alunos/data/hora/local — mesma
  // função (gerarListaPratica) que o Painel de Controle usa na hora de
  // marcar um compromisso novo.
  async function reimprimirLista(ag) {
    const janela = window.open('', '_blank')
    if (!janela) {
      alert('Não foi possível abrir a lista: o navegador bloqueou o pop-up. Permita pop-ups para este site e tente de novo.')
      return
    }
    setGerandoListaId(ag.id)
    try {
      const [marina, clientes] = await Promise.all([buscarMarina(marinaId), buscarClientesPorIds(ag.alunos_ids || [])])
      const alunosComHabilitacao = clientes.map((c) => ({ ...c, habilitacao: habilitacaoPorId[c.id] || '' }))
      const docConfig = marina?.config_json?.documentos || {}
      abrirListaPratica({ data: ag.data, hora: ag.hora, local: ag.local }, alunosComHabilitacao, marina, docConfig, janela)
    } catch (err) {
      janela.close()
      alert('Não foi possível gerar a lista: ' + err.message)
    } finally {
      setGerandoListaId(null)
    }
  }

  // Desfaz um compromisso — pra corrigir um erro (data errada, aluno
  // errado) ou pra avisar de uma cancelada de verdade (ex.: mau tempo). Nos
  // dois casos os alunos marcados são avisados: mesmo quando é só correção
  // de erro, é melhor o aluno saber que aquele compromisso não vale mais do
  // que ele aparecer sem explicação na próxima vez que checar.
  async function cancelarCompromisso(ag) {
    const nomes = (ag.alunos_ids || []).map((id) => nomePorId[id] || 'Aluno').join(', ')
    if (!window.confirm(`Cancelar este compromisso${nomes ? ` (${nomes})` : ''}? Os alunos marcados serão avisados.`)) return
    setCancelandoId(ag.id)
    try {
      await excluirAgendamento(ag.id)
      const dataFormatada = new Date(`${ag.data}T12:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      await criarNotificacoesEmLote((ag.alunos_ids || []).map((clienteId) => ({
        marinaId, clienteId, tipo: 'agendamento_cancelado',
        titulo: `${ag.tipo_label || labelTipoAgendamento(ag.tipo)} cancelada`,
        mensagem: `O compromisso de ${dataFormatada} às ${ag.hora}${ag.local ? `, em ${ag.local}` : ''} foi cancelado pela escola.`,
      })))
      await carregar()
    } catch (err) {
      alert('Não foi possível cancelar: ' + err.message)
    } finally {
      setCancelandoId(null)
    }
  }

  function Cartao({ ag, permiteCancelar }) {
    return (
      <div style={{ fontSize: 13, padding: '10px 13px', border: '1px solid var(--cor-toggle-off)', borderRadius: 8, background: 'var(--cor-card)' }}>
        <div>
          <b>{new Date(`${ag.data}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })} · {ag.hora}</b>
          {' — '}{ag.tipo_label || labelTipoAgendamento(ag.tipo)}{ag.local ? ` · ${ag.local}` : ''}
        </div>
        <div style={{ color: 'var(--cor-texto-suave)', marginTop: 3, fontSize: 12.5 }}>
          {(ag.alunos_ids || []).map((id) => nomePorId[id] || 'Aluno').join(', ') || '—'}
        </div>
        {(ag.tipo === 'pratica' || permiteCancelar) && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ag.tipo === 'pratica' && (
              <button type="button" className="botao-secundario" disabled={gerandoListaId === ag.id} onClick={() => reimprimirLista(ag)}>
                {gerandoListaId === ag.id ? 'Gerando…' : 'Lista de alunos (Capitania)'}
              </button>
            )}
            {permiteCancelar && (
              <button type="button" className="botao-secundario perigo" disabled={cancelandoId === ag.id} onClick={() => cancelarCompromisso(ag)}>
                {cancelandoId === ag.id ? 'Cancelando…' : 'Cancelar compromisso'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {erro && <p className="erro">Não foi possível carregar os agendamentos ({erro}).</p>}

      <div style={{ marginBottom: 26 }}>
        <span className="minha-conta-secao-titulo">Próximos compromissos</span>
        {proximos.length === 0 && <p className="dica" style={{ marginTop: 8 }}>Nenhum compromisso marcado ainda — marque um pelo Painel de Controle, selecionando os alunos aprovados.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginTop: 8 }}>
          {proximos.map((ag) => <Cartao key={ag.id} ag={ag} permiteCancelar />)}
        </div>
      </div>

      {/* Compromissos passados não podem mais ser cancelados (já
          aconteceram ou não — não faz sentido "desmarcar" retroativamente),
          por isso só os "Próximos" acima ganham o botão. */}
      {anteriores.length > 0 && (
        <div>
          <span className="minha-conta-secao-titulo">Compromissos anteriores</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginTop: 8, opacity: 0.75 }}>
            {anteriores.map((ag) => <Cartao key={ag.id} ag={ag} permiteCancelar={false} />)}
          </div>
        </div>
      )}
    </div>
  )
}
