import { useEffect, useState } from 'react'
import { listarCobrancas, listarCobrancasDetalhado, listarPedidosAbastecimento } from '../lib/db'

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

// Só restam duas abas — Previsão de Caixa e Arrecadação detalhada. As abas
// "Cobranças" e "Notas fiscais" saíram a pedido; "Arrecadação detalhada"
// deixou de ser um botão que abria modal e virou uma aba normal, com o
// conteúdo direto na página.
export default function TelaFinanceiro({ marinaId }) {
  const [aba, setAba] = useState('caixa') // caixa | arrecadacao
  const [cobrancas, setCobrancas] = useState([])

  // Arrecadação detalhada: carrega só quando a aba é aberta (dado mais
  // pesado que o resto, com join de cobranças + abastecimentos).
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
    setCobrancas(await listarCobrancas(marinaId))
  }

  useEffect(() => { carregar() }, [marinaId])

  useEffect(() => {
    if (aba !== 'arrecadacao' || !marinaId) return
    setCarregandoArrecadacao(true)
    Promise.all([listarCobrancasDetalhado(marinaId), listarPedidosAbastecimento(marinaId)])
      .then(([cob, ab]) => { setCobrancasDetalhado(cob); setPedidosAbastecimento(ab) })
      .finally(() => setCarregandoArrecadacao(false))
  }, [aba, marinaId])

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

      <div className="abas">
        <button className={aba === 'caixa' ? 'ativo' : ''} onClick={() => setAba('caixa')}>Previsão de Caixa</button>
        <button className={aba === 'arrecadacao' ? 'ativo' : ''} onClick={() => setAba('arrecadacao')}>Arrecadação detalhada</button>
      </div>

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

      {aba === 'arrecadacao' && (
        <>
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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
        </>
      )}
    </div>
  )
}
