import { useEffect, useState } from 'react'
import { IconLogout, IconPlayerPlay, IconCalendarEvent, IconCertificate, IconUserCircle } from '@tabler/icons-react'
import { supabase, db } from '../lib/supabase'
import { buscarMarina } from '../lib/db'
import {
  HABILITACOES, labelHabilitacao, camposDocumentoFaltando, buscarMinhaMatricula, enviarMatricula,
  modulosAulaComVideo, aulasConcluidas, alternarAulaConcluida,
  listarMeusAgendamentos, listarMeusCertificados, labelTipoAgendamento,
} from '../lib/enautica'

// Área do aluno no RV e-Náutica — mesma linguagem visual do painel do
// cliente do RV Marine (TelaClienteDashboard.jsx): wrapper ".painel-cliente",
// logo no topo, header com o nome do tenant + sair. Sem NENHUMA etapa de
// pagamento (ao contrário do AlunoFlow.jsx original do rsnautica) — o único
// "gate" é a matrícula ser aprovada pela equipe da escola.
//
// Aulas/Agenda/Certificados ainda não têm conteúdo de verdade (chegam nas
// próximas fases, já com o schema do banco pronto — ver enautica.agendamentos
// / .certificados) — mostrados como "Em construção", mesma convenção já
// usada no resto da plataforma (AplicacaoEmConstrucao.jsx), só que dentro da
// própria aba em vez de tela cheia, já que a matrícula deste aluno está
// aprovada.
const ABAS_ALUNO = [
  { chave: 'aulas', label: 'Aulas preparatórias', Icone: IconPlayerPlay },
  { chave: 'agenda', label: 'Agendamentos', Icone: IconCalendarEvent },
  { chave: 'certs', label: 'Meus certificados', Icone: IconCertificate },
  { chave: 'dados', label: 'Meus dados', Icone: IconUserCircle },
]

export default function TelaClienteENautica({ perfil }) {
  const [cliente, setCliente] = useState(null)
  const [matricula, setMatricula] = useState(null)
  const [marina, setMarina] = useState(null)
  const [erroCarregamento, setErroCarregamento] = useState(null)
  const [aba, setAba] = useState('aulas')
  const [agendamentos, setAgendamentos] = useState([])
  const [certificados, setCertificados] = useState([])
  const [concluidas, setConcluidas] = useState(() => new Set())

  const [habilitacao, setHabilitacao] = useState('arrais')
  const [formFaltando, setFormFaltando] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState(null)
  const [modalMatriculaAberto, setModalMatriculaAberto] = useState(false)

  async function carregar() {
    try {
      const { data: cli, error: erroCli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
      if (erroCli) throw erroCli
      setCliente(cli)
      setErroCarregamento(null)
      if (!cli) return
      const [mat, mar, ags, certs] = await Promise.all([
        buscarMinhaMatricula(cli.id),
        buscarMarina(cli.marina_id),
        listarMeusAgendamentos(cli.id),
        listarMeusCertificados(cli.id),
      ])
      setMatricula(mat)
      setMarina(mar)
      setAgendamentos(ags)
      setCertificados(certs)
      setConcluidas(aulasConcluidas(cli.id))
    } catch (err) {
      setErroCarregamento(err.message)
    }
  }

  useEffect(() => { carregar() }, [perfil?.id])

  // Realtime: a aprovação/recusa feita pela equipe da escola aparece na hora,
  // sem precisar recarregar a página — mesmo padrão do RV Marine.
  useEffect(() => {
    if (!cliente?.id) return
    const canal = supabase
      .channel(`enautica-minha-matricula-${cliente.id}`)
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'matriculas', filter: `cliente_id=eq.${cliente.id}` }, () => carregar())
      // Certificados filtram por cliente_id igual matrículas; agendamentos
      // não têm essa coluna (é `alunos_ids`, um array — não dá pra filtrar
      // no `filter:` do realtime), então escuta a tabela inteira da escola
      // e recarrega, deixando o RLS/query decidir o que é meu na hora do
      // `carregar()`. Tráfego baixo (poucos agendamentos por escola).
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'certificados', filter: `cliente_id=eq.${cliente.id}` }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'enautica', table: 'agendamentos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id])

  async function enviarPedido(e) {
    e.preventDefault()
    setErroEnvio(null)
    setEnviando(true)
    try {
      await enviarMatricula({
        clienteId: cliente.id, marinaId: cliente.marina_id, habilitacao, dadosFaltando: formFaltando,
      })
      await carregar()
      setModalMatriculaAberto(false)
    } catch (err) {
      setErroEnvio(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const camposFaltando = cliente ? camposDocumentoFaltando(cliente) : []

  function marcarAula(moduloId, concluida) {
    setConcluidas(alternarAulaConcluida(cliente.id, moduloId, concluida))
  }

  function baixarCertificado(cert) {
    const conteudo = `CERTIFICADO DE CONCLUSÃO\n\n`
      + `Aluno: ${cliente.nome}\n`
      + `Habilitação: ${labelHabilitacao(cert.habilitacao)}\n`
      + `Escola: ${marina?.nome || ''}\n`
      + `Data de emissão: ${new Date(`${cert.data_emissao}T12:00`).toLocaleDateString('pt-BR')}\n\n`
      + `Este certificado comprova a conclusão do curso náutico pela escola credenciada.\n`
      + `A habilitação oficial é emitida separadamente pela Marinha do Brasil e disponibilizada na sua conta Gov.br.`
    const blob = new Blob([conteudo], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Certificado_${labelHabilitacao(cert.habilitacao).replace(/\s+/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="painel-cliente" style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <img src="/rv-invictus-logo.png" alt="RV Invictus · Consultoria e Gestão de Processos" className="pagina-cliente-logo" />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, marginBottom: 24 }}>
        <strong className="painel-cliente-marina">{marina?.nome || 'RV e-Náutica'}</strong>
        <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} title="Sair" aria-label="Sair" onClick={() => supabase.auth.signOut()}>
          <IconLogout size={16} />
        </button>
      </header>

      {erroCarregamento && (
        <div className="erro" style={{ marginBottom: 12 }}>
          Não foi possível atualizar seus dados agora ({erroCarregamento}). Tente recarregar a página.
        </div>
      )}

      {!cliente && !erroCarregamento && <p>Seu cadastro ainda está em análise pela administração.</p>}

      {/* Sem matrícula ainda: a tela inicial só oferece 3 botões, um por
          habilitação (ver HABILITACOES em lib/enautica.js) — escolher um
          abre o modal de pedido (padrão dourado/navy do resto do RV Marine,
          .modal-fundo + .modal-card) já com a habilitação decidida, e nele
          só entram os campos de documento que ainda faltam (ver
          camposDocumentoFaltando). Também cobre o caso de matrícula
          recusada: o aluno pode mandar um novo pedido pelos mesmos botões. */}
      {cliente && (!matricula || matricula.status === 'recusada') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {matricula?.status === 'recusada' && (
            <p className="status-texto cancelado">
              Sua matrícula anterior foi recusada{matricula.motivo_recusa ? `: ${matricula.motivo_recusa}` : '.'} Você pode enviar um novo pedido abaixo.
            </p>
          )}
          <h3 style={{ margin: 0 }}>Pedido de matrícula</h3>
          <p className="dica">Escolha a habilitação desejada para começar.</p>

          {HABILITACOES.map((h) => (
            <button
              key={h.chave} type="button"
              className="painel-cliente-btn painel-cliente-btn-primario"
              onClick={() => { setHabilitacao(h.chave); setFormFaltando({}); setErroEnvio(null); setModalMatriculaAberto(true) }}
            >
              {h.label}
            </button>
          ))}
        </div>
      )}

      {modalMatriculaAberto && (
        <div className="modal-fundo" onClick={() => setModalMatriculaAberto(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={enviarPedido}>
            <h3>Pedido de matrícula</h3>
            <p className="dica">
              Habilitação: <b>{labelHabilitacao(habilitacao)}</b>.
              {camposFaltando.length > 0 && ' Os dados abaixo são usados na geração dos seus documentos de matrícula.'}
            </p>

            {camposFaltando.map((c) => (
              c.tipo === 'date' ? (
                <div key={c.chave} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="minha-conta-secao-titulo">{c.label}</span>
                  <input
                    type="date" required
                    value={formFaltando[c.chave] || ''}
                    onChange={(e) => setFormFaltando({ ...formFaltando, [c.chave]: e.target.value })}
                  />
                </div>
              ) : (
                <input
                  key={c.chave} type="text" required placeholder={c.label}
                  value={formFaltando[c.chave] || ''}
                  onChange={(e) => setFormFaltando({ ...formFaltando, [c.chave]: e.target.value })}
                />
              )
            ))}

            {erroEnvio && <p className="erro">{erroEnvio}</p>}

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalMatriculaAberto(false)}>Cancelar</button>
              <button type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar pedido'}</button>
            </div>
          </form>
        </div>
      )}

      {cliente && matricula?.status === 'pendente' && (
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <p className="status-texto pendente">Matrícula em análise</p>
          <p className="dica">Seu pedido para <b>{labelHabilitacao(matricula.habilitacao)}</b> está aguardando aprovação da escola. Você será avisado assim que a decisão sair.</p>
        </div>
      )}

      {cliente && matricula?.status === 'aprovada' && (
        <>
          <div className="abas" style={{ flexWrap: 'wrap' }}>
            {ABAS_ALUNO.map((a) => (
              <button key={a.chave} className={aba === a.chave ? 'ativo' : ''} onClick={() => setAba(a.chave)}>
                <a.Icone size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> {a.label}
              </button>
            ))}
          </div>

          {aba === 'aulas' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {modulosAulaComVideo(marina).map((m) => (
                <div key={m.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente"><span className="nome">{m.titulo}</span></div>
                  </div>
                  <div className="linha">{m.desc}</div>
                  {m.youtubeId ? (
                    <div className="cliente-card-acoes">
                      <a
                        className="botao-secundario" style={{ textDecoration: 'none' }}
                        href={`https://www.youtube.com/watch?v=${m.youtubeId}`} target="_blank" rel="noopener noreferrer"
                      >
                        Assistir aula
                      </a>
                    </div>
                  ) : (
                    <p className="dica" style={{ margin: '6px 0 0' }}>Conteúdo em preparação pela escola.</p>
                  )}
                  <label className="opcao-checkbox" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={concluidas.has(m.id)} onChange={(e) => marcarAula(m.id, e.target.checked)} />
                    Marcar como concluída
                  </label>
                </div>
              ))}
            </div>
          )}

          {aba === 'agenda' && (
            <div className="lista-cards">
              {agendamentos.length === 0 && <p className="dica" style={{ textAlign: 'center' }}>Nenhum compromisso marcado ainda.</p>}
              {agendamentos.map((ag) => (
                <div key={ag.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente"><span className="nome">{labelTipoAgendamento(ag.tipo)}</span></div>
                  </div>
                  <div className="linha">
                    {new Date(`${ag.data}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {ag.hora}
                  </div>
                  <div className="linha"><b>Local:</b> {ag.local}</div>
                  <div className={`status-texto ${ag.status === 'confirmado' ? 'em-dia' : ag.status === 'concluido' ? '' : 'cancelado'}`}>
                    {ag.status === 'confirmado' ? 'Confirmado' : ag.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {aba === 'certs' && (
            <div className="lista-cards">
              <p className="dica">
                Este é um recibo interno da escola, não o documento oficial — sua habilitação náutica é emitida
                pela Marinha do Brasil e chega automaticamente na sua conta Gov.br depois da aprovação.
              </p>
              {certificados.length === 0 && <p className="dica" style={{ textAlign: 'center' }}>Nenhum certificado disponível ainda.</p>}
              {certificados.map((c) => (
                <div key={c.id} className="cliente-card">
                  <div className="cabecalho-cliente">
                    <div className="titulo-cliente"><span className="nome">{labelHabilitacao(c.habilitacao)}</span></div>
                  </div>
                  <div className="linha"><b>Emitido em:</b> {new Date(`${c.data_emissao}T12:00`).toLocaleDateString('pt-BR')}</div>
                  <div className="linha"><b>Status:</b> {c.status === 'entregue' ? 'Entregue' : 'Disponível'}</div>
                  <div className="cliente-card-acoes">
                    <button type="button" className="botao-secundario" onClick={() => baixarCertificado(c)}>Baixar certificado</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {aba === 'dados' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="linha"><b>Nome:</b> {cliente.nome}</div>
              <div className="linha"><b>E-mail:</b> {cliente.email || '—'}</div>
              <div className="linha"><b>Telefone:</b> {cliente.telefone || '—'}</div>
              <div className="linha"><b>Habilitação matriculada:</b> {labelHabilitacao(matricula.habilitacao)}</div>
              <p className="dica">Edição dos dados pessoais chega numa próxima fase.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
