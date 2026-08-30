import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listarCertificadosEscola, listarAprovadosSemCertificado, emitirCertificado,
  atualizarStatusCertificado, labelHabilitacao,
} from '../lib/enautica'

// Terceira tela da equipe da escola no RV e-Náutica: emitir o registro
// interno de conclusão de curso — não é o documento oficial (esse vem da
// Marinha do Brasil direto pro Gov.br do aluno, ver aviso na aba do
// aluno), só um recibo que a escola controla. Mesmo conceito do rsnautica
// antigo (tabela `certificados`), sem a etapa de notificação por e-mail
// (RV e-Náutica não tem Edge Function de envio configurada) — a emissão
// já deixa disponível pro aluno ver na hora (realtime).
const STATUS_OPCOES = [
  { chave: 'disponível', label: 'Disponível' },
  { chave: 'entregue', label: 'Entregue' },
]

export default function TelaCertificadosEscolaENautica({ marinaId }) {
  const [emitidos, setEmitidos] = useState([])
  const [pendentes, setPendentes] = useState([])
  const [erro, setErro] = useState(null)
  const [processandoId, setProcessandoId] = useState(null)

  async function carregar() {
    if (!marinaId) return
    try {
      const [certs, aptos] = await Promise.all([listarCertificadosEscola(marinaId), listarAprovadosSemCertificado(marinaId)])
      setEmitidos(certs)
      setPendentes(aptos)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    }
  }

  useEffect(() => { carregar() }, [marinaId])

  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-certificados-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'certificados', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  async function emitir(matricula) {
    setProcessandoId(matricula.cliente_id)
    try {
      await emitirCertificado({ marinaId, clienteId: matricula.cliente_id, habilitacao: matricula.habilitacao })
      await carregar()
    } catch (err) {
      alert('Não foi possível emitir o certificado: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  async function mudarStatus(id, status) {
    setProcessandoId(id)
    try {
      await atualizarStatusCertificado(id, status)
      await carregar()
    } catch (err) {
      alert('Não foi possível atualizar o status: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  return (
    <div>
      {erro && <p className="erro">Não foi possível carregar os certificados ({erro}).</p>}

      <strong>Prontos para emitir</strong>
      <p className="dica" style={{ margin: '4px 0 10px' }}>
        Alunos com matrícula aprovada que ainda não têm certificado emitido para a habilitação deles.
      </p>
      <div className="lista-cards">
        {pendentes.length === 0 && <p className="dica">Nenhum aluno pendente de emissão no momento.</p>}
        {pendentes.map((m) => (
          <div key={`${m.cliente_id}-${m.habilitacao}`} className="cliente-card">
            <div className="cabecalho-cliente">
              <div className="titulo-cliente"><span className="nome">{m.clientes?.nome || 'Aluno'}</span></div>
            </div>
            <div className="linha"><b>Habilitação:</b> {labelHabilitacao(m.habilitacao)}</div>
            <div className="linha"><b>E-mail:</b> {m.clientes?.email || '—'}</div>
            <div className="cliente-card-acoes">
              <button type="button" className="botao-secundario" disabled={processandoId === m.cliente_id} onClick={() => emitir(m)}>
                {processandoId === m.cliente_id ? 'Emitindo…' : 'Emitir certificado'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <strong style={{ display: 'block', marginTop: 24 }}>Certificados emitidos</strong>
      <div className="lista-cards" style={{ marginTop: 10 }}>
        {emitidos.length === 0 && <p className="dica">Nenhum certificado emitido ainda.</p>}
        {emitidos.map((c) => (
          <div key={c.id} className="cliente-card">
            <div className="cabecalho-cliente">
              <div className="titulo-cliente"><span className="nome">{c.clientes?.nome || 'Aluno'}</span></div>
            </div>
            <div className="linha"><b>Habilitação:</b> {labelHabilitacao(c.habilitacao)}</div>
            <div className="linha"><b>Emitido em:</b> {new Date(`${c.data_emissao}T12:00`).toLocaleDateString('pt-BR')}</div>
            <div className="linha">
              <b>Status:</b>{' '}
              <select value={c.status} disabled={processandoId === c.id} onChange={(e) => mudarStatus(c.id, e.target.value)}>
                {STATUS_OPCOES.map((s) => <option key={s.chave} value={s.chave}>{s.label}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
