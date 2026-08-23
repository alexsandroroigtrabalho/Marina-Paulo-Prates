import { salvarCliente, confirmarPagamentoMensalidade } from '../lib/db'

// Chave de pagamento reutilizável. À esquerda/vermelho = "Pagamento não
// efetuado", à direita/verde = "Pagamento efetuado". A confirmação é
// SEMPRE um clique manual e explícito do administrador — nunca é chamada
// automaticamente por nenhum outro fluxo do app (o reset de dia 5 mexe
// direto no banco, via marina.resetar_pagamentos_mensal/pg_cron, nunca por
// aqui). Ao ligar a chave, grava também pagamento_confirmado_em (data/hora
// da confirmação) e — via confirmarPagamentoMensalidade — lança
// automaticamente a mensalidade recebida na "Arrecadação detalhada" (aba
// Financeiro), sem duplicar se já houver uma cobrança paga no mês. Ao
// desligar, não mexe em nada disso: nem no histórico de confirmação, nem
// numa cobrança já paga (dinheiro recebido continua contando como
// arrecadação; desligar só bloqueia o acesso do período seguinte).
export default function ChavePagamento({ cliente, marinaId, valorMensalidade, onAtualizado, className = '' }) {
  async function definir(confirmado) {
    try {
      if (confirmado) {
        await confirmarPagamentoMensalidade({ cliente, marinaId, valorMensalidade })
      } else {
        await salvarCliente({ id: cliente.id, pagamento_confirmado: false })
      }
      await onAtualizado?.()
    } catch (err) {
      alert('Não foi possível atualizar o pagamento: ' + err.message)
    }
  }

  return (
    <label
      className={`chave-pagamento ${className}`}
      title={cliente.pagamento_confirmado ? 'Clique para marcar como não efetuado' : 'Clique para confirmar o pagamento e liberar o acesso'}
    >
      <span className="toggle toggle-pagamento">
        <input type="checkbox" checked={!!cliente.pagamento_confirmado} onChange={(e) => definir(e.target.checked)} />
        <span className="trilho" />
      </span>
      <span className={`chave-pagamento-rotulo ${cliente.pagamento_confirmado ? 'on' : 'off'}`}>
        {cliente.pagamento_confirmado ? 'Pagamento efetuado' : 'Pagamento não efetuado'}
      </span>
    </label>
  )
}
