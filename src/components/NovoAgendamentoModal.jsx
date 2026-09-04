import { useEffect, useState } from 'react'
import { listarClientes, listarEmbarcacoes, solicitarAgendamento } from '../lib/db'

// Registro manual de uma descida/subida de rampa — mesmo destino de uma
// solicitação feita pelo cliente pelo Diário de Bordo (mesma tabela, mesmo
// insert, ver solicitarAgendamento em lib/db.js): entra na Fila de Rampa
// exatamente como um pedido feito pelo app (status nasce 'solicitado' pelo
// próprio default da coluna no banco — não precisa ser passado aqui), com
// os mesmos botões de "Navegando"/"Recolhido" depois. Pensado pra quando o
// cliente liga ou aparece na marina pra pedir a descida/subida em vez de
// usar o app. Mesmo padrão do "+" de Abastecimento (ver
// NovoPedidoAbastecimentoModal.jsx) — sem seletor de horários livres da
// Agenda (isso é uma regra só do agendamento feito pelo PRÓPRIO cliente, ver
// cliente_cria_agendamento em migration_horarios_ocupados_agenda.sql); a
// policy do staff (admin_marina_agendamentos) não exige esse alinhamento de
// grade, então este formulário aceita qualquer data/hora, como um registro
// manual mesmo.
function agoraParaDatetimeLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const FORM_VAZIO = { clienteId: '', embarcacaoId: '', tipo: 'retirada', dataHora: '', previsaoRetorno: '', observacoes: '' }

export default function NovoAgendamentoModal({ aberto, onFechar, marinaId, onCriado }) {
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Recarrega listas e reseta o formulário toda vez que o modal abre — a
  // data/hora já nasce preenchida com o momento atual (a equipe só mexe nela
  // pra registrar um pedido que chegou antes, ex: por telefone ontem).
  useEffect(() => {
    if (!aberto || !marinaId) return
    setForm({ ...FORM_VAZIO, dataHora: agoraParaDatetimeLocal() })
    setErro('')
    Promise.all([listarClientes(marinaId), listarEmbarcacoes(marinaId)])
      .then(([cs, es]) => {
        setClientes(cs)
        setEmbarcacoes(es)
      })
      .catch((err) => setErro('Não foi possível carregar os dados do formulário: ' + err.message))
  }, [aberto, marinaId])

  const embarcacoesDoCliente = embarcacoes.filter((e) => e.cliente_id === form.clienteId)

  async function salvar(e) {
    e.preventDefault()
    if (!form.clienteId || !form.embarcacaoId) {
      setErro('Selecione cliente e embarcação.')
      return
    }
    const dataHora = new Date(form.dataHora)
    if (Number.isNaN(dataHora.getTime())) {
      setErro('Data e hora da manobra inválida.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await solicitarAgendamento({
        marina_id: marinaId,
        cliente_id: form.clienteId,
        embarcacao_id: form.embarcacaoId,
        tipo: form.tipo,
        data_hora: dataHora.toISOString(),
        observacoes: form.observacoes.trim() || null,
        // Só faz sentido prever retorno numa descida — mesmo campo/mesma
        // regra do formulário do cliente (ver TelaClienteDashboard.jsx).
        previsao_retorno: form.tipo === 'retirada' && form.previsaoRetorno
          ? new Date(form.previsaoRetorno).toISOString()
          : null,
      })
      onCriado?.()
      onFechar()
    } catch (err) {
      setErro('Não foi possível registrar a manobra: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Nova descida/subida</h3>
        <p className="dica" style={{ margin: '0 0 14px' }}>
          Registro manual — para uma descida ou subida pedida por telefone, presencialmente ou
          por qualquer canal fora do Diário de Bordo do cliente. Entra na Fila de Rampa
          exatamente como uma solicitação feita pelo app.
        </p>
        <form className="form-vertical" onSubmit={salvar}>
          <label>
            Cliente
            <select required value={form.clienteId}
              onChange={(e) => setForm({ ...form, clienteId: e.target.value, embarcacaoId: '' })}>
              <option value="">Selecione o cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>
            Embarcação
            <select required value={form.embarcacaoId} disabled={!form.clienteId}
              onChange={(e) => setForm({ ...form, embarcacaoId: e.target.value })}>
              <option value="">{form.clienteId ? 'Selecione a embarcação' : 'Selecione o cliente primeiro'}</option>
              {embarcacoesDoCliente.map((emb) => <option key={emb.id} value={emb.id}>{emb.nome}</option>)}
            </select>
          </label>
          <label>
            Tipo de manobra
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="retirada">Descida</option>
              <option value="retorno">Subida</option>
            </select>
          </label>

          <label>
            Data e hora da manobra
            <input required type="datetime-local" value={form.dataHora}
              onChange={(e) => setForm({ ...form, dataHora: e.target.value })} />
          </label>

          {form.tipo === 'retirada' && (
            <label>
              Previsão de retorno (opcional)
              <input type="datetime-local" value={form.previsaoRetorno}
                onChange={(e) => setForm({ ...form, previsaoRetorno: e.target.value })} />
            </label>
          )}

          <label>
            Observações / responsável pelo atendimento (opcional)
            <input value={form.observacoes} placeholder="Ex: recebido por telefone — Ana"
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>

          {erro && <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>{erro}</p>}

          <div className="acoes-modal">
            <button type="button" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" disabled={salvando}>{salvando ? 'Registrando…' : 'Registrar manobra'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
