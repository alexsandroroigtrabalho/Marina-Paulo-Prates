import { useEffect, useState } from 'react'
import { listarClientes, listarEmbarcacoes, listarCombustiveis, solicitarAbastecimento } from '../lib/db'
import { OBSERVACAO_COMPLETAR_TANQUE } from '../lib/statusAbastecimento'

// Registro manual de um pedido de combustível — mesmo destino de um pedido
// feito pelo cliente pelo app (mesma tabela, mesmo insert, ver
// solicitarAbastecimento em lib/db.js): entra na planilha de solicitações,
// no Histórico de Abastecimento (ConfiguracoesPainel.jsx) e sai do painel
// pelo mesmo relógio de sempre (24h após criado, ou na hora se cancelado —
// ver JANELA_PLANILHA_MS em lib/statusAbastecimento.js), sem nenhum código
// separado pra isso: os dois fluxos convergem na mesma linha do banco.
//
// Preço, valor e forma de pagamento não entram aqui de propósito — saíram
// do RV Marine junto com o financeiro (são do RV Finance, ver comentários
// em TelaVagas.jsx e lib/statusAbastecimento.js).
function agoraParaDatetimeLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const FORM_VAZIO = { clienteId: '', embarcacaoId: '', combustivelId: '', modo: 'litros', quantidadeLitros: '', dataHora: '', observacoes: '' }

export default function NovoPedidoAbastecimentoModal({ aberto, onFechar, marinaId, onCriado }) {
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [combustiveis, setCombustiveis] = useState([])
  const [form, setForm] = useState(FORM_VAZIO)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Recarrega listas e reseta o formulário toda vez que o modal abre — a
  // data/hora já nasce preenchida com o momento atual (o operador só mexe
  // nela pra registrar um pedido que chegou antes, ex: por telefone ontem).
  useEffect(() => {
    if (!aberto || !marinaId) return
    setForm({ ...FORM_VAZIO, dataHora: agoraParaDatetimeLocal() })
    setErro('')
    Promise.all([listarClientes(marinaId), listarEmbarcacoes(marinaId), listarCombustiveis(marinaId)])
      .then(([cs, es, cbs]) => {
        setClientes(cs)
        setEmbarcacoes(es)
        setCombustiveis(cbs.filter((c) => c.ativo))
      })
      .catch((err) => setErro('Não foi possível carregar os dados do formulário: ' + err.message))
  }, [aberto, marinaId])

  const embarcacoesDoCliente = embarcacoes.filter((e) => e.cliente_id === form.clienteId)

  // "Completar tanque" reaproveita o mesmo marcador que o painel do cliente
  // usa (ver OBSERVACAO_COMPLETAR_TANQUE) — por isso as observações livres
  // ficam indisponíveis nesse modo: o campo `observacoes` só pode guardar
  // uma coisa de cada vez, e o marcador precisa do texto exato pra
  // ehCompletarTanque/textoQuantidade reconhecerem o pedido em qualquer
  // outra tela.
  function mudarModo(completar) {
    setForm((f) => ({ ...f, modo: completar ? 'completar' : 'litros', observacoes: completar ? '' : f.observacoes }))
  }

  async function salvar(e) {
    e.preventDefault()
    if (!form.clienteId || !form.embarcacaoId || !form.combustivelId) {
      setErro('Selecione cliente, embarcação e combustível.')
      return
    }
    if (form.modo === 'litros' && !(Number(form.quantidadeLitros) > 0)) {
      setErro('Informe uma quantidade em litros maior que zero, ou marque "Completar tanque".')
      return
    }
    const dataHora = new Date(form.dataHora)
    if (Number.isNaN(dataHora.getTime())) {
      setErro('Data e hora do pedido inválida.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await solicitarAbastecimento({
        marina_id: marinaId,
        cliente_id: form.clienteId,
        embarcacao_id: form.embarcacaoId,
        combustivel_id: form.combustivelId,
        quantidade_litros: form.modo === 'completar' ? 0 : Number(form.quantidadeLitros),
        observacoes: form.modo === 'completar' ? OBSERVACAO_COMPLETAR_TANQUE : (form.observacoes.trim() || null),
        status: 'solicitado',
        created_at: dataHora.toISOString(),
      })
      onCriado?.()
      onFechar()
    } catch (err) {
      setErro('Não foi possível registrar o pedido: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Novo pedido de combustível</h3>
        <p className="dica" style={{ margin: '0 0 14px' }}>
          Registro manual — para um pedido que chegou por telefone, presencialmente ou por
          qualquer canal fora do painel do cliente. Entra na planilha de solicitações e no
          Histórico de Abastecimento exatamente como um pedido feito pelo app.
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
            Combustível
            <select required value={form.combustivelId}
              onChange={(e) => setForm({ ...form, combustivelId: e.target.value })}>
              <option value="">Selecione o combustível</option>
              {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>

          <label className="opcao-checkbox">
            <input type="checkbox" checked={form.modo === 'completar'} onChange={(e) => mudarModo(e.target.checked)} />
            Completar tanque (quantidade só é conhecida ao abastecer)
          </label>

          {form.modo === 'litros' && (
            <label>
              Quantidade (litros)
              <input required type="number" min={0.1} step={0.1} value={form.quantidadeLitros}
                onChange={(e) => setForm({ ...form, quantidadeLitros: e.target.value })} />
            </label>
          )}

          <label>
            Data e hora do pedido
            <input required type="datetime-local" value={form.dataHora}
              onChange={(e) => setForm({ ...form, dataHora: e.target.value })} />
          </label>

          {form.modo === 'litros' ? (
            <label>
              Observações / responsável pelo atendimento (opcional)
              <input value={form.observacoes} placeholder="Ex: recebido por telefone — Ana"
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </label>
          ) : (
            <p className="dica" style={{ margin: 0 }}>
              Em "Completar tanque" o campo de observações fica reservado pra marcar o pedido — não dá pra somar
              uma nota de responsável junto neste modo.
            </p>
          )}

          {erro && <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>{erro}</p>}

          <div className="acoes-modal">
            <button type="button" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" disabled={salvando}>{salvando ? 'Registrando…' : 'Registrar pedido'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
