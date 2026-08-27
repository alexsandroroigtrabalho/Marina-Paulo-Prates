import { useEffect, useState } from 'react'
import { exportarClientesCsv, exportarHistoricoManobrasCsv, exportarAbastecimentoCsv, exportarAbastecimentoPdf } from '../lib/exportarPlanilha'
import { buscarMarina, atualizarConfigMarina, listarCombustiveis, salvarCombustivel } from '../lib/db'
import { lerConfigRampa, RAMPA_PADRAO, MENSAGENS_INDISPONIBILIDADE } from '../lib/agendaRampa'
import { geocodePorCidade } from '../lib/clima'
import { statusEfetivoAbastecimento, labelStatusAbastecimento, classeStatusAbastecimento, textoQuantidade } from '../lib/statusAbastecimento'

// Todas as configurações do sistema, centralizadas aqui dentro do Painel de
// Controle (antes espalhadas em: engrenagem do Painel de Controle — aviso
// sonoro e apitos — e um bloco fixo na aba Despachos —
// relatório automático de documentos). Organizadas por categoria, igual
// pedido pela administração. Toda a alteração é gravada em
// marinas.config_json — inclusive o aviso sonoro (chave `avisoSonoroAtivado`,
// ligado por padrão) — e já é a mesma fonte que as outras telas leem; não
// existe uma cópia separada do valor em nenhum outro lugar, então não tem
// como dessincronizar.
//
// Só administradores podem alterar (perfil.role === 'admin') — funcionário/
// operador conseguem ABRIR e VER esta tela (útil pra conferir o que está
// configurado), mas os campos ficam desabilitados e aparece um aviso. Isso
// espelha a restrição já aplicada no banco (policy "admin_atualiza_propria_marina",
// FOR UPDATE, só libera pra role = 'admin') — mesmo que alguém tentasse
// contornar a tela, o banco recusaria a escrita.
// A categoria "Financeiro" saiu inteira: valor da mensalidade e exportação
// de arrecadação eram configuração de cobrança, que passou para o RV Finance
// (SaaS separado). Nada foi apagado do banco.
//
// "Combustível" é outra coisa e por isso ficou: são os tipos que o cliente
// pode escolher ao pedir abastecimento — nome e ativo/inativo, sem preço nem
// estoque, que seriam financeiro — e agora também o Histórico de
// Abastecimento (planilha filtrável do que já foi pedido, com exportação
// PDF/Excel), incorporado direto nesta aba em vez de viver solto.
//
// As abas "Despacho", "Manutenção" e "Acessos" saíram do menu (removidas a
// pedido — ver histórico de conversa): a exportação de despacho/manutenção
// e o texto fixo de Acessos não existem mais aqui. O relatório automático
// de documentos vencidos (que morava dentro de "Despacho") continua
// rodando sozinho todo dia via Edge Function/Cron no Supabase — só a tela
// pra trocar o e-mail ou disparar manualmente é que saiu; ver
// enviarRelatorioDocumentosAgora em lib/db.js se precisar repor esse
// controle em outro lugar. "Agenda" virou "Rampa" no rótulo — o `chave`
// interno e toda a lógica (formRampa, salvarConfigRampa, manutenções da
// rampa) continuam com o nome de sempre, só o texto da aba mudou.
const CATEGORIAS = [
  { chave: 'notificacoes', label: 'Notificações' },
  { chave: 'combustivel', label: 'Combustível' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'agenda', label: 'Rampa' },
  { chave: 'historico', label: 'Histórico' },
]

const LOCALIZACAO_CLIMA_VAZIA = { cidade: '', latitude: null, longitude: null, local: '' }

const FILTRO_ABASTECIMENTO_VAZIO = { dataInicio: '', dataFim: '', cliente: '', embarcacao: '', combustivelId: '' }

export default function ConfiguracoesPainel({
  aberto, onFechar, ehAdmin, marinaId,
  // Notificações — aviso sonoro + apitos
  sonsAtivados, onAlternarSons, salvandoAvisoSonoro, formApitos, onMudarApitos, onSalvarApitos, salvandoApitos,
  // Histórico de manobras — antes num modal solto no Painel de Controle,
  // agora só aqui (categoria "Histórico"), junto da exportação da mesma
  // planilha.
  historicoManobras = [], tipoAgendamentoLabel = {},
  // Histórico de Abastecimento (aba Combustível) — a mesma lista completa
  // que TelaVagas.jsx já busca com listarPedidosAbastecimento (não o recorte
  // ativo de 24h da planilha "Solicitações de combustível" do Painel de
  // Controle); os filtros de período/cliente/embarcação/combustível abaixo
  // são só de tela, aplicados em cima desta lista.
  pedidosAbastecimento = [],
}) {
  const [categoria, setCategoria] = useState('notificacoes')
  const [exportando, setExportando] = useState('')
  const [mensagemExportacao, setMensagemExportacao] = useState('')
  const [filtroAbastecimento, setFiltroAbastecimento] = useState(FILTRO_ABASTECIMENTO_VAZIO)

  // Localidade usada pra buscar a previsão do tempo do Painel de Controle
  // (ver lib/clima.js) — cada marina configura a própria cidade aqui em vez
  // de ficar fixa em Torres/RS pra todo mundo.
  const [formLocalizacao, setFormLocalizacao] = useState(LOCALIZACAO_CLIMA_VAZIA)
  const [buscandoCidade, setBuscandoCidade] = useState(false)
  const [salvandoLocalizacao, setSalvandoLocalizacao] = useState(false)
  const [mensagemLocalizacao, setMensagemLocalizacao] = useState('')

  // Agenda da rampa — carregada e salva aqui mesmo (não vem por prop, como
  // as outras seções, porque essa parte tem estado próprio grande demais
  // pra valer a pena empurrar tudo pra cima em TelaVagas.jsx): horário de
  // funcionamento, intervalo fixo entre solicitações e mensagens ficam em
  // `formRampa`; a lista de manutenções fica em `manutencoes`. Tudo gravado
  // em marinas.config_json (ver lib/agendaRampa.js) — mesma fonte que o
  // painel do cliente lê pra montar os horários disponíveis, então uma
  // alteração aqui já vale na hora pra ele (ver assinatura Realtime na
  // tela do cliente).
  const [formRampa, setFormRampa] = useState(RAMPA_PADRAO)
  const [salvandoRampa, setSalvandoRampa] = useState(false)
  const [mensagemRampa, setMensagemRampa] = useState('')
  const [manutencoes, setManutencoes] = useState([])

  // Combustível — mesma escolha da Agenda da rampa acima: carrega e salva
  // aqui dentro, sem passar por TelaVagas.jsx. São os tipos que aparecem pro
  // cliente escolher no pedido de abastecimento. Só nome e ativo/inativo:
  // preço e estoque saíram com o financeiro (as colunas continuam na tabela,
  // com os valores antigos, e preco_litro passou a aceitar NULL — ver
  // migration_abastecimento_sem_financeiro.sql).
  //
  // Desligar um tipo não apaga nada: ele some da lista do cliente e os
  // pedidos antigos continuam mostrando o nome normalmente.
  const [combustiveis, setCombustiveis] = useState([])
  const [novoCombustivel, setNovoCombustivel] = useState('')
  const [salvandoCombustivel, setSalvandoCombustivel] = useState(false)
  const [formNovaManutencao, setFormNovaManutencao] = useState({ inicio: '', fim: '', motivo: '' })
  const [salvandoManutencao, setSalvandoManutencao] = useState(false)

  async function carregarConfigRampa() {
    if (!marinaId) return
    const marina = await buscarMarina(marinaId)
    const cfg = lerConfigRampa(marina)
    setFormRampa(cfg)
    setManutencoes(cfg.manutencoes)

    const configJson = marina?.config_json || {}
    setFormLocalizacao({
      cidade: configJson.climaLocal || '',
      latitude: configJson.climaLatitude ?? null,
      longitude: configJson.climaLongitude ?? null,
      local: configJson.climaLocal || '',
    })
  }
  useEffect(() => { if (aberto) carregarConfigRampa() }, [aberto, marinaId])

  async function carregarCombustiveis() {
    if (!marinaId) return
    try {
      setCombustiveis(await listarCombustiveis(marinaId))
    } catch (err) {
      alert('Não foi possível carregar os combustíveis: ' + err.message)
    }
  }
  useEffect(() => { if (aberto) carregarCombustiveis() }, [aberto, marinaId])

  async function adicionarCombustivel(e) {
    e.preventDefault()
    const nome = novoCombustivel.trim()
    if (!nome || salvandoCombustivel) return
    setSalvandoCombustivel(true)
    try {
      await salvarCombustivel({ marina_id: marinaId, nome, ativo: true })
      setNovoCombustivel('')
      await carregarCombustiveis()
    } catch (err) {
      alert('Não foi possível salvar o combustível: ' + err.message)
    } finally {
      setSalvandoCombustivel(false)
    }
  }

  // Só o campo `ativo` muda por aqui — o resto da linha vai junto no upsert
  // pra não zerar o que já estava gravado (inclusive o preço antigo, que
  // esta tela não mostra mais mas continua no banco).
  async function alternarCombustivel(c) {
    try {
      await salvarCombustivel({ ...c, ativo: !c.ativo })
      await carregarCombustiveis()
    } catch (err) {
      alert('Não foi possível alterar o combustível: ' + err.message)
    }
  }

  // Busca a cidade digitada na API de geocoding (ver lib/clima.js) e só
  // preenche latitude/longitude/local no formulário — ainda não salva
  // nada, pra o administrador poder conferir o nome encontrado antes de
  // confirmar (ex: "Torres, RS" vs. outra cidade de mesmo nome).
  async function buscarCoordenadas() {
    if (!formLocalizacao.cidade.trim()) return
    setBuscandoCidade(true)
    setMensagemLocalizacao('')
    try {
      const encontrado = await geocodePorCidade(formLocalizacao.cidade)
      setFormLocalizacao((f) => ({ ...f, latitude: encontrado.latitude, longitude: encontrado.longitude, local: encontrado.local }))
      setMensagemLocalizacao(`Cidade encontrada: ${encontrado.local}. Confira e clique em "Salvar localização".`)
    } catch (err) {
      setMensagemLocalizacao(err.message)
    } finally {
      setBuscandoCidade(false)
    }
  }

  async function salvarLocalizacao(e) {
    e.preventDefault()
    if (formLocalizacao.latitude == null || formLocalizacao.longitude == null) {
      setMensagemLocalizacao('Busque a cidade antes de salvar, pra confirmar as coordenadas certas.')
      return
    }
    setSalvandoLocalizacao(true)
    try {
      await atualizarConfigMarina(marinaId, {
        climaLatitude: formLocalizacao.latitude,
        climaLongitude: formLocalizacao.longitude,
        climaLocal: formLocalizacao.local,
      })
      setMensagemLocalizacao(`Localização salva: ${formLocalizacao.local}. A previsão do Painel de Controle já passa a usar essa cidade.`)
    } catch (err) {
      setMensagemLocalizacao('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvandoLocalizacao(false)
    }
  }

  async function salvarConfigRampa(e) {
    e.preventDefault()
    setSalvandoRampa(true)
    setMensagemRampa('')
    try {
      await atualizarConfigMarina(marinaId, {
        rampaAbertura: formRampa.abertura,
        rampaFechamento: formRampa.fechamento,
        rampaIntervaloMinutos: Math.max(5, Number(formRampa.intervaloMinutos) || 15),
        rampaMensagemIndisponibilidade: formRampa.mensagemIndisponibilidade || RAMPA_PADRAO.mensagemIndisponibilidade,
      })
      setMensagemRampa('Configurações da Agenda da rampa salvas com sucesso.')
    } catch (err) {
      alert('Não foi possível salvar a Agenda da rampa: ' + err.message)
    } finally {
      setSalvandoRampa(false)
    }
  }

  async function adicionarManutencao(e) {
    e.preventDefault()
    if (!formNovaManutencao.inicio || !formNovaManutencao.fim) return
    setSalvandoManutencao(true)
    try {
      const nova = { id: `${Date.now()}`, inicio: formNovaManutencao.inicio, fim: formNovaManutencao.fim, motivo: formNovaManutencao.motivo || '' }
      const novaLista = [...manutencoes, nova].sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
      await atualizarConfigMarina(marinaId, { rampaManutencoes: novaLista })
      setManutencoes(novaLista)
      setFormNovaManutencao({ inicio: '', fim: '', motivo: '' })
    } catch (err) {
      alert('Não foi possível adicionar o período de manutenção: ' + err.message)
    } finally {
      setSalvandoManutencao(false)
    }
  }

  async function removerManutencao(id) {
    setSalvandoManutencao(true)
    try {
      const novaLista = manutencoes.filter((m) => m.id !== id)
      await atualizarConfigMarina(marinaId, { rampaManutencoes: novaLista })
      setManutencoes(novaLista)
    } catch (err) {
      alert('Não foi possível remover o período de manutenção: ' + err.message)
    } finally {
      setSalvandoManutencao(false)
    }
  }

  function mudarCategoria(c) {
    setCategoria(c)
    setMensagemExportacao('')
  }

  async function exportar(fn, chave, rotulo) {
    setExportando(chave)
    setMensagemExportacao('')
    try {
      await fn(marinaId)
      setMensagemExportacao(`Planilha de ${rotulo} baixada com sucesso.`)
    } catch (err) {
      alert('Não foi possível exportar a planilha: ' + err.message)
    } finally {
      setExportando('')
    }
  }

  // Histórico de Abastecimento — mesmos filtros de tela pedidos: período
  // (por created_at, o "pedido em" da planilha), cliente e embarcação por
  // busca de texto, combustível por seleção exata. Mais recente primeiro,
  // igual à planilha ativa de TelaVagas.jsx.
  const historicoAbastecimentoFiltrado = pedidosAbastecimento
    .filter((p) => {
      if (filtroAbastecimento.dataInicio && new Date(p.created_at) < new Date(filtroAbastecimento.dataInicio)) return false
      if (filtroAbastecimento.dataFim && new Date(p.created_at) > new Date(`${filtroAbastecimento.dataFim}T23:59:59`)) return false
      if (filtroAbastecimento.cliente && !(p.clientes?.nome || '').toLowerCase().includes(filtroAbastecimento.cliente.trim().toLowerCase())) return false
      if (filtroAbastecimento.embarcacao && !(p.embarcacoes?.nome || '').toLowerCase().includes(filtroAbastecimento.embarcacao.trim().toLowerCase())) return false
      if (filtroAbastecimento.combustivelId && p.combustivel_id !== filtroAbastecimento.combustivelId) return false
      return true
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  // Linhas já formatadas pra exibição na tabela e para as duas exportações
  // (CSV/Excel e PDF) — mesmo texto que aparece na tela, ver
  // exportarAbastecimentoCsv/exportarAbastecimentoPdf em lib/exportarPlanilha.js.
  const itensAbastecimentoExportacao = historicoAbastecimentoFiltrado.map((p) => ({
    cliente: p.clientes?.nome || '',
    embarcacao: p.embarcacoes?.nome || '',
    combustivel: p.combustiveis?.nome || '',
    quantidade: textoQuantidade(p),
    statusLabel: labelStatusAbastecimento(statusEfetivoAbastecimento(p)),
    quando: new Date(p.created_at).toLocaleString('pt-BR'),
  }))

  async function exportarAbastecimento(formato) {
    const chave = `abastecimento_${formato}`
    setExportando(chave)
    setMensagemExportacao('')
    try {
      if (formato === 'pdf') exportarAbastecimentoPdf(itensAbastecimentoExportacao)
      else exportarAbastecimentoCsv(itensAbastecimentoExportacao)
      setMensagemExportacao(`Histórico de abastecimento (${itensAbastecimentoExportacao.length} pedido(s)) exportado em ${formato === 'pdf' ? 'PDF' : 'Excel'}.`)
    } catch (err) {
      alert('Não foi possível exportar o histórico de abastecimento: ' + err.message)
    } finally {
      setExportando('')
    }
  }

  if (!aberto) return null

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Configurações do sistema</h3>

        {!ehAdmin && (
          <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>
            Somente administradores podem alterar estas configurações. Você pode conferir os valores atuais, mas os campos abaixo estão desabilitados para o seu perfil.
          </p>
        )}

        <div className="abas" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {CATEGORIAS.map((c) => (
            <button key={c.chave} type="button" className={categoria === c.chave ? 'ativo' : ''} onClick={() => mudarCategoria(c.chave)}>
              {c.label}
            </button>
          ))}
        </div>

        {categoria === 'combustivel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Tipos de combustível</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                O que o cliente pode escolher ao pedir abastecimento pelo painel dele. Só nome e
                ligar/desligar — preço, valor e cobrança não existem no RV Marine (são do RV Finance).
                Desligar um tipo tira ele da lista do cliente sem apagar nada: os pedidos antigos
                continuam mostrando o nome normalmente.
              </p>

              <form className="form-inline" onSubmit={adicionarCombustivel} style={{ marginBottom: 12 }}>
                <input
                  placeholder="Ex: Gasolina comum" style={{ minWidth: 220 }} disabled={!ehAdmin}
                  value={novoCombustivel} onChange={(e) => setNovoCombustivel(e.target.value)}
                />
                <button type="submit" disabled={!ehAdmin || salvandoCombustivel || !novoCombustivel.trim()}>
                  {salvandoCombustivel ? 'Salvando…' : 'Adicionar'}
                </button>
              </form>

              <div className="lista-cards">
                {combustiveis.length === 0 && <p className="dica">Nenhum tipo cadastrado ainda. Sem pelo menos um, o cliente não consegue pedir abastecimento.</p>}
                {combustiveis.map((c) => (
                  <div key={c.id} className="cliente-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div className="linha"><b>{c.nome}</b></div>
                    <label className="opcao-checkbox">
                      <input type="checkbox" checked={!!c.ativo} disabled={!ehAdmin} onChange={() => alternarCombustivel(c)} />
                      {c.ativo ? 'Disponível' : 'Indisponível'}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <strong>Histórico de Abastecimento</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Todos os pedidos de combustível já feitos pelos clientes, com filtro de período, cliente,
                embarcação e tipo de combustível. Exporte em Excel ou PDF o recorte que estiver filtrado na tela.
              </p>

              <div className="form-inline" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 2 }}>
                  De
                  <input type="date" value={filtroAbastecimento.dataInicio}
                    onChange={(e) => setFiltroAbastecimento({ ...filtroAbastecimento, dataInicio: e.target.value })} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', fontSize: 12, gap: 2 }}>
                  Até
                  <input type="date" value={filtroAbastecimento.dataFim}
                    onChange={(e) => setFiltroAbastecimento({ ...filtroAbastecimento, dataFim: e.target.value })} />
                </label>
                <input placeholder="Cliente" style={{ minWidth: 160 }} value={filtroAbastecimento.cliente}
                  onChange={(e) => setFiltroAbastecimento({ ...filtroAbastecimento, cliente: e.target.value })} />
                <input placeholder="Embarcação" style={{ minWidth: 160 }} value={filtroAbastecimento.embarcacao}
                  onChange={(e) => setFiltroAbastecimento({ ...filtroAbastecimento, embarcacao: e.target.value })} />
                <select value={filtroAbastecimento.combustivelId}
                  onChange={(e) => setFiltroAbastecimento({ ...filtroAbastecimento, combustivelId: e.target.value })}>
                  <option value="">Todos os combustíveis</option>
                  {combustiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <button type="button" onClick={() => setFiltroAbastecimento(FILTRO_ABASTECIMENTO_VAZIO)}>Limpar filtros</button>
              </div>

              <table className="tabela">
                <thead>
                  <tr>
                    <th className="col-responsavel">Cliente</th>
                    <th>Embarcação</th>
                    <th>Combustível</th>
                    <th>Quantidade</th>
                    <th>Status</th>
                    <th>Pedido em</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoAbastecimentoFiltrado.length === 0 && (
                    <tr><td colSpan={6}>Nenhum pedido de combustível encontrado para os filtros selecionados.</td></tr>
                  )}
                  {historicoAbastecimentoFiltrado.map((p) => (
                    <tr key={p.id}>
                      <td className="col-responsavel"><b>{p.clientes?.nome}</b></td>
                      <td>{p.embarcacoes?.nome || '—'}</td>
                      <td>{p.combustiveis?.nome || '—'}</td>
                      <td>{textoQuantidade(p)}</td>
                      <td><span className={`badge status-${classeStatusAbastecimento(statusEfetivoAbastecimento(p))}`}>{labelStatusAbastecimento(statusEfetivoAbastecimento(p))}</span></td>
                      <td>{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => exportarAbastecimento('csv')} disabled={exportando === 'abastecimento_csv' || itensAbastecimentoExportacao.length === 0}>
                  {exportando === 'abastecimento_csv' ? 'Exportando…' : 'Exportar Excel'}
                </button>
                <button type="button" onClick={() => exportarAbastecimento('pdf')} disabled={exportando === 'abastecimento_pdf' || itensAbastecimentoExportacao.length === 0}>
                  {exportando === 'abastecimento_pdf' ? 'Exportando…' : 'Exportar PDF'}
                </button>
              </div>
              {mensagemExportacao && exportando === '' && (
                <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
              )}
            </div>
          </div>
        )}

        {categoria === 'notificacoes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Aviso sonoro do Painel de Controle</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Apito ao chegar uma nova notificação de descida/subida na Fila de Rampa, ou um S.O.S.. Vem{' '}
                <b>ligado por padrão</b> para todos os usuários, e toca em qualquer tela do sistema — não precisa
                estar com o Painel de Controle aberto. Somente o administrador pode desativar ou reativar — a
                alteração é salva e aplicada imediatamente em todo o sistema, para todos os perfis conectados.
              </p>
              <button type="button" onClick={onAlternarSons} disabled={!ehAdmin || salvandoAvisoSonoro}>
                {salvandoAvisoSonoro ? 'Salvando…' : sonsAtivados ? '🔕 Desabilitar aviso sonoro' : '🔔 Habilitar aviso sonoro'}
              </button>
            </div>

            <div>
              <strong>Apitos por manobra</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Quantas vezes o sinal sonoro toca ao confirmar cada manobra na Fila de Rampa. Vale para toda a equipe.
              </p>
              <form className="form-vertical" onSubmit={onSalvarApitos} style={{ maxWidth: 320 }}>
                <label>
                  Apitos na saída (descida)
                  <input required type="number" min={1} step={1} value={formApitos.descida} disabled={!ehAdmin}
                    onChange={(e) => onMudarApitos({ ...formApitos, descida: e.target.value })} />
                </label>
                <label>
                  Apitos na chegada (retorno)
                  <input required type="number" min={1} step={1} value={formApitos.retorno} disabled={!ehAdmin}
                    onChange={(e) => onMudarApitos({ ...formApitos, retorno: e.target.value })} />
                </label>
                <button type="submit" disabled={!ehAdmin || salvandoApitos} style={{ alignSelf: 'flex-start' }}>
                  {salvandoApitos ? 'Salvando…' : 'Salvar'}
                </button>
              </form>
            </div>

          </div>
        )}

        {categoria === 'clientes' && (
          <div>
            <strong>Exportar planilha de clientes</strong>
            <p className="dica" style={{ margin: '4px 0 10px' }}>
              Baixa uma planilha com todos os dados de clientes cadastrados, completos e atualizados.
            </p>
            <button type="button" onClick={() => exportar(exportarClientesCsv, 'clientes', 'clientes')} disabled={exportando === 'clientes'}>
              {exportando === 'clientes' ? 'Exportando…' : 'Exportar planilha de clientes'}
            </button>
            {mensagemExportacao && exportando === '' && (
              <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
            )}
          </div>
        )}
        {categoria === 'agenda' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Agenda da rampa</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Horário de funcionamento, intervalo fixo entre solicitações e mensagens de indisponibilidade — usados
                pra montar os horários que o cliente pode escolher ao pedir uma descida ou subida. Sincronizado com a
                Agenda do cliente na hora: um horário fora dessas regras não aparece pra ele selecionar.
              </p>
              <form className="form-vertical" onSubmit={salvarConfigRampa} style={{ maxWidth: 420, marginBottom: 10 }}>
                <label>
                  Abertura da rampa
                  <input required type="time" value={formRampa.abertura} disabled={!ehAdmin}
                    onChange={(e) => setFormRampa({ ...formRampa, abertura: e.target.value })} />
                </label>
                <label>
                  Fechamento da rampa
                  <input required type="time" value={formRampa.fechamento} disabled={!ehAdmin}
                    onChange={(e) => setFormRampa({ ...formRampa, fechamento: e.target.value })} />
                </label>
                <label>
                  Intervalo entre solicitações (minutos)
                  <input required type="number" min={5} step={5} value={formRampa.intervaloMinutos} disabled={!ehAdmin}
                    onChange={(e) => setFormRampa({ ...formRampa, intervaloMinutos: e.target.value })} />
                </label>
                <label>
                  Mensagem de indisponibilidade
                  <select required value={formRampa.mensagemIndisponibilidade} disabled={!ehAdmin}
                    onChange={(e) => setFormRampa({ ...formRampa, mensagemIndisponibilidade: e.target.value })}>
                    {MENSAGENS_INDISPONIBILIDADE.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <button type="submit" disabled={!ehAdmin || salvandoRampa} style={{ alignSelf: 'flex-start' }}>
                  {salvandoRampa ? 'Salvando…' : 'Salvar'}
                </button>
              </form>
              {mensagemRampa && <p className="dica" style={{ margin: '0 0 10px', fontWeight: 600 }}>{mensagemRampa}</p>}

              <strong style={{ display: 'block', marginBottom: 4 }}>Períodos de manutenção da rampa</strong>
              <p className="dica" style={{ margin: '0 0 10px' }}>
                Enquanto durar, os horários dentro do período ficam indisponíveis pro cliente escolher.
              </p>
              <form className="form-inline" onSubmit={adicionarManutencao} style={{ marginBottom: 10 }}>
                <input required type="datetime-local" title="Início" value={formNovaManutencao.inicio} disabled={!ehAdmin}
                  onChange={(e) => setFormNovaManutencao({ ...formNovaManutencao, inicio: e.target.value })} />
                <input required type="datetime-local" title="Fim" value={formNovaManutencao.fim} disabled={!ehAdmin}
                  onChange={(e) => setFormNovaManutencao({ ...formNovaManutencao, fim: e.target.value })} />
                <input placeholder="Motivo (opcional)" value={formNovaManutencao.motivo} disabled={!ehAdmin}
                  onChange={(e) => setFormNovaManutencao({ ...formNovaManutencao, motivo: e.target.value })} />
                <button type="submit" disabled={!ehAdmin || salvandoManutencao}>+ Adicionar período</button>
              </form>
              <table className="tabela">
                <thead><tr><th>Início</th><th>Fim</th><th>Motivo</th><th></th></tr></thead>
                <tbody>
                  {manutencoes.length === 0 && <tr><td colSpan={4}>Nenhum período de manutenção cadastrado.</td></tr>}
                  {manutencoes.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.inicio).toLocaleString('pt-BR')}</td>
                      <td>{new Date(m.fim).toLocaleString('pt-BR')}</td>
                      <td>{m.motivo || '-'}</td>
                      <td>
                        <button type="button" onClick={() => removerManutencao(m.id)} disabled={!ehAdmin || salvandoManutencao}>Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <strong>Localização (previsão do tempo)</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Cidade usada pra mostrar a previsão do tempo no cabeçalho do Painel de Controle. Busque a cidade da
                marina e confirme antes de salvar — sem isso, o painel mostra a previsão de Torres/RS (padrão).
              </p>
              <div className="form-inline" style={{ marginBottom: 8 }}>
                <input
                  placeholder="Cidade, UF (ex: Torres, RS)" style={{ minWidth: 220 }} disabled={!ehAdmin}
                  value={formLocalizacao.cidade}
                  onChange={(e) => setFormLocalizacao({ ...formLocalizacao, cidade: e.target.value })}
                />
                <button type="button" onClick={buscarCoordenadas} disabled={!ehAdmin || buscandoCidade || !formLocalizacao.cidade.trim()}>
                  {buscandoCidade ? 'Buscando…' : 'Buscar cidade'}
                </button>
                <button type="button" onClick={salvarLocalizacao} disabled={!ehAdmin || salvandoLocalizacao || formLocalizacao.latitude == null}>
                  {salvandoLocalizacao ? 'Salvando…' : 'Salvar localização'}
                </button>
              </div>
              {formLocalizacao.local && (
                <p className="dica" style={{ margin: 0 }}>Localidade encontrada: <b>{formLocalizacao.local}</b></p>
              )}
              {mensagemLocalizacao && <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemLocalizacao}</p>}
            </div>
          </div>
        )}

        {categoria === 'historico' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Histórico de manobras</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Toda descida e subida já confirmada na Fila de Rampa, mais recente primeiro.
              </p>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th className="col-responsavel">Responsável</th>
                    <th>Horário</th>
                    <th>Confirmado em</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoManobras.length === 0 && <tr><td colSpan={4}>Nenhuma manobra confirmada ainda.</td></tr>}
                  {historicoManobras.map((a) => (
                    <tr key={a.id}>
                      <td className={`pedido ${a.tipo === 'retirada' ? 'tipo-descida' : 'tipo-subida'}`}>{tipoAgendamentoLabel[a.tipo] || a.tipo}</td>
                      <td className="col-responsavel"><b>{a.clientes?.nome}</b>{a.embarcacoes?.nome ? ` · ${a.embarcacoes.nome}` : ''}</td>
                      <td>{new Date(a.data_hora).toLocaleString('pt-BR')}</td>
                      {/* Horário real da confirmação (concluido_em) — pode
                          diferir do "Horário" ao lado, que é só o que o
                          cliente informou ao pedir a descida/subida. */}
                      <td>{a.concluido_em ? new Date(a.concluido_em).toLocaleString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <strong>Exportar histórico de manobras</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Baixa uma planilha com o histórico de manobras (descidas e subidas já confirmadas) disponível no
                momento, com cliente, embarcação ou jet, tipo de manobra, data e horário.
              </p>
              <button type="button" onClick={() => exportar(exportarHistoricoManobrasCsv, 'historico_manobras', 'histórico de manobras')} disabled={exportando === 'historico_manobras'}>
                {exportando === 'historico_manobras' ? 'Exportando…' : 'Exportar histórico de manobras'}
              </button>
              {mensagemExportacao && exportando === '' && (
                <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
              )}
            </div>
          </div>
        )}
        <div className="acoes-modal" style={{ marginTop: 20 }}>
          <button type="button" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
