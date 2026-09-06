import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  listarMatriculas, aprovarMatricula,
  listarAgendamentosEscola, criarAgendamento, TIPOS_AGENDAMENTO, labelTipoAgendamento,
  arquivarMatricula,
  labelHabilitacao,
} from '../lib/enautica'
import { buscarMarina, buscarClientesPorIds } from '../lib/db'
import { abrirListaPratica, baixarZipDocumentosAlunos } from '../lib/enauticaDocumentos'

// "Painel de Controle" do e-Náutica (1ª das 2 abas da escola, a outra é
// Agendamentos — ver TelaAgendamentosENautica.jsx) — substitui as antigas 3
// abas (Matrículas / Agenda / Certificados, hoje em
// TelaMatriculasENautica.jsx, TelaAgendaEscolaENautica.jsx e
// TelaCertificadosEscolaENautica.jsx — os 3 arquivos continuam no projeto,
// só não são mais importados em App.jsx, caso precise voltar atrás).
// MUDANÇA GRANDE, escolhida explicitamente pelo Alex (não é invenção livre
// nem port do rsnautica, que nunca teve nada parecido): em vez de 3 listas
// separadas, cada aluno aparece 1 vez numa tabela só, com uma trilha
// "Matrícula → Avaliação Teórica → Aula Prática" mostrando em que ponto da
// jornada ele está.
//
// Revisão de 05/09/2026 (2ª rodada, feedback do Alex sobre a 1ª versão desta
// tela): a linha da tabela NÃO abre mais painel nenhum ao clicar — a seleção
// (pra usar a barra de ações em massa) é feita só pela caixa de marcação,
// como em qualquer outra tela da RV Invictus. O que era informação extra do
// painel (telefone vira coluna própria; contato/e-mail, motivo de recusa e
// próximo compromisso viram `title` — dica ao passar o mouse — nos
// elementos da linha, pra não perder a informação sem precisar de um
// painel só pra isso). O botão manual "marcar reagendamento como atendido"
// saiu: o reagendamento já se resolve sozinho quando a escola marca a nova
// data (ver criarAgendamento em lib/enautica.js), e é raro precisar
// resolver por fora disso.
//
// Revisão de 05/09/2026 (3ª rodada): a coluna "Ações" própria de cada linha
// saiu de vez (pedido do Alex) — TODA ação (aprovar, agendar, gerar
// documentos, excluir/restaurar) passa a ser feita só pela barra de seleção
// em massa, mesmo pra 1 aluno só: marca a caixa daquele aluno e usa o botão
// da barra. Isso também elimina de vez a ambiguidade de antes (um botão
// "Aprovar" na linha competindo visualmente com o da barra) — só existe UM
// jeito de aprovar matrícula agora. A barra de seleção passou a existir nas
// 2 abas (Todos: aprovar/agendar/documentos/lista de presença/excluir;
// Histórico: restaurar/documentos), não só em Todos.
//
// Revisão de 05/09/2026, também a pedido explícito do Alex — a escola não
// emite mais certificado nenhum pelo sistema (fica de fora de novo: nem
// coluna, nem botão, nem atalho), e o fluxo virou:
//   - Etapa (3 marcos, cada um só vermelho/verde, sem estado intermediário):
//     Matrícula (verde só quando aprovada), Avaliação Teórica e Aula
//     Prática (verdes quando a escola AGENDA cada uma — ver criarAgendamento
//     em lib/enautica.js). Reprovou e pediu reagendamento? Avaliação
//     Teórica volta pro vermelho sozinha (ver `trilha` abaixo) até a escola
//     marcar uma nova data.
//   - Status (era "Contato"/e-mail): frase curta do que está pendente do
//     LADO DO ALUNO — "Aluno em preparação" (nada pendente), "Solicita
//     agendamento" (aluno já se disse pronto pra prova teórica, ver
//     `pronto_teste`) ou "Solicita reagendamento" (reprovou e pediu nova
//     data). O e-mail saiu da tabela; ainda aparece no painel do aluno
//     (linha "Contato" abaixo do telefone) pra não sumir de vez.
//   - "Excluir aluno" NÃO apaga nada — arquiva (ver arquivarMatricula em
//     lib/enautica.js): some da aba Todos e aparece na aba Histórico, de
//     onde dá pra restaurar. Perguntei ao Alex antes de implementar assim
//     (a palavra "excluir" sozinha sugere apagar de vez) — confirmado que é
//     isso mesmo, pra não perder matrícula/agendamentos de ninguém.
//   - "Recusar matrícula" saiu de vez (confirmado com o Alex) — pendente só
//     tem "Aprovar matrícula" e "Excluir aluno" (pra tirar da lista uma
//     inscrição que não vai pra frente, sem um fluxo de recusa formal).
//     Os poucos registros "recusada" que já existiam de antes do sistema
//     ainda aparecem (Etapa "Matrícula" em vermelho, sem novo caminho de
//     aprovação) — só saem da lista se o administrador arquivar.
//
// Revisão de 05/09/2026 (5ª rodada, pedido do Alex): a aba "Histórico" saiu
// desta tela de vez — mudou pra dentro de Configurações do e-Náutica (ver
// ConfiguracoesENautica.jsx, categoria "Histórico"), que ganhou junto uma
// opção de exportar planilha. Sem a 2ª aba, o botão "Todos" também não fazia
// mais sentido sozinho — a tela virou uma lista só, sem abas. A barra de
// ações em massa deixou de aparecer só quando há seleção — fica sempre
// visível (cada botão desabilita sozinho quando não há seleção que faça
// sentido pra ele), e o campo de busca subiu pro canto superior direito,
// acima da barra.
const FORM_AGENDA_VAZIO = { tipo: 'teorica', data: '', hora: '', local: '' }

const corEtapa = { ok: '#3F8F5F', erro: '#A23B2E' }

export default function TelaAlunosENautica({ marinaId }) {
  const [matriculas, setMatriculas] = useState([])
  const [agendamentos, setAgendamentos] = useState([])
  const [erro, setErro] = useState(null)

  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(new Set())
  const [processandoId, setProcessandoId] = useState(null)
  const [baixandoZip, setBaixandoZip] = useState(false)
  const [gerandoListaSelecionados, setGerandoListaSelecionados] = useState(false)
  const [arquivandoLote, setArquivandoLote] = useState(false)

  // Modal "Agendar provas" (era "Marcar compromisso") — mesma lógica que já
  // existia numa tela própria, agora aberta sob demanda (a partir da barra
  // de seleção ou do painel de um único aluno) em vez de ocupar uma aba
  // inteira o tempo todo.
  const [modalAgenda, setModalAgenda] = useState(null) // { alunosIds, nomes } | null
  const [formAgenda, setFormAgenda] = useState(FORM_AGENDA_VAZIO)
  const [criandoAgenda, setCriandoAgenda] = useState(false)
  const [erroAgenda, setErroAgenda] = useState(null)
  const [agendaEnviada, setAgendaEnviada] = useState(false)
  const [gerandoLista, setGerandoLista] = useState(false)

  async function carregar() {
    if (!marinaId) return
    try {
      const [mats, ags] = await Promise.all([
        listarMatriculas(marinaId), listarAgendamentosEscola(marinaId),
      ])
      setMatriculas(mats)
      setAgendamentos(ags)
      setErro(null)
    } catch (err) {
      setErro(err.message)
    }
  }

  useEffect(() => { carregar() }, [marinaId])

  useEffect(() => {
    if (!marinaId) return
    const canal = supabase
      .channel(`enautica-alunos-${marinaId}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'matriculas', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos', filter: `marina_id=eq.${marinaId}` }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [marinaId])

  const hojeISO = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Um aluno = uma matrícula + o que já existe de agenda pra aquele
  // cliente/habilitação. Calculado ao vivo a partir dos 2 selects já
  // carregados, sem tabela nova. `temTeorica`/`temPratica`: existe ALGUM
  // agendamento daquele tipo com este aluno — não importa se já passou ou
  // não (aqui um agendamento é sempre "confirmado", não tem estado de
  // concluído — ver comentário em criarAgendamento/lib/enautica.js).
  const alunos = useMemo(() => {
    return matriculas.map((m) => {
      const meusAgendamentos = agendamentos
        .filter((ag) => (ag.alunos_ids || []).includes(m.cliente_id))
        .sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))
      const proximoCompromisso = meusAgendamentos.find((ag) => ag.data >= hojeISO) || null
      const temTeorica = meusAgendamentos.some((ag) => ag.tipo === 'teorica')
      const temPratica = meusAgendamentos.some((ag) => ag.tipo === 'pratica')
      return { matricula: m, agendamentos: meusAgendamentos, proximoCompromisso, temTeorica, temPratica }
    })
  }, [matriculas, agendamentos, hojeISO])

  // Trilha "Matrícula → Avaliação Teórica → Aula Prática" — só 2 estados
  // por etapa (vermelho/verde), a pedido do Alex, sem estado intermediário.
  // Avaliação Teórica: verde só quando existe um agendamento tipo "teorica"
  // E o aluno não tem um pedido de reagendamento em aberto — reprovou e
  // pediu reagendamento, some o verde na hora, mesmo que a prova antiga
  // ainda esteja lá (é uma prova que não vale mais). Volta ao verde quando
  // a escola marca a NOVA data (criarAgendamento já limpa
  // reagendamento_solicitado nesse momento, ver lib/enautica.js).
  // Revisão de 05/09/2026 (4ª rodada, revertida): cheguei a diferenciar
  // "recusada" de "pendente" na tela, mas o Alex foi claro — esse status
  // "recusada" não existe mais no fluxo de verdade (só sobrou de matrículas
  // de ANTES deste sistema, ver comentário no topo do arquivo); a única
  // ação que faz sentido pra elas é "Excluir aluno" (arquivar), igual
  // qualquer outra, não um rótulo especial. Voltou a ser só "Matrícula" em
  // vermelho pra qualquer coisa que não seja 'aprovada' — sem distinguir
  // pendente de recusada na tela.
  function trilha(aluno) {
    const { matricula, temTeorica, temPratica } = aluno
    const matriculaOk = matricula.status === 'aprovada'
    const teoricaOk = temTeorica && !matricula.reagendamento_solicitado
    return [
      { label: 'Matrícula', estado: matriculaOk ? 'ok' : 'erro' },
      { label: 'Avaliação Teórica', estado: teoricaOk ? 'ok' : 'erro' },
      { label: 'Aula Prática', estado: temPratica ? 'ok' : 'erro' },
    ]
  }

  // Status (era "Contato"/e-mail) — frase curta do que está pendente do
  // LADO DO ALUNO. Prioridade: reagendamento pedido > pronto pra prova (e
  // ainda sem teórica marcada) > nada pendente. Não usa o status da
  // matrícula (isso já está na coluna Etapa) — é só o que o ALUNO sinalizou.
  // Textos e classe (pedido do Alex, 05/09/2026: rótulos mais curtos + a
  // mesma estética de "pílula" (.badge + .status-enautica-*, ver index.css)
  // usada nos status do RV Marine — antes era só texto colorido).
  function statusAluno(aluno) {
    const { matricula, temTeorica } = aluno
    if (matricula.reagendamento_solicitado) {
      return { texto: 'Agendar reprova', classe: 'status-enautica-reprova' }
    }
    if (matricula.pronto_teste === 'sim' && !temTeorica) {
      return { texto: 'Agendar teórica', classe: 'status-enautica-teorica' }
    }
    return { texto: 'Preparação', classe: 'status-enautica-preparacao' }
  }

  let alunosFiltrados = alunos.filter((a) => !a.matricula.arquivado)
  if (busca.trim()) {
    const termo = busca.trim().toLowerCase()
    alunosFiltrados = alunosFiltrados.filter((a) => (a.matricula.clientes?.nome || '').toLowerCase().includes(termo))
  }

  function alternarSelecao(id) {
    setSelecionados((s) => {
      const novo = new Set(s)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }
  const selecionadosAlunos = alunos.filter((a) => selecionados.has(a.matricula.id))
  const selPendentes = selecionadosAlunos.length > 0 && selecionadosAlunos.every((a) => a.matricula.status === 'pendente')
  const selAprovados = selecionadosAlunos.length > 0 && selecionadosAlunos.every((a) => a.matricula.status === 'aprovada')

  // "Lista de presença" da barra de seleção — reaproveita o mesmo anexo que
  // já existia só dentro do modal "Agendar provas" (abrirListaPratica). Se
  // os alunos selecionados tiverem uma aula prática em comum já marcada
  // (mesmo agendamento pra todos), usa a data/hora/local dela pra preencher
  // o documento. Revisão de 05/09/2026, pedido do Alex: o botão passou a
  // habilitar com QUALQUER seleção (não precisa mais ter aula em comum) —
  // sem uma aula em comum, o documento sai com os campos de data/hora/local
  // em branco (gerarListaPratica em lib/enauticaDocumentos.js já trata isso
  // sozinho, com "___/___/______" etc.), pra o administrador preencher à
  // mão quando for uma lista avulsa.
  const agendamentoComumPratica = selecionadosAlunos.length > 0
    ? agendamentos
      .filter((ag) => ag.tipo === 'pratica' && selecionadosAlunos.every((a) => (ag.alunos_ids || []).includes(a.matricula.cliente_id)))
      .sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))[0] || null
    : null

  async function aprovarSelecionados() {
    if (!selPendentes) return
    setProcessandoId('lote')
    try {
      for (const a of selecionadosAlunos) await aprovarMatricula(a.matricula)
      setSelecionados(new Set())
      await carregar()
    } catch (err) {
      alert('Não foi possível aprovar todos os selecionados: ' + err.message)
    } finally {
      setProcessandoId(null)
    }
  }

  // "Excluir aluno" — arquiva (não apaga, ver comentário no topo do
  // arquivo). Confirmação simples: é uma ação reversível (dá pra restaurar
  // na aba Histórico), mas ainda tira o aluno da lista principal na hora.
  async function arquivarSelecionados() {
    if (selecionadosAlunos.length === 0) return
    if (!window.confirm(`Mover ${selecionadosAlunos.length} aluno(s) para o Histórico?`)) return
    setArquivandoLote(true)
    try {
      for (const a of selecionadosAlunos) await arquivarMatricula(a.matricula)
      setSelecionados(new Set())
      await carregar()
    } catch (err) {
      alert('Não foi possível mover todos os selecionados: ' + err.message)
    } finally {
      setArquivandoLote(false)
    }
  }

  // "Baixar documentos (N)" em massa — mesma ideia do rsnautica (seleção
  // múltipla + ação em massa). Busca o cadastro completo (CPF, RG,
  // endereço...) só dos alunos selecionados, na hora.
  async function baixarZipSelecionados() {
    if (!selAprovados) return
    setBaixandoZip(true)
    try {
      const ids = selecionadosAlunos.map((a) => a.matricula.cliente_id)
      const [marina, clientes] = await Promise.all([buscarMarina(marinaId), buscarClientesPorIds(ids)])
      const clientePorId = {}
      clientes.forEach((c) => { clientePorId[c.id] = c })
      const alunosParaZip = selecionadosAlunos
        .map((a) => ({ cliente: clientePorId[a.matricula.cliente_id], habilitacao: a.matricula.habilitacao }))
        .filter((al) => al.cliente)
      const docConfig = marina?.config_json?.documentos || {}
      await baixarZipDocumentosAlunos(alunosParaZip, marina, docConfig, labelHabilitacao)
    } catch (err) {
      alert('Não foi possível gerar o .zip: ' + err.message)
    } finally {
      setBaixandoZip(false)
    }
  }

  function abrirModalAgenda(ids, nomes) {
    setFormAgenda(FORM_AGENDA_VAZIO)
    setErroAgenda(null)
    setAgendaEnviada(false)
    setModalAgenda({ alunosIds: ids, nomes })
  }

  async function enviarAgenda(e) {
    e.preventDefault()
    setErroAgenda(null)
    setAgendaEnviada(false)
    setCriandoAgenda(true)
    try {
      await criarAgendamento({
        marinaId, tipo: formAgenda.tipo, data: formAgenda.data, hora: formAgenda.hora,
        local: formAgenda.local, alunosIds: modalAgenda.alunosIds,
      })
      setAgendaEnviada(true)
      setSelecionados(new Set())
      await carregar()
    } catch (err) {
      setErroAgenda(err.message)
    } finally {
      setCriandoAgenda(false)
    }
  }

  async function gerarListaAlunos() {
    setErroAgenda(null)
    const janela = window.open('', '_blank')
    if (!janela) {
      alert('Não foi possível abrir a lista: o navegador bloqueou o pop-up. Permita pop-ups para este site e tente de novo.')
      return
    }
    setGerandoLista(true)
    try {
      const [marina, clientes] = await Promise.all([buscarMarina(marinaId), buscarClientesPorIds(modalAgenda.alunosIds)])
      const habilitacaoPorId = {}
      alunos.forEach((a) => { habilitacaoPorId[a.matricula.cliente_id] = a.matricula.habilitacao })
      const alunosComHabilitacao = clientes.map((c) => ({ ...c, habilitacao: habilitacaoPorId[c.id] || '' }))
      const docConfig = marina?.config_json?.documentos || {}
      abrirListaPratica({ data: formAgenda.data, hora: formAgenda.hora, local: formAgenda.local }, alunosComHabilitacao, marina, docConfig, janela)
    } catch (err) {
      janela.close()
      alert('Não foi possível gerar a lista: ' + err.message)
    } finally {
      setGerandoLista(false)
    }
  }

  async function gerarListaPresencaSelecionados() {
    if (selecionadosAlunos.length === 0) return
    const janela = window.open('', '_blank')
    if (!janela) {
      alert('Não foi possível abrir a lista: o navegador bloqueou o pop-up. Permita pop-ups para este site e tente de novo.')
      return
    }
    setGerandoListaSelecionados(true)
    try {
      // A lista sempre traz exatamente os alunos MARCADOS na hora (não os
      // do agendamento inteiro, que pode ter mais gente) — se eles tiverem
      // uma aula prática em comum, usa a data/hora/local dela; senão, sai
      // em branco pro administrador preencher à mão (ver comentário acima,
      // onde agendamentoComumPratica é calculado).
      const ids = selecionadosAlunos.map((a) => a.matricula.cliente_id)
      const [marina, clientes] = await Promise.all([buscarMarina(marinaId), buscarClientesPorIds(ids)])
      const habilitacaoPorId = {}
      alunos.forEach((a) => { habilitacaoPorId[a.matricula.cliente_id] = a.matricula.habilitacao })
      const alunosComHabilitacao = clientes.map((c) => ({ ...c, habilitacao: habilitacaoPorId[c.id] || '' }))
      const docConfig = marina?.config_json?.documentos || {}
      abrirListaPratica(
        {
          data: agendamentoComumPratica?.data || '',
          hora: agendamentoComumPratica?.hora || '',
          local: agendamentoComumPratica?.local || '',
        },
        alunosComHabilitacao, marina, docConfig, janela,
      )
    } catch (err) {
      janela.close()
      alert('Não foi possível gerar a lista: ' + err.message)
    } finally {
      setGerandoListaSelecionados(false)
    }
  }

  return (
    <div>
      {erro && <p className="erro">Não foi possível carregar os alunos ({erro}).</p>}

      {/* Cabeçalho (busca + barra de ações em massa) fica "sticky": gruda no
          topo da janela ao rolar a tabela, em vez de sumir de tela — pedido
          do Alex pra nunca perder de vista os botões de ação quando a lista
          de alunos é grande. Precisa de fundo sólido (senão as linhas da
          tabela aparecem "por baixo" ao passar) e z-index pra ficar por
          cima da tabela. */}
      <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--cor-fundo)', paddingBottom: 22 }}>
        {/* Barra de ações em massa — pedido do Alex (05/09/2026): fica
            SEMPRE visível (antes só aparecia com alguma seleção), com cada
            botão desabilitando sozinho quando não há seleção que faça
            sentido pra ele (evita, por ex., tentar aprovar um aluno que já
            foi aprovado, ou agir com nada marcado). TODA ação de aluno
            (aprovar, agendar, documentos, ata presencial, arquivar) passa
            por aqui — não existe botão por linha: pra agir sobre 1 aluno
            só, marca a caixa dele e usa o botão da barra do mesmo jeito. A
            contagem de selecionados é um número discreto, à direita do
            botão "Arquivar", só quando há alguma seleção. A busca (pedido
            do Alex, 06/09/2026) fica na MESMA linha dos botões, empurrada
            pro canto direito com `marginLeft: auto` — "Buscar" sozinho no
            placeholder, sem mais "por nome…". */}
        <div className="cliente-card-acoes" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button" className="botao-primario" disabled={!selPendentes || processandoId === 'lote'}
            title={selPendentes ? undefined : 'Só habilita quando TODOS os alunos marcados ainda estão com matrícula pendente de aprovação — se o aluno não deve seguir, use "Excluir aluno" em vez de tentar aprovar'}
            onClick={aprovarSelecionados}
          >
            {processandoId === 'lote' ? 'Aprovando…' : 'Aprovar'}
          </button>
          <button
            type="button" className="botao-secundario" disabled={!selAprovados || baixandoZip}
            title={selAprovados ? undefined : 'Só habilita quando TODOS os alunos marcados já têm matrícula aprovada'}
            onClick={baixarZipSelecionados}
          >
            {baixandoZip ? 'Gerando .zip…' : 'Documentos'}
          </button>
          <button
            type="button" className="botao-secundario" disabled={!selAprovados}
            title={selAprovados ? undefined : 'Só habilita quando TODOS os alunos marcados já têm matrícula aprovada'}
            onClick={() => abrirModalAgenda(selecionadosAlunos.map((a) => a.matricula.cliente_id), selecionadosAlunos.map((a) => a.matricula.clientes?.nome || 'Aluno'))}
          >
            Agendamento
          </button>
          <button
            type="button" className="botao-secundario" disabled={selecionados.size === 0 || gerandoListaSelecionados}
            title={agendamentoComumPratica ? undefined : 'Os alunos marcados não compartilham uma aula prática já marcada — a lista sai com data/hora/local em branco, pra preencher à mão'}
            onClick={gerarListaPresencaSelecionados}
          >
            {gerandoListaSelecionados ? 'Gerando…' : 'Ata Presencial'}
          </button>
          <button type="button" className="botao-secundario perigo" disabled={selecionados.size === 0 || arquivandoLote} onClick={arquivarSelecionados}>
            {arquivandoLote ? 'Movendo…' : 'Arquivar'}
          </button>
          {selecionados.size > 0 && (
            <span style={{ fontSize: 11.5, color: 'var(--cor-texto-suave)' }}>{selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>
          )}
          <input
            type="text" placeholder="Buscar" value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ marginLeft: 'auto', flex: '0 1 200px', minWidth: 140, padding: '7px 10px', fontSize: 13, border: '1px solid var(--cor-toggle-off)', borderRadius: 8 }}
          />
        </div>
      </div>

      {/* maxHeight + overflowY: a tabela ganha sua própria barra de rolagem
          — com isso, mesmo uma lista de alunos grande nunca empurra o
          cabeçalho acima (abas/busca/barra de ações) pra fora da tela.
          <thead> com position:sticky (dentro deste mesmo container) mantém
          os títulos das colunas visíveis mesmo rolando a lista. */}
      <div className="table-scroll" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)', background: 'var(--cor-card)', borderRadius: 'var(--raio)', boxShadow: 'var(--sombra)' }}>
        {/* Larguras fixas por coluna (em vez de deixar o navegador decidir
            pelo conteúdo de cada linha): sem isso, "Etapa" e "Status"
            deslizavam pra esquerda/direita dependendo do tamanho do nome de
            cada aluno — com <colgroup>, a coluna sempre fica na mesma
            posição em toda linha, alinhada com o cabeçalho. */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820, tableLayout: 'fixed' }}>
          {/* Revisão de 06/09/2026, 3ª rodada (pedido do Alex): as duas
              tentativas anteriores erraram em direções opostas —
              porcentagens iguais deixavam Status/Etapa "flutuando" longe
              do conteúdo; deixar só "Aluno" sem largura fixa jogava TODO o
              espaço sobrando pra ela, empurrando as outras 3 coladas lá no
              canto direito. Solução: largura em PORCENTAGEM (cresce/encolhe
              junto com a tela — "proporcional" de verdade) mas cada coluna
              recebe uma fatia do total proporcional ao que o próprio
              conteúdo precisa (Etapa, com 3 selos, ganha mais que Telefone,
              por ex.) — assim o respiro ao redor do conteúdo fica parecido
              em todas. Títulos: todos centralizados de novo (inclusive
              "Aluno"), sem alinhar nenhum pela borda. */}
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...thEsq, position: 'sticky', top: 0 }}></th>
              <th style={{ ...thEsq, position: 'sticky', top: 0 }}>Aluno</th>
              <th style={{ ...thEsq, position: 'sticky', top: 0 }}>Telefone</th>
              <th style={{ ...thEsq, position: 'sticky', top: 0 }}>Etapa</th>
              <th style={{ ...thEsq, position: 'sticky', top: 0 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {alunosFiltrados.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 16, color: 'var(--cor-texto-suave)' }}>
                Nenhum aluno no momento.
              </td></tr>
            )}
            {alunosFiltrados.map((a) => {
              const m = a.matricula
              const st = statusAluno(a)
              // Reagendamento e próximo compromisso não têm mais painel próprio
              // (removido a pedido do Alex — seleção agora é só pela caixa de
              // marcação) — viram `title` (dica ao passar o mouse) na própria
              // trilha, pra não perder a informação.
              const tituloTeorica = m.reagendamento_solicitado
                ? 'Aluno pediu reagendamento da avaliação teórica — resolve-se sozinho quando a escola marcar a nova data'
                : (a.proximoCompromisso ? `Próximo compromisso: ${new Date(`${a.proximoCompromisso.data}T12:00`).toLocaleDateString('pt-BR')} às ${a.proximoCompromisso.hora} — ${a.proximoCompromisso.tipo_label || labelTipoAgendamento(a.proximoCompromisso.tipo)}` : 'Avaliação Teórica')
              return (
                <tr key={m.id}>
                  <td style={tdCentro}>
                    <input type="checkbox" checked={selecionados.has(m.id)} onChange={() => alternarSelecao(m.id)} />
                  </td>
                  <td style={tdEsq}>
                    <b style={{ color: 'var(--cor-primaria)' }}>{m.clientes?.nome || 'Aluno sem nome'}</b>
                    <div style={{ fontSize: 11.5, color: 'var(--cor-texto-suave)' }} title={m.clientes?.email ? `Contato: ${m.clientes.email}` : undefined}>
                      {labelHabilitacao(m.habilitacao)}
                    </div>
                  </td>
                  <td style={{ ...tdCentro, color: 'var(--cor-texto-suave)' }}>{m.clientes?.telefone || '—'}</td>
                  <td style={tdCentro}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {trilha(a).map((etapa) => (
                        <span
                          key={etapa.label}
                          title={etapa.label === 'Avaliação Teórica' ? tituloTeorica : etapa.label}
                          style={{ fontSize: 10, color: corEtapa[etapa.estado], fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: corEtapa[etapa.estado], border: `1.3px solid ${corEtapa[etapa.estado]}` }} />
                          {etapa.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={tdCentro}>
                    <span className={`badge ${st.classe}`}>{st.texto}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modalAgenda && (
        <div className="modal-fundo configuracoes-modal-dourado" onClick={() => setModalAgenda(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>Agendar provas</h3>
            <p className="dica" style={{ margin: '0 0 12px' }}>
              {modalAgenda.nomes.length === 1 ? modalAgenda.nomes[0] : `${modalAgenda.nomes.length} alunos: ${modalAgenda.nomes.join(', ')}`}
            </p>
            <form onSubmit={enviarAgenda} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={formAgenda.tipo} onChange={(e) => setFormAgenda({ ...formAgenda, tipo: e.target.value })}>
                {TIPOS_AGENDAMENTO.map((t) => <option key={t.chave} value={t.chave}>{t.label}</option>)}
              </select>
              <div className="form-inline">
                <input type="date" required value={formAgenda.data} onChange={(e) => setFormAgenda({ ...formAgenda, data: e.target.value })} />
                <input type="time" required value={formAgenda.hora} onChange={(e) => setFormAgenda({ ...formAgenda, hora: e.target.value })} />
              </div>
              <input
                type="text" required placeholder="Local (ex: Capitania dos Portos)"
                value={formAgenda.local} onChange={(e) => setFormAgenda({ ...formAgenda, local: e.target.value })}
              />
              {erroAgenda && <p className="erro">{erroAgenda}</p>}
              {agendaEnviada && <p className="dica" style={{ fontWeight: 600 }}>Prova agendada — os alunos selecionados foram notificados.</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" disabled={criandoAgenda}>{criandoAgenda ? 'Agendando…' : 'Agendar'}</button>
                {formAgenda.tipo === 'pratica' && (
                  <button type="button" className="botao-secundario" disabled={gerandoLista} onClick={gerarListaAlunos}>
                    {gerandoLista ? 'Gerando…' : 'Lista de alunos (Capitania)'}
                  </button>
                )}
              </div>
            </form>
            <div className="acoes-modal">
              <button type="button" onClick={() => setModalAgenda(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Centralizado (pedido do Alex) — só o TÍTULO da coluna; o conteúdo de cada
// célula (tdEsq) continua alinhado à esquerda, mais fácil de ler em texto
// corrido. `background` aqui é o que permite o <thead> ficar "sticky" (ver
// acima) sem as linhas de baixo aparecerem por trás ao rolar.
const thEsq = { textAlign: 'center', padding: '11px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--cor-texto-suave)', borderBottom: '1px solid #EAF2F5', background: 'var(--cor-card)', zIndex: 1 }
const tdEsq = { textAlign: 'left', padding: '11px 12px', borderBottom: '1px solid #EAF2F5', verticalAlign: 'middle' }
// Telefone/Etapa/Status ficam centralizados, alinhados com o título
// centralizado da própria coluna (pedido do Alex) — só "Aluno" continua à
// esquerda (nome + habilitação leem melhor assim).
const tdCentro = { ...tdEsq, textAlign: 'center' }
