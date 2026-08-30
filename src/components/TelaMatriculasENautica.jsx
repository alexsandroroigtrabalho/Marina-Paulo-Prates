import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarMatriculas, aprovarMatricula, recusarMatricula, labelHabilitacao } from '../lib/enautica'

// Primeira tela da equipe da escola no RV e-Náutica: aprovar ou recusar
// pedidos de matrícula. É o único "gate" de acesso do aluno — não existe
// pagamento aqui (ao contrário do rsnautica antigo, ver nota em
// src/lib/apps.js). Mesmo padrão visual de TelaClientes.jsx (abas + cards),
// pra manter a mesma estética do RV Marine em toda a plataforma.
const ABAS = [
  { chave: 'pendente', label: 'Pendentes' },
  { chave: 'aprovada', label: 'Aprovadas' },
  { chave: 'recusada', label: 'Recusadas' },
]

export default function TelaMatriculasENautica({ marinaId }) {
  const [matriculas, setMatriculas] = useState([])
  const [aba, setAba] = useState('pendente')
  const [processandoId, setProcessandoId] = useState(null)
  const [erro, setErro] = useState(null)

  async function carregar() {
    if (!marinaId) return
    try {
      setMatriculas(await listarMatriculas(marinaId))
      setErro(null)
    } catch (err) {
      setErro(err.message)
    }
  }

  useEffect(() => { carregar() }, [marinaId])

  // Realtime: um pedido novo do aluno (ou uma decisão tomada por outro
  // administrador logado em outra aba) aparece sem precisar de F5 — mesmo
  // padrão já usado em TelaClientes.jsx.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-matriculas-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'matriculas', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  async function aprovar(m) {
    setProcessandoId(m.id)
    try {
      await aprovarMatricula(m.id)
      await carregar()
    } catch (err) {
      alert('Não foi possível aprovar a matrícula: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function recusar(m) {
    const motivo = window.prompt(`Recusar a matrícula de ${m.clientes?.nome || 'este aluno'}? Descreva o motivo (o aluno vai ver esse texto):`)
    if (motivo === null) return
    setProcessandoId(m.id)
    try {
      await recusarMatricula(m.id, motivo.trim())
      await carregar()
    } catch (err) {
      alert('Não foi possível recusar a matrícula: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  const filtradas = matriculas.filter((m) => m.status === aba)

  return (
    <div>
      <div className="abas">
        {ABAS.map((a) => (
          <button key={a.chave} className={aba === a.chave ? 'ativo' : ''} onClick={() => setAba(a.chave)}>
            {a.label} {a.chave === 'pendente' && matriculas.filter((m) => m.status === 'pendente').length > 0
              ? `(${matriculas.filter((m) => m.status === 'pendente').length})` : ''}
          </button>
        ))}
      </div>

      {erro && <p className="erro">Não foi possível carregar as matrículas ({erro}).</p>}

      <div className="lista-cards">
        {filtradas.length === 0 && <p className="dica">Nenhuma matrícula {aba === 'pendente' ? 'pendente' : aba === 'aprovada' ? 'aprovada' : 'recusada'} no momento.</p>}
        {filtradas.map((m) => (
          <div key={m.id} className="cliente-card">
            <div className="cabecalho-cliente">
              <div className="titulo-cliente">
                <span className="nome">{m.clientes?.nome || 'Aluno sem nome'}</span>
              </div>
            </div>
            <div className="linha"><b>Habilitação desejada:</b> {labelHabilitacao(m.habilitacao)}</div>
            <div className="linha"><b>E-mail:</b> {m.clientes?.email || '—'}</div>
            <div className="linha"><b>Telefone:</b> {m.clientes?.telefone || '—'}</div>
            {m.status === 'recusada' && m.motivo_recusa && (
              <div className="linha"><b>Motivo da recusa:</b> {m.motivo_recusa}</div>
            )}

            {aba === 'pendente' && (
              <div className="cliente-card-acoes">
                <button type="button" className="botao-secundario" disabled={processandoId === m.id} onClick={() => aprovar(m)}>
                  Aprovar
                </button>
                <button type="button" className="botao-secundario perigo" disabled={processandoId === m.id} onClick={() => recusar(m)}>
                  Recusar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
