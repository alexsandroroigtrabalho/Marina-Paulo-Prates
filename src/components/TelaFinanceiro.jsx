import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarClientes, listarCobrancas, listarCobrancasDetalhado, listarPedidosAbastecimento } from '../lib/db'
import { statusAcessoCliente } from '../lib/statusPagamento'
import ChavePagamento from './ChavePagamento'

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

// Só resta "Arrecadação detalhada" — "Cobranças", "Notas fiscais" e
// "Previsão de Caixa" saíram a pedido. Sem mais abas pra escolher, o
// conteúdo fica direto na página (sem tabs, sem modal).
export default function TelaFinanceiro({ marinaId }) {
  const [cobrancas, setCobrancas] = useState([])
  const [clientes, setClientes] = useState([])
  const [filtroClientePagamento, setFiltroClientePagamento] = useState('')

  const [carregandoArrecadacao, setCarregandoArrecadacao] = useState(false)
  const [cobrancasDetalhado, setCobrancasDetalhado] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  function carregarClientes() {
    if (!marinaId) return
    listarClientes(marinaId).then(setClientes)
  }

  useEffect(() => {
    if (!marinaId) return
    listarCobrancas(marinaId).then(setCobrancas)
    carregarClientes()
    setCarregandoArrecadacao(true)
    Promise.all([listarCobrancasDetalhado(marinaId), listarPedidosAbastecimento(marinaId)])
      .then(([cob, ab]) => { setCobrancasDetalhado(cob); setPedidosAbastecimento(ab) })
      .finally(() => setCarregandoArrecadacao(false))
  }, [marinaId])

  // Atualização em tempo real: a chave de pagamento pode ser mexida por
  // outro administrador em outra aba/tela (Clientes ou aqui mesmo em outra
  // sessão), ou pelo reset automático de dia 5 (marina.resetar_pagamentos_mensal
  // via pg_cron) — sem isto, a lista de status de pagamento só atualizaria
  // depois de um F5 manual. Mesmo padrão já usado em TelaClientes.jsx e
  // TelaClienteDashboard.jsx.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`financeiro-${marinaId}-clientes`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'clientes', filter: `marina_id=eq.${marinaId}` }, () => carregarClientes())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  function limparFiltrosArrecadacao() {
    setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroCliente(''); setFiltroFormaPagamento(''); setFiltroStatus('')
  }

  const totalPendente = cobrancas.filter((c) => c.status !== 'pago').reduce((s, c) => s + Number(c.valor), 0)
  const totalRecebido = cobrancas.filter((c) => c.status === 'pago').reduce((s, c) => s + Number(c.valor), 0)

  // Situação de pagamento por cliente (chave "Pagamento efetuado"/"não
  // efetuado") — mesma regra de acesso usada na tela Clientes e no painel
  // do próprio cliente (statusAcessoCliente, lib/statusPagamento.js), pra
  // nunca mostrar aqui um status diferente do que está em vigor de verdade.
  const clientesLiberados = clientes.filter((c) => statusAcessoCliente(c).classe === 'em-dia')
  const clientesBloqueados = clientes.filter((c) => statusAcessoCliente(c).classe !== 'em-dia')
  const clientesPagamentoFiltrados =
    filtroClientePagamento === 'liberados' ? clientesLiberados :
    filtroClientePagamento === 'bloqueados' ? clientesBloqueados :
    clientes

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
        <div className="stat-card"><span>Clientes com acesso liberado</span><strong>{clientesLiberados.length}</strong></div>
        <div className="stat-card alerta"><span>Clientes com acesso bloqueado</span><strong>{clientesBloqueados.length}</strong></div>
      </div>

      <h3 style={{ marginBottom: 4 }}>Situação de pagamento dos clientes</h3>
      <p className="dica" style={{ marginTop: -4 }}>
        Reflete a mesma chave "Pagamento efetuado"/"Pagamento não efetuado" da tela Clientes — mexer aqui também
        atualiza lá, no painel do cliente e nas permissões de acesso à Agenda, na hora. Todo dia 5, o pagamento de
        todos os clientes volta automaticamente para "não efetuado" (ver aviso abaixo da tabela).
      </p>
      <div className="form-inline" style={{ marginBottom: 12 }}>
        <select value={filtroClientePagamento} onChange={(e) => setFiltroClientePagamento(e.target.value)}>
          <option value="">Todos os clientes ({clientes.length})</option>
          <option value="liberados">Só acesso liberado ({clientesLiberados.length})</option>
          <option value="bloqueados">Só acesso bloqueado ({clientesBloqueados.length})</option>
        </select>
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 8 }}>
        <table className="tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Pagamento</th>
              <th>Confirmado em</th>
              <th>Acesso à Agenda</th>
            </tr>
          </thead>
          <tbody>
            {clientesPagamentoFiltrados.length === 0 && (
              <tr><td colSpan={4}>Nenhum cliente encontrado.</td></tr>
            )}
            {clientesPagamentoFiltrados.map((c) => {
              const acesso = statusAcessoCliente(c)
              return (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td><ChavePagamento cliente={c} onAtualizado={carregarClientes} /></td>
                  <td>{c.pagamento_confirmado_em ? new Date(c.pagamento_confirmado_em).toLocaleString('pt-BR') : '—'}</td>
                  <td><span className={`status-texto ${acesso.classe}`}>{acesso.texto}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="dica" style={{ marginTop: 0, marginBottom: 24 }}>
        Todo dia 5 do mês, o pagamento de todos os clientes volta automaticamente para "Pagamento não efetuado" e o
        acesso à Agenda (e às demais áreas que dependem de pagamento) é bloqueado de novo — inclusive de quem tinha
        liberação manual. Só volta quando o administrador confirmar o pagamento de cada cliente aqui ou na tela
        Clientes.
      </p>

      <h3>Arrecadação detalhada</h3>
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
    </div>
  )
}
