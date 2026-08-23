import { salvarCliente } from '../lib/db'

// Chave de pagamento reutilizável — mesmo componente usado na tela Clientes
// e na aba Financeiro, pra garantir que as duas nunca dessincronizem o
// rótulo, a cor ou o comportamento. À esquerda/vermelho = "Pagamento não
// efetuado", à direita/verde = "Pagamento efetuado". A confirmação é
// SEMPRE um clique manual e explícito do administrador — nunca é chamada
// automaticamente por nenhum outro fluxo do app (o reset de dia 5 mexe
// direto no banco, via marina.resetar_pagamentos_mensal/pg_cron, nunca por
// aqui). Ao ligar a chave, grava também pagamento_confirmado_em (data/hora
// da confirmação); ao desligar, não mexe nesse campo — ele funciona como
// histórico da última confirmação, mesmo depois do pagamento voltar a
// ficar pendente (reset automático ou revogação manual).
export default function ChavePagamento({ cliente, onAtualizado, className = '' }) {
  async function definir(confirmado) {
    try {
      const campos = { id: cliente.id, pagamento_confirmado: confirmado }
      if (confirmado) campos.pagamento_confirmado_em = new Date().toISOString()
      await salvarCliente(campos)
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
