// ATENÇÃO — TELA DESATIVADA, DO FLUXO ANTIGO.
//
// Esta era a aba "Abastecimento" do menu, do tempo em que o pedido de
// combustível tinha preço, valor, QR Pix e confirmação de pagamento. Saiu do
// menu quando a cobrança passou para o RV Finance, e o controle do pedido
// passou a ser a seção "Solicitações de combustível" do Painel de Controle
// (ver TelaVagas.jsx), com apenas dois botões: confirmar e cancelar.
//
// O arquivo ficou no projeto porque o histórico dele pode ser útil ao montar
// a tela equivalente no RV Finance — mas NÃO compila mais contra a versão
// atual de lib/statusAbastecimento.js: STATUS_ABASTECIMENTO_OPCOES e
// aguardandoLitrosCompletarTanque eram do fluxo com pagamento e não existem
// mais. Nada importa este arquivo hoje, então ele não entra no build.
//
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listarCombustiveis, salvarCombustivel,
  listarPedidosAbastecimento, atualizarStatusAbastecimento, solicitarAbastecimento,
  listarClientes, listarEmbarcacoes, completarTanqueComLitros,
} from '../lib/db'
import { STATUS_ABASTECIMENTO_OPCOES, STATUS_ABASTECIMENTO_LABEL as STATUS_LABEL, classeStatusAbastecimento, abastecimentoConcluido, aguardandoLitrosCompletarTanque } from '../lib/statusAbastecimento'

const FORM_MANUAL_VAZIO = { cliente_id: '', embarcacao_id: '', combustivel_id: '', quantidade_litros: '', status: 'aguardando_pagamento' }

// Formulário curto — só o campo de litros — pra registrar quanto entrou de
// verdade num pedido "Completar tanque" assim que o tanque é enchido (ver
// completarTanqueComLitros em lib/db.js). Some sozinho da linha depois:
// aguardandoLitrosCompletarTanque passa a devolver false assim que
// quantidade_litros deixa de ser 0, e a linha passa a se comportar como um
// pedido normal (quantidade/valor reais, caixa de pagamento no Diário de
// Bordo do cliente).
function FormLitrosCompletarTanque({ pedido, onRegistrado }) {
  const [litros, setLitros] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    if (!litros || Number(litros) <= 0) return
    setEnviando(true)
    try {
      await completarTanqueComLitros(pedido, Number(litros))
      await onRegistrado()
    } catch (err) {
      alert('Não foi possível registrar os litros: ' + err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
      <input required type="number" min="0.5" step="0.5" placeholder="Litros" style={{ width: 64 }}
        value={litros} onChange={(e) => setLitros(e.target.value)} />
      <button type="submit" disabled={enviando} style={{ whiteSpace: 'nowrap' }}>
        {enviando ? '...' : 'Registrar'}
      </button>
    </form>
  )
}

export default function TelaAbastecimento({ marinaId }) {
  const [aba, setAba] = useState('pedidos') // pedidos | combustiveis
  const [combustiveis, setCombustiveis] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [formCombustivel, setFormCombustivel] = useState({ nome: '', preco_litro: '', estoque_litros: '' })
  // "Registrar abastecimento" (aba Pedidos): lança um abastecimento feito na
  // hora, direto no balcão da marina — o cliente nem precisa ter pedido pelo
  // app. clientes/embarcacoes só entram aqui pra montar os seletores deste
  // formulário; o resto da tela nunca precisou dessas duas listas.
  const [clientes, setClientes] = useState([])
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [formManual, setFormManual] = useState(FORM_MANUAL_VAZIO)
  const [enviandoManual, setEnviandoManual] = useState(false)

  async function carregar() {
    if (!marinaId) return
    const [c, p, cli, emb] = await Promise.all([
      listarCombustiveis(marinaId), listarPedidosAbastecimento(marinaId),
      listarClientes(marinaId), listarEmbarcacoes(marinaId),
    ])
    setCombustiveis(c); setPedidos(p); setClientes(cli); setEmbarcacoes(emb)
  }

  useEffect(() => { carregar() }, [marinaId])

  // Atualização em tempo real: um pedido cancelado pelo cliente direto no
  // Diário de Bordo dele (ver cancelarAbastecimentoCliente em
  // TelaClienteDashboard.jsx) aparece aqui na hora, sem precisar trocar de
  // aba/recarregar a página — mesmo padrão já usado em TelaFinanceiro.jsx
  // pra essa mesma tabela.
  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`abastecimento-${marinaId}-pedidos`)
      .on('postgres_changes', { event: '*', schema: 'marina', table: 'pedidos_abastecimento', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  async function salvarNovoCombustivel(e) {
    e.preventDefault()
    try {
      await salvarCombustivel({ marina_id: marinaId, ...formCombustivel })
      setFormCombustivel({ nome: '', preco_litro: '', estoque_litros: '' })
      await carregar()
    } catch (err) {
      alert('Não foi possível adicionar o combustível: ' + err.message)
    }
  }

  async function atualizarCampoCombustivel(combustivel, campo, valor) {
    try {
      await salvarCombustivel({ id: combustivel.id, marina_id: marinaId, nome: combustivel.nome, ativo: combustivel.ativo, [campo]: valor })
      await carregar()
    } catch (err) {
      alert('Não foi possível salvar essa alteração: ' + err.message)
    }
  }

  // Embarcações do cliente escolhido no formulário "Registrar abastecimento"
  // — ao trocar de cliente, seleciona a primeira automaticamente (a maioria
  // tem só uma), mas deixa trocar se o cliente tiver mais de uma cadastrada.
  const embarcacoesDoClienteManual = embarcacoes.filter((e) => e.cliente_id === formManual.cliente_id)
  function selecionarClienteManual(clienteId) {
    const primeira = embarcacoes.find((e) => e.cliente_id === clienteId)
    setFormManual({ ...formManual, cliente_id: clienteId, embarcacao_id: primeira?.id || '' })
  }

  const combustivelManualSelecionado = combustiveis.find((c) => c.id === formManual.combustivel_id)
  const valorServicoManual = combustivelManualSelecionado && formManual.quantidade_litros
    ? Number(formManual.quantidade_litros) * Number(combustivelManualSelecionado.preco_litro)
    : 0

  // Registra um abastecimento já feito/combinado na hora, direto no balcão
  // da marina, sem o cliente precisar pedir pelo app — mesma tabela
  // pedidos_abastecimento de sempre, então já entra automaticamente no
  // Diário de Bordo do cliente (ver diarioDeBordo em
  // TelaClienteDashboard.jsx) e na seção "Combustível" do Painel de
  // Controle (ver pedidosCombustivel em TelaVagas.jsx), em tempo real —
  // nenhuma das duas telas precisa de código extra pra isso, só de um
  // registro novo na tabela. O admin escolhe o status de entrada (ao
  // contrário de um pedido feito pelo cliente, que sempre começa em
  // 'solicitado' — ver enviarAbastecimento — aqui já é a equipe que sabe
  // se o cliente já pagou ou ainda vai pagar), usando as mesmas 4 opções e
  // o mesmo tratamento de cada uma (ver STATUS_ABASTECIMENTO_OPCOES em
  // lib/statusAbastecimento.js): "Pagamento efetuado" grava pago_em na
  // hora (mesmo comportamento de atualizarStatusAbastecimento), e
  // "Aguardando pagamento" gera o mesmo QR Pix de demonstração usado no
  // pedido do cliente, pra função "Ver QR/pagar" do Diário de Bordo dele
  // funcionar igual a qualquer outro pedido nesse status.
  async function registrarAbastecimentoManual(e) {
    e.preventDefault()
    const combustivel = combustiveis.find((c) => c.id === formManual.combustivel_id)
    if (!formManual.cliente_id || !combustivel || !formManual.quantidade_litros) return
    setEnviandoManual(true)
    try {
      const litros = Number(formManual.quantidade_litros)
      const valorTotal = litros * Number(combustivel.preco_litro)
      const qrDemo = `00020126DEMO-PIX-MARINA5204000053039865406${valorTotal.toFixed(2)}5802BR5913Marina Manager6009DEMO-QR`
      await solicitarAbastecimento({
        marina_id: marinaId,
        cliente_id: formManual.cliente_id,
        embarcacao_id: formManual.embarcacao_id || null,
        agendamento_id: null,
        combustivel_id: combustivel.id,
        quantidade_litros: litros,
        preco_litro_no_pedido: combustivel.preco_litro,
        valor_total: valorTotal,
        status: formManual.status,
        pago_em: formManual.status === 'pago' ? new Date().toISOString() : null,
        qr_code: formManual.status === 'aguardando_pagamento' ? qrDemo : null,
        qr_code_demo: formManual.status === 'aguardando_pagamento',
        observacoes: 'Registrado manualmente pela equipe',
      })
      setFormManual(FORM_MANUAL_VAZIO)
      await carregar()
    } catch (err) {
      alert('Não foi possível registrar o abastecimento: ' + err.message)
    } finally {
      setEnviandoManual(false)
    }
  }

  return (
    <div>
      <div className="abas">
        <button className={aba === 'pedidos' ? 'ativo' : ''} onClick={() => setAba('pedidos')}>Pedidos de abastecimento</button>
        <button className={aba === 'combustiveis' ? 'ativo' : ''} onClick={() => setAba('combustiveis')}>Combustíveis (estoque e preço)</button>
      </div>

      {aba === 'combustiveis' && (
        <>
          <form className="form-inline" onSubmit={salvarNovoCombustivel}>
            <input required placeholder="Nome (ex: Gasolina, Diesel Marítimo)" value={formCombustivel.nome}
              onChange={(e) => setFormCombustivel({ ...formCombustivel, nome: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Preço por litro (R$)" value={formCombustivel.preco_litro}
              onChange={(e) => setFormCombustivel({ ...formCombustivel, preco_litro: e.target.value })} />
            <input required type="number" step="0.01" placeholder="Estoque (litros)" value={formCombustivel.estoque_litros}
              onChange={(e) => setFormCombustivel({ ...formCombustivel, estoque_litros: e.target.value })} />
            <button type="submit">+ Adicionar combustível</button>
          </form>

          <table className="tabela">
            <thead><tr><th>Combustível</th><th>Preço/litro</th><th>Estoque (L)</th><th>Ativo</th></tr></thead>
            <tbody>
              {combustiveis.length === 0 && <tr><td colSpan={4}>Nenhum combustível cadastrado ainda.</td></tr>}
              {combustiveis.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>
                    <input type="number" step="0.01" defaultValue={c.preco_litro} style={{ width: 90 }}
                      onBlur={(e) => Number(e.target.value) !== Number(c.preco_litro) && atualizarCampoCombustivel(c, 'preco_litro', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" step="0.01" defaultValue={c.estoque_litros} style={{ width: 90 }}
                      onBlur={(e) => Number(e.target.value) !== Number(c.estoque_litros) && atualizarCampoCombustivel(c, 'estoque_litros', e.target.value)} />
                  </td>
                  <td>
                    <label className="toggle">
                      <input type="checkbox" checked={c.ativo} onChange={(e) => atualizarCampoCombustivel(c, 'ativo', e.target.checked)} />
                      <span className="trilho" />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {aba === 'pedidos' && (
        <>
          {/* Lança um abastecimento combinado direto no balcão (o cliente
              nem precisa ter pedido pelo app) — mesmo formato de "form-inline"
              já usado na aba Combustíveis logo acima. Depois de enviado, o
              pedido aparece sozinho, em tempo real, na tabela abaixo, no
              Diário de Bordo do cliente e na seção Combustível do Painel de
              Controle — ver registrarAbastecimentoManual. */}
          <div style={{ marginBottom: 16 }}>
            <strong>Registrar abastecimento</strong>
            <p className="dica" style={{ margin: '4px 0 10px' }}>
              Para um abastecimento já combinado/feito na hora, direto na marina — sem o cliente precisar pedir pelo app.
            </p>
            <form className="form-inline" onSubmit={registrarAbastecimentoManual}>
              <select required value={formManual.cliente_id} onChange={(e) => selecionarClienteManual(e.target.value)}>
                <option value="">Selecione o cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <select required value={formManual.embarcacao_id} disabled={!formManual.cliente_id}
                onChange={(e) => setFormManual({ ...formManual, embarcacao_id: e.target.value })}>
                <option value="">{formManual.cliente_id ? 'Selecione a embarcação' : 'Selecione o cliente primeiro'}</option>
                {embarcacoesDoClienteManual.map((emb) => (
                  <option key={emb.id} value={emb.id}>{emb.nome}</option>
                ))}
              </select>
              <select required value={formManual.combustivel_id} onChange={(e) => setFormManual({ ...formManual, combustivel_id: e.target.value })}>
                <option value="">Combustível</option>
                {combustiveis.filter((c) => c.ativo).map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <input required type="number" min="0.5" step="0.5" placeholder="Litros" style={{ maxWidth: 100 }}
                value={formManual.quantidade_litros}
                onChange={(e) => setFormManual({ ...formManual, quantidade_litros: e.target.value })} />
              <span className="dica" style={{ whiteSpace: 'nowrap' }}>Valor: R$ {valorServicoManual.toFixed(2)}</span>
              <select required value={formManual.status} onChange={(e) => setFormManual({ ...formManual, status: e.target.value })}>
                {STATUS_ABASTECIMENTO_OPCOES.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </select>
              <button type="submit" disabled={enviandoManual}>{enviandoManual ? 'Registrando…' : '+ Registrar abastecimento'}</button>
            </form>
          </div>

          {/* Assim que um pedido é marcado "Pagamento efetuado" (ou "Cancelar"),
              ele some desta lista — não precisa mais de ação da equipe
              (pagamento efetuado continua contando normalmente pra Arrecadação
              detalhada; cancelado não, nenhum dos dois aparece mais aqui). Os
              dois continuam no Histórico de Solicitações do cliente. "Entregue"
              é um valor legado (pedidos de antes desta mudança) e some do mesmo
              jeito, pelo mesmo motivo — ver abastecimentoConcluido em
              lib/statusAbastecimento.js. */}
          {(() => {
            const pedidosVisiveis = pedidos.filter((p) => !abastecimentoConcluido(p.status))
            return (
              <table className="tabela">
                <thead><tr><th>Cliente</th><th>Embarcação</th><th>Data/Horário</th><th>Combustível</th><th>Qtd (L)</th><th>Valor</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {pedidosVisiveis.length === 0 && <tr><td colSpan={8}>Nenhum pedido de abastecimento no momento.</td></tr>}
                  {pedidosVisiveis.map((p) => (
                    <tr key={p.id}>
                      <td>{p.clientes?.nome}</td>
                      <td>{p.embarcacoes?.nome || '-'}</td>
                      <td>{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                      {/* "Completar tanque" (ver lib/statusAbastecimento.js), litros
                          ainda não informados: sem quantidade/valor fechado —
                          mostra "—"/"A combinar" em vez de "0.00"/"R$ 0.00"
                          (placeholders só pras colunas NOT NULL do banco, ver
                          enviarAbastecimento em TelaClienteDashboard.jsx), com o
                          combustível marcado pra ficar claro que é esse tipo de
                          pedido, e o formulário de litros no lugar da quantidade
                          (ver FormLitrosCompletarTanque acima). Assim que os
                          litros são registrados, aguardandoLitrosCompletarTanque
                          passa a devolver false e a linha vira um pedido normal
                          em tudo — mesma integração completa de dados do fluxo
                          geral de abastecimento. */}
                      <td>{p.combustiveis?.nome}{aguardandoLitrosCompletarTanque(p) ? ' · Completar tanque' : ''}</td>
                      <td>{aguardandoLitrosCompletarTanque(p) ? <FormLitrosCompletarTanque pedido={p} onRegistrado={carregar} /> : Number(p.quantidade_litros).toFixed(2)}</td>
                      <td>{aguardandoLitrosCompletarTanque(p) ? 'A combinar' : `R$ ${Number(p.valor_total).toFixed(2)}`}</td>
                      <td><span className={`badge status-${classeStatusAbastecimento(p.status)}`}>{STATUS_LABEL[p.status] || p.status}</span></td>
                      <td>
                        {/* Indicador de "Informe de Pagamento" (ver
                            informarPagamentoAbastecimento em lib/db.js e o
                            seletor de ações no Diário de Bordo do cliente,
                            em TelaClienteDashboard.jsx): vermelho enquanto o
                            cliente não avisa que pagou, verde assim que
                            avisa. Só um aviso visual — não confirma o
                            pagamento sozinho, quem confirma continua sendo
                            a equipe pela opção "Pagamento efetuado" no
                            seletor ao lado. */}
                        <span
                          className={`indicador-informe-pagamento ${p.informado_pagamento_em ? 'informado' : 'pendente'}`}
                          title={p.informado_pagamento_em
                            ? `Cliente informou pagamento em ${new Date(p.informado_pagamento_em).toLocaleString('pt-BR')}`
                            : 'Cliente ainda não informou pagamento'}
                        />
                        {/* Só estas 4 opções — "Pagamento efetuado" conclui e some
                            da lista (ver pedidosVisiveis acima); "Cancelar" e
                            "Indisponível" avisam o cliente pelo Diário de Bordo dele
                            (ver statusAbastecimentoDiario em TelaClienteDashboard.jsx).
                            Este é o único lugar do sistema onde o status muda —
                            a seção "Combustível" do Painel de Controle (ver
                            TelaVagas.jsx) só exibe o mesmo valor, sem controle
                            nenhum de alteração ali. Fonte única do rótulo/opções
                            em lib/statusAbastecimento.js, pra nunca ficarem
                            dessincronizadas.

                            O seletor sempre começa em "—" (não reflete o status
                            atual — esse já está no badge da coluna Status ao
                            lado): é só um menu de ação, pra deixar claro que o
                            status não muda sozinho, só quando o administrador
                            escolhe explicitamente uma das 4 opções abaixo. Volta
                            pro "—" na hora (e.target.value = '') depois de cada
                            escolha, mesmo padrão do seletor de ação da tabela
                            Navegando (ver select-status-fila em TelaVagas.jsx). */}
                        {p.status !== 'cancelado' && (
                          <select
                            value=""
                            onChange={(e) => {
                              const valor = e.target.value
                              e.target.value = ''
                              if (!valor) return
                              atualizarStatusAbastecimento(p.id, valor).then(carregar).catch((err) => alert('Não foi possível atualizar o pedido: ' + err.message))
                            }}
                          >
                            <option value="">—</option>
                            {STATUS_ABASTECIMENTO_OPCOES.map((o) => (
                              <option key={o.valor} value={o.valor}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </>
      )}
    </div>
  )
}
