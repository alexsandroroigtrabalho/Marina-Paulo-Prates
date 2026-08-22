import { useEffect, useState } from 'react'
import { IconReceipt2 } from '@tabler/icons-react'
import {
  listarCobrancas, criarCobranca, marcarCobrancaPaga, listarClientes,
  listarNotasFiscais, criarNotaFiscal, atualizarNotaFiscal,
  listarCobrancasDetalhado, listarPedidosAbastecimento,
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

// Junta os dois únicos lugares do sistema onde dinheiro efetivamente "entra"
// (cobranças pagas — mensalidade/serviço/multa — e pedidos de abastecimento
// pagos/entregues) numa única lista de pagamentos individuais, pra tela
// "Arrecadação detalhada". Embarcação/jet vem, quando existe: direto no
// pedido de abastecimento, ou indiretamente na cobrança via a reserva ou a
// ordem de serviço que a originou — os dois únicos jeitos de uma cobrança
// carregar uma embarcação hoje.
function montarLinhasArrecadacao(cobrancasDetalhado, pedidosAbastecimento) {
  const deCobrancas = cobrancasDetalhado
    .filter((c) => c.status === 'pago')
    .map((c) => ({
      id: `cob-${c.id}`,
      dataHora: c.pago_em,
      cliente: c.clientes?.nome || null,
      embarcacao: c.reservas?.embarcacoes?.nome || c.ordens_servico?.embarcacoes?.nome || null,
      descricao: c.descricao,
      valor: Number(c.valor),
      formaPagamento: c.forma_pagamento,
      status: c.status,
      comprovante: c.payment_id,
    }))
  const deAbastecimentos = pedidosAbastecimento
    .filter((p) => ['pago', 'entregue'].includes(p.status))
    .map((p) => ({
      id: `ab-${p.id}`,
      dataHora: p.pago_em || p.created_at,
      cliente: p.clientes?.nome || null,
      embarcacao: p.embarcacoes?.nome || null,
      descricao: `Abastecimento — ${p.combustiveis?.nome || ''} (${Number(p.quantidade_litros).toFixed(2)} L)`.trim(),
      valor: Number(p.valor_total),
      formaPagamento: p.forma_pagamento,
      status: p.status,
      comprovante: p.payment_id || (p.qr_code_demo ? 'QR demo' : null),
    }))
  return [...deCobrancas, ...deAbastecimentos].sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0))
}

function exportarCsv(linhas) {
  const cabecalho = ['Data/hora', 'Cliente', 'Embarcação/jet', 'Descrição', 'Valor', 'Forma de pagamento', 'Status', 'Identificador/comprovante']
  const corpo = linhas.map((l) => [
    l.dataHora ? new Date(l.dataHora).toLocaleString('pt-BR') : '',
    l.cliente || '',
    l.embarcacao || '',
    l.descricao || '',
    l.valor.toFixed(2),
    l.formaPagamento || '',
    l.status || '',
    l.comprovante || '',
  ])
  const csv = [cabecalho, ...corpo]
    .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `arrecadacao-detalhada-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function TelaFinanceiro({ marinaId }) {
  const [aba, setAba] = useState('cobrancas') // cobrancas | caixa | notas
  const [cobrancas, setCobrancas] = useState([])
  const [clientes, setClientes] = useState([])
  const [notas, setNotas] = useState([])
  const [form, setForm] = useState({ cliente_id: '', descricao: '', tipo: 'mensalidade', valor: '', vencimento: '' })

  // "Arrecadação detalhada" — modal à parte, com sua própria carga de dados
  // (só busca quando aberto pela primeira vez) e seus próprios filtros.
  const [modalArrecadacaoAberto, setModalArrecadacaoAberto] = useState(false)
  const [carregandoArrecadacao, setCarregandoArrecadacao] = useState(false)
  const [cobrancasDetalhado, setCobrancasDetalhado] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

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

  async function abrirArrecadacaoDetalhada() {
    setModalArrecadacaoAberto(true)
    setCarregandoArrecadacao(true)
    try {
      const [cob, ab] = await Promise.all([listarCobrancasDetalhado(marinaId), listarPedidosAbastecimento(marinaId)])
      setCobrancasDetalhado(cob)
      setPedidosAbastecimento(ab)
    } finally {
      setCarregandoArrecadacao(false)
    }
  }

  function limparFiltrosArrecadacao() {
    setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroCliente(''); setFiltroFormaPagamento(''); setFiltroStatus('')
  }

  const totalPendente = cobrancas.filter((c) => c.status !== 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const totalRecebido = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const hoje = new Date().toISOString().slice(0, 10)
  const resumoMensal = agruparPorMes(cobrancas)
  const proximosVencimentos = cobrancas
    .filter((c) => c.status !== 'pago')
    .sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''))
    .slice(0, 10)

  const linhasArrecadacao = montarLinhasArrecadacao(cobrancasDetalhado, pedidosAbastecimento)
  const clientesArrecadacao = [...new Set(linhasArrecadacao.map((l) => l.cliente).filter(Boolean))].sort()
  const formasArrecadacao = [...new Set(linhasArrecadacao.map((l) => l.formaPagamento).filter(Boolean))].sort()
  const statusArrecadacao = [...new Set(linhasArrecadacao.map((l) => l.status).filter(Boolean))].sort()
  const linhasFiltradas = linhasArrecadacao.filter((l) => {
    const dataDia = l.dataHora ? l.dataHora.slice(0, 10) : null
    if (filtroDataInicio && (!dataDia || dataDia < filtroDataInicio)) return false
    if (filtroDataFim && (!dataDia || dataDia > filtroDataFim)) return false
    if (filtroCliente && l.cliente !== filtroCliente) return false
    if (filtroFormaPagamento && l.formaPagamento !== filtroFormaPagamento) return false
    if (filtroStatus && l.status !== filtroStatus) return false
    return true
  })
  const totalArrecadacaoFiltrada = linhasFiltradas.reduce((s, l) => s + l.valor, 0)

  return (
    <div>
      <div className="resumo-financeiro">
        <div className="stat-card"><span>Pendente</span><strong>R$ {totalPendente.toFixed(2)}</strong></div>
        <div className="stat-card"><span>Recebido</span><strong>R$ {totalRecebido.toFixed(2)}</strong></div>
      </div>

      <button type="button" className="btn-primario"
        style={{ width: 'auto', marginBottom: 20, padding: '12px 22px', fontSize: 15 }}
        onClick={abrirArrecadacaoDetalhada}>
        <IconReceipt2 size={18} /> Arrecadação detalhada
      </button>

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

      {modalArrecadacaoAberto && (
        <div className="modal-fundo" onClick={() => setModalArrecadacaoAberto(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}
            style={{ width: '95vw', maxWidth: 1100, maxHeight: '88vh', overflow: 'auto' }}>
            <h3 style={{ margin: 0 }}>Arrecadação detalhada</h3>
            <p className="dica" style={{ marginTop: -4 }}>
              Cada pagamento recebido pela marina (mensalidades, serviços, multas e abastecimento), individualmente.
            </p>

            <div className="form-inline" style={{ marginBottom: 4 }}>
              <label className="dica" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                De
                <input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
              </label>
              <label className="dica" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                Até
                <input type="date" value={filtroDataFim} onChange={(e) => setFiltroDataFim(e.target.value)} />
              </label>
              <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
                <option value="">Todos os clientes</option>
                {clientesArrecadacao.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroFormaPagamento} onChange={(e) => setFiltroFormaPagamento(e.target.value)}>
                <option value="">Todas as formas de pagamento</option>
                {formasArrecadacao.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                <option value="">Todos os status</option>
                {statusArrecadacao.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button type="button" className="voltar" onClick={limparFiltrosArrecadacao}>Limpar filtros</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div className="stat-card" style={{ padding: '10px 16px' }}>
                <span>Total arrecadado no período</span>
                <strong>R$ {totalArrecadacaoFiltrada.toFixed(2)}</strong>
              </div>
              <button type="button" disabled={linhasFiltradas.length === 0} onClick={() => exportarCsv(linhasFiltradas)}>
                Exportar CSV
              </button>
            </div>

            {carregandoArrecadacao ? (
              <p className="dica">Carregando...</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Data/hora</th>
                      <th>Cliente</th>
                      <th>Embarcação/jet</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th>Forma de pagamento</th>
                      <th>Status</th>
                      <th>Comprovante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.length === 0 && (
                      <tr><td colSpan={8}>Nenhum pagamento encontrado para os filtros selecionados.</td></tr>
                    )}
                    {linhasFiltradas.map((l) => (
                      <tr key={l.id}>
                        <td>{l.dataHora ? new Date(l.dataHora).toLocaleString('pt-BR') : '—'}</td>
                        <td>{l.cliente || '—'}</td>
                        <td>{l.embarcacao || '—'}</td>
                        <td>{l.descricao || '—'}</td>
                        <td>R$ {l.valor.toFixed(2)}</td>
                        <td>{l.formaPagamento || '—'}</td>
                        <td><span className={`badge status-${l.status}`}>{l.status}</span></td>
                        <td>{l.comprovante || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalArrecadacaoAberto(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
