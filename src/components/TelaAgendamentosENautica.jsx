import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarMatriculas, listarAgendamentosEscola, labelTipoAgendamento, excluirAgendamento } from '../lib/enautica'

// 2ª aba do e-Náutica pro lado da escola (a 1ª é o Painel de Controle — ver
// TelaAlunosENautica.jsx), por pedido do Alex: os compromissos marcados
// (aulas práticas e avaliações teóricas) merecem uma tela própria, em vez
// de ocupar espaço no topo da tabela de alunos. Marcar um compromisso NOVO
// continua sendo feito a partir do Painel de Controle (seleciona os alunos
// aprovados na tabela, "Marcar compromisso"), pra não duplicar essa ação em
// dois lugares.
//
// Revisão de 05/09/2026 (várias rodadas, pedido do Alex): a coluna "Ações"
// saiu das DUAS tabelas (Próximos e Histórico) — "Lista de alunos" (Capitania)
// continua alcançável pelo botão "Lista de presença" da barra de seleção do
// Painel de Controle (TelaAlunosENautica.jsx), que cobre o mesmo caso.
// "Cancelar compromisso" ficou sem outro caminho na interface — se precisar
// de volta, avisar (a função `excluirAgendamento` de lib/enautica.js
// continua existindo, só não tem mais botão nenhum chamando ela aqui).
//
// Revisão de 05/09/2026 (2ª rodada): a barra de seleção com caixinha por
// linha no Histórico saiu de novo — o Alex pediu algo mais direto: um único
// botão "Limpar histórico" que apaga TODOS os compromissos vencidos de uma
// vez (sem escolher um por um). Continua pedindo confirmação antes (ação
// irreversível), só que agora de forma simples.
export default function TelaAgendamentosENautica({ marinaId }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [matriculas, setMatriculas] = useState([])
  const [erro, setErro] = useState(null)
  const [limpandoHistorico, setLimpandoHistorico] = useState(false)

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
  const proximos = useMemo(
    () => agendamentos.filter((ag) => ag.data >= hojeISO).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`)),
    [agendamentos, hojeISO],
  )
  const anteriores = useMemo(
    () => agendamentos.filter((ag) => ag.data < hojeISO).sort((a, b) => `${b.data}${b.hora}`.localeCompare(`${a.data}${a.hora}`)),
    [agendamentos, hojeISO],
  )

  // "Limpar histórico" — apaga TODOS os compromissos vencidos de uma vez
  // (mesma função excluirAgendamento que antes ficava atrás do botão
  // "Cancelar"). Sem aviso ao aluno (diferente do antigo "Cancelar"): são
  // compromissos que já aconteceram, não faz sentido notificar de um
  // cancelamento retroativo. Sem seleção por linha — é tudo ou nada, com
  // confirmação antes por ser irreversível.
  async function limparHistorico() {
    if (anteriores.length === 0) return
    if (!window.confirm(`Limpar o histórico inteiro (${anteriores.length} compromisso${anteriores.length > 1 ? 's' : ''})? Essa ação não pode ser desfeita.`)) return
    setLimpandoHistorico(true)
    try {
      for (const ag of anteriores) await excluirAgendamento(ag.id)
      await carregar()
    } catch (err) {
      alert('Não foi possível limpar o histórico: ' + err.message)
    } finally {
      setLimpandoHistorico(false)
    }
  }

  // Tabela de agendamentos — revisão de 05/09/2026 (pedido do Alex): antes
  // cada compromisso era um "cartão" numa grade; virou uma linha de tabela,
  // mesmo padrão de tabela usado no Painel de Controle (TelaAlunosENautica).
  // Sem coluna "Ações" nem caixinha de seleção em nenhuma das duas (ver
  // aviso no topo do arquivo) — o Histórico usa o botão único "Limpar
  // histórico" acima da tabela em vez de selecionar linha por linha.
  function TabelaAgendamentos({ lista, vazio }) {
    return (
      <div className="table-scroll" style={{ overflowX: 'auto', background: 'var(--cor-card)', borderRadius: 'var(--raio)', boxShadow: 'var(--sombra)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640, tableLayout: 'fixed' }}>
          {/* 3 colunas EXATAMENTE iguais (33.33% cada) — depois de duas
              tentativas de largura "proporcional ao conteúdo" (20/16/64,
              depois com Alunos à esquerda) o Alex bateu no mesmo problema
              nas duas: uma coluna bem mais larga que as outras duas sempre
              lê como desequilibrado, centralizada (sobra desigual dos dois
              lados) ou à esquerda (todo o conteúdo gruda no lado esquerdo
              da página, com um vão enorme sobrando à direita). "simétrico"
              aqui é literal: as 3 colunas do mesmo tamanho, todas
              centralizadas (06/09/2026, "ainda está ruim... tudo alinhado
              à esquerda"). */}
          <colgroup>
            <col style={{ width: '33.34%' }} />
            <col style={{ width: '33.33%' }} />
            <col style={{ width: '33.33%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={thEsq}>Data</th>
              <th style={thEsq}>Tipo</th>
              <th style={thEsq}>Alunos</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 16, color: 'var(--cor-texto-suave)' }}>{vazio}</td></tr>
            )}
            {lista.map((ag) => (
              <tr key={ag.id}>
                <td style={tdCentro}>
                  <b>{new Date(`${ag.data}T12:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</b>
                  <div style={{ fontSize: 11.5, color: 'var(--cor-texto-suave)' }}>{ag.hora}{ag.local ? ` · ${ag.local}` : ''}</div>
                </td>
                <td style={tdCentro}>{ag.tipo_label || labelTipoAgendamento(ag.tipo)}</td>
                <td style={{ ...tdCentro, color: 'var(--cor-texto-suave)' }}>
                  {(ag.alunos_ids || []).map((id) => nomePorId[id] || 'Aluno').join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      {erro && <p className="erro">Não foi possível carregar os agendamentos ({erro}).</p>}

      <div style={{ marginBottom: 26 }}>
        <span className="minha-conta-secao-titulo">Próximos compromissos</span>
        <div style={{ marginTop: 8 }}>
          <TabelaAgendamentos lista={proximos} vazio="Nenhum compromisso marcado ainda — marque um pelo Painel de Controle, selecionando os alunos aprovados." />
        </div>
      </div>

      {/* Compromissos com data já vencida (antes de hoje) saem sozinhos dos
          "Próximos" e caem aqui — não é uma ação manual, é só o filtro de
          data (linha 68 acima) recalculando a cada carregamento. Também não
          podem mais ser cancelados (já aconteceram ou não — não faz
          sentido "desmarcar" retroativamente), por isso só os "Próximos"
          acima ganham o botão. */}
      {anteriores.length > 0 && (
        <div>
          <span className="minha-conta-secao-titulo">Histórico</span>
          <div className="cliente-card-acoes" style={{ marginTop: 8, marginBottom: 8 }}>
            <button
              type="button"
              className="botao-secundario perigo"
              disabled={limpandoHistorico}
              onClick={limparHistorico}
            >
              {limpandoHistorico ? 'Limpando…' : 'Limpar histórico'}
            </button>
          </div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            <TabelaAgendamentos lista={anteriores} vazio="Nenhum compromisso no histórico." />
          </div>
        </div>
      )}
    </div>
  )
}

// Centralizado (pedido do Alex) — só o TÍTULO da coluna; Data e Alunos
// continuam à esquerda (texto mais longo lê melhor assim), Tipo e Ações
// ficam centralizados, alinhados com o título centralizado da coluna.
const thEsq = { textAlign: 'center', padding: '11px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--cor-texto-suave)', borderBottom: '1px solid #EAF2F5' }
const tdEsq = { textAlign: 'left', padding: '11px 12px', borderBottom: '1px solid #EAF2F5', verticalAlign: 'middle' }
const tdCentro = { ...tdEsq, textAlign: 'center' }
