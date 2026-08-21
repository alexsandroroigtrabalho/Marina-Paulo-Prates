import { useEffect, useState } from 'react'
import {
  listarCobrancas, criarCobranca, marcarCobrancaPaga, listarClientes,
  listarNotasFiscais, criarNotaFiscal, atualizarNotaFiscal,
} from '../lib/db'

const STATUS_NF_LABEL = { pendente: 'Pendente de emissão', emitida: 'Emitida', cancelada: 'Cancelada' }

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatarMes(mes) {
  const [ano, m] = mes.split('-')
  return `${NOMES_MES[Number(m) - 1]}/${ano}`
}

// Agrupa as cobranças por mês de vencimento para dar uma leitura de previsão
// de caixa sem precisar de lançamento/programação separados — tudo nasce do
// mesmo cadastro de cobrança.
function agruparPorMes(cobrancas) {
  const mapa = {}
  cobrancas.forEach((c) => {
    const mes = (c.vencimento || '').slice(0, 7)
    if (!mes) return
    if (!mapa[mes]) mapa[mes] = { mes, previsto: 0, recebido: 0 }
    mapa[mes].previsto += Number(c.valor)
    if (c.status === 'pago') mapa[mes].recebido += Number(c.valor)
  })
  return Object.values(mapa).sort((a, b) => a.mes.localeCompare(b.mes))
}

export default function TelaFinanceiro({ marinaId }) {
  const [aba, setAba] = useState('cobrancas') // cobrancas | caixa | notas
  const [cobrancas, setCobrancas] = useState([])
  const [clientes, setClientes] = useState([])
  const [notas, setNotas] = useState([])
  const [form, setForm] = useState({ cliente_id: '', descricao: '', tipo: 'mensalidade', valor: '', vencimento: '' })

  async function carregar() {
    if (!marinaId) return
    const [c, cl, nf] = await Promise.all([listarCobrancas(marinaId), listarClientes(marinaId), listarNotasFiscais(marinaId)])
    setCobrancas(c); setClientes(cl); setNotas(nf)
  }

  useEffect(() => { carregar() }, [marinaId])

  async function nova(e) {
    e.preventDefault()
    await criarCobranca({ marina_id: marinaId, ...form })
    setForm({ cliente_id: '', descricao: '', tipo: 'mensalidade', valor: '', vencimento: '' })
    carregar()
  }

  async function gerarNotaParaCobranca(c) {
    await criarNotaFiscal({
      marina_id: marinaId,
      cliente_id: c.cliente_id,
      cobranca_id: c.id,
      descricao: c.descricao,
      valor: c.valor,
    })
    setAba('notas')
    carregar()
  }

  async function marcarNotaEmitida(nota, numero) {
    if (!numero) return
    await atualizarNotaFiscal(nota.id, { status: 'emitida', numero_nota: numero, data_emissao: new Date().toISOString().slice(0, 10) })
    carregar()
  }

  const totalPendente = cobrancas.filter((c) => c.status !== 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const totalRecebido = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const hoje = new Date().toISOString().slice(0, 10)
  const resumoMensal = agruparPorMes(cobrancas)
  const proximosVencimentos = cobrancas
    .filter((c) => c.status !== 'pago')
    .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
    .slice(0, 10)

  return (
    <div>
      <div className="resumo-financeiro">
        <div className="stat-card"><span>Pendente</span><strong>R$ {totalPendente.toFixed(2)}</strong></div>
        <div className="stat-card"><span>Recebido</span><strong>R$ {totalRecebido.toFixed(2)}</strong></div>
      </div>

      <div className="abas">
        <button className={aba === 'cobrancas' ? 'ativo' : ''} onClick={() => setAba('cobrancas')}>Cobranças</button>
        <button className={aba === 'caixa' ? 'ativo' : ''} onClick={() => setAba('caixa')}>Previsão de Caixa</button>
        <button className={aba === 'notas' ? 'ativo' : ''} onClick={() => setAba('notas')}>Notas fiscais (NFS-e)</button>
      </div>

      {aba === 'cobrancas' && (
        <>
          <form className="form-inline" onSubmit={nova}>
            <select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
              <option value="">Cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input placeholder="Descrição" required value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="mensalidade">Mensalidade</option>
              <option value="servico">Serviço</option>
              <option value="multa">Multa</option>
              <option value="outro">Outro</option>
            </select>
            <input type="number" step="0.01" placeholder="Valor" required value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <input type="date" required value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
            <button type="submit">+ Nova cobrança</button>
          </form>

          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {cobrancas.map((c) => {
                const jaTemNota = notas.some((n) => n.cobranca_id === c.id)
                return (
                  <tr key={c.id}>
                    <td>{c.clientes?.nome}</td>
                    <td>{c.descricao}</td>
                    <td>R$ {Number(c.valor).toFixed(2)}</td>
                    <td>{c.vencimento}</td>
                    <td><span className={`badge status-${c.status}`}>{c.status}</span></td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {c.status !== 'pago' && <button onClick={() => marcarCobrancaPaga(c.id).then(carregar)}>Marcar como pago</button>}
                      {!jaTemNota && <button onClick={() => gerarNotaParaCobranca(c)}>Gerar NF-e</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="dica">Para cobrar via PIX/cartão/boleto automaticamente, use a Edge Function <code>payment</code> (Mercado Pago) — veja <code>supabase/functions/payment</code>.</p>
        </>
      )}

      {aba === 'caixa' && (
        <>
          <p className="dica">
            Previsão de entradas mês a mês, calculada direto a partir dos vencimentos já cadastrados nas cobranças —
            sem precisar lançar nada de novo em outro lugar.
          </p>
          <table className="tabela">
            <thead><tr><th>Mês</th><th>Previsto</th><th>Recebido</th><th>Em aberto</th></tr></thead>
            <tbody>
              {resumoMensal.length === 0 && <tr><td colSpan={4}>Nenhuma cobrança cadastrada ainda.</td></tr>}
              {resumoMensal.map((m) => (
                <tr key={m.mes}>
                  <td>{formatarMes(m.mes)}</td>
                  <td>R$ {m.previsto.toFixed(2)}</td>
                  <td>R$ {m.recebido.toFixed(2)}</td>
                  <td>R$ {(m.previsto - m.recebido).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>Próximos vencimentos</h3>
          <div className="lista-cards">
            {proximosVencimentos.length === 0 && <p className="dica">Nada pendente por aqui.</p>}
            {proximosVencimentos.map((c) => (
              <div key={c.id} className="cliente-card">
                <div className="linha"><b>{c.clientes?.nome}</b> — {c.descricao}</div>
                <div className="linha">Vencimento: {c.vencimento} — R$ {Number(c.valor).toFixed(2)}</div>
                <span className={`status-texto ${c.vencimento < hoje ? 'pendente' : ''}`}>
                  {c.vencimento < hoje ? 'Atrasado' : 'A vencer'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {aba === 'notas' && (
        <>
          <p className="dica">
            Controle interno de notas fiscais de serviço. A emissão de verdade depende da prefeitura/certificado digital
            (ou de um provedor como Focus NFe/NFE.io) — por enquanto, emita pelo canal que você já usa e cole aqui o número da nota.
          </p>
          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Nº da nota</th><th></th></tr></thead>
            <tbody>
              {notas.length === 0 && <tr><td colSpan={6}>Nenhuma nota fiscal registrada ainda.</td></tr>}
              {notas.map((n) => (
                <tr key={n.id}>
                  <td>{n.clientes?.nome}</td>
                  <td>{n.descricao}</td>
                  <td>R$ {Number(n.valor).toFixed(2)}</td>
                  <td><span className={`badge status-${n.status}`}>{STATUS_NF_LABEL[n.status] || n.status}</span></td>
                  <td>{n.numero_nota || '-'}</td>
                  <td>
                    {n.status === 'pendente' && (
                      <input
                        placeholder="Nº da nota emitida"
                        onKeyDown={(e) => e.key === 'Enter' && marcarNotaEmitida(n, e.target.value)}
                        onBlur={(e) => marcarNotaEmitida(n, e.target.value)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
