import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listarCobrancasDetalhado, listarPedidosAbastecimento } from '../lib/db'

// A "Arrecadação detalhada" é alimentada automaticamente por só duas
// fontes, de propósito (nada de serviço/multa avulsos aqui — só o que o
// pedido do administrador definiu como arrecadação da marina):
//  - Mensalidades dos clientes: cobrança tipo "mensalidade", status "pago" —
//    lançada sozinha pela chave de pagamento (ver confirmarPagamentoMensalidade
//    em lib/db.js) quando o administrador confirma o pagamento de um cliente.
//  - Consumo de combustível: pedidos de abastecimento pagos/entregues.
// Embarcação/jet vem, quando existe: direto no pedido de abastecimento, ou
// indiretamente na cobrança via a reserva/ordem de serviço que a originou.
function montarLinhasArrecadacao(cobrancasDetalhado, pedidosAbastecimento) {
  const deCobrancas = cobrancasDetalhado
    .filter((c) => c.status === 'pago' && c.tipo === 'mensalidade')
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

// A aba Financeiro contém só a "Arrecadação detalhada" — a situação de
// pagamento por cliente (chave "Pagamento efetuado"/"não efetuado") mora
// exclusivamente na tela Clientes, sem réplica aqui, pra não ter duas
// telas mostrando (e podendo dessincronizar) a mesma informação de acesso.
// "Cobranças", "Notas fiscais" e "Previsão de Caixa" saíram a pedido antes
// disso. Sem mais nada pra escolher, o conteúdo fica direto na página (sem
// tabs, sem modal).
export default function TelaFinanceiro({ marinaId }) {
  const [carregandoArrecadacao, setCarregandoArrecadacao] = useState(false)
  const [cobrancasDetalhado, setCobrancasDetalhado] = useState([])
  const [pedidosAbastecimento, setPedidosAbastecimento] = useState([])
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  function carregarArrecadacao() {
    if (!marinaId) return
    setCarregandoArrecadacao(true)
    Promise.all([listarCobrancasDetalhado(marinaId), listarPedidosAbastecimento(marinaId)])
      .then(([cob, ab]) => { setCobrancasDetalhado(cob); setPedidosAbastecimento(ab) })
      .finally(() => setCarregandoArrecadacao(false))
  }
  useEffect(() => { carregarArrecadacao() }, [marinaId])

  // Atualização em tempo real: uma mensalidade confirmada na tela Clientes
  // (ou um abastecimento pago/entregue em outra tela/sessão) aparece aqui
  // na hora, sem F5 — mesmo padrão já usado nas demais telas do sistema.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`financeiro-${marinaId}-arrecadacao`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'cobrancas', filter: `marina_id=eq.${marinaId}` }, () => carregarArrecadacao())
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'pedidos_abastecimento', filter: `marina_id=eq.${marinaId}` }, () => carregarArrecadacao())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  function limparFiltrosArrecadacao() {
    setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroCliente(''); setFiltroFormaPagamento(''); setFiltroStatus('')
  }

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
      <h3 style={{ marginTop: 0 }}>Arrecadação detalhada</h3>
      <p className="dica" style={{ marginTop: -4 }}>
        Cada valor recebido pela marina, individualmente: mensalidades de clientes confirmadas na tela Clientes e
        consumo de combustível pago/entregue. A situação de pagamento por cliente (liberado/bloqueado) fica na tela
        Clientes — aqui só entra o que já foi efetivamente recebido.
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

      {/* A exportação em planilha desta tela mudou de lugar: agora fica em
          Configurações → Financeiro (engrenagem do Painel de Controle),
          exportando sempre o período completo — não só o que estava
          filtrado aqui na tela. */}
      <div className="stat-card" style={{ padding: '10px 16px', marginBottom: 16 }}>
        <span>Total arrecadado no período</span>
        <strong>R$ {totalArrecadacaoFiltrada.toFixed(2)}</strong>
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.length === 0 && (
                <tr><td colSpan={6}>Nenhum pagamento encontrado para os filtros selecionados.</td></tr>
              )}
              {linhasFiltradas.map((l) => (
                <tr key={l.id}>
                  <td>{l.dataHora ? new Date(l.dataHora).toLocaleString('pt-BR') : '—'}</td>
                  <td>{l.cliente || '—'}</td>
                  <td>{l.embarcacao || '—'}</td>
                  <td>{l.descricao || '—'}</td>
                  <td>R$ {l.valor.toFixed(2)}</td>
                  <td><span className={`badge status-${l.status}`}>{l.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
