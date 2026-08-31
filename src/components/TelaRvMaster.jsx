import { useEffect, useState } from 'react'
import { APLICACOES, nomeCompleto } from '../lib/apps'
import {
  listarTenants, sublinkPrevisto, atualizarAppsContratados,
  criarTenant, alternarSuspensaoTenant, tenantSuspenso, slugificar,
} from '../lib/rvMaster'

const NOVO_CLIENTE_VAZIO = { nome: '', slug: '', apps: ['marine'] }

// Aba "Clientes" da área do rv_master (TELAS_RV_MASTER, lib/apps.js — a
// outra aba é "Painel de Controle", TelaPainelControleRvMaster.jsx, só
// números agregados). Aqui é a gestão de verdade, cliente por cliente: lista
// todos os clientes da RV Invictus (marinas e escolas náuticas, cada linha
// de marina.marinas é um tenant), com o sublink previsto, as aplicações
// contratadas e um resumo de uso por aplicação, além de cadastrar um cliente
// novo e suspender/reativar acesso. Escolher um tenant aqui ("Entrar como
// esta marina/escola") leva pro mesmo painel interno que a equipe daquele
// tenant usa normalmente — mesmo fluxo que já existia, só que agora com
// esta vitrine na frente em vez de uma lista seca.
export default function TelaRvMaster({ onEntrarComoTenant }) {
  const [tenants, setTenants] = useState(null)
  const [erro, setErro] = useState(null)
  // Qual tenant está com o toggle de aplicações (ou a suspensão) em
  // andamento — desabilita os controles dele só, não a tela toda, enquanto
  // salva. As duas ações escrevem na mesma linha (marina.marinas), então
  // reaproveitar um único "travado" evita as duas rodando ao mesmo tempo
  // sobre o mesmo tenant.
  const [salvandoId, setSalvandoId] = useState(null)

  // --- "Adicionar cliente" (novo tenant) -----------------------------
  const [modalNovoClienteAberto, setModalNovoClienteAberto] = useState(false)
  const [novoCliente, setNovoCliente] = useState({ ...NOVO_CLIENTE_VAZIO })
  // Enquanto o rv_master não editar o campo Sublink na mão, ele acompanha o
  // Nome sozinho (slugificado) — assim que ele mexe direto no Sublink, essa
  // sincronização automática para (não sobrescreve o que ele já ajustou).
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false)
  const [salvandoNovoCliente, setSalvandoNovoCliente] = useState(false)
  const [erroNovoCliente, setErroNovoCliente] = useState(null)

  function carregar() {
    return listarTenants().then(setTenants).catch((err) => setErro(err.message))
  }

  useEffect(() => { carregar() }, [])

  // Liga/desliga uma aplicação contratada — recarrega a lista inteira
  // depois (não só o campo alterado) porque ligar/desligar muda também
  // quais estatísticas aquele card mostra (ex: ligar e-Náutica passa a
  // buscar a contagem de matrículas).
  async function alternarApp(tenant, chave) {
    const jaTem = tenant.apps_contratados?.includes(chave)
    const novaLista = jaTem
      ? tenant.apps_contratados.filter((c) => c !== chave)
      : [...(tenant.apps_contratados || []), chave]
    setSalvandoId(tenant.id)
    setErro(null)
    try {
      await atualizarAppsContratados(tenant.id, novaLista)
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvandoId(null)
    }
  }

  // Suspende/reativa o acesso de um cliente INTEIRO (equipe + clientes
  // finais dele, em qualquer aplicação) — ver AcessoSuspenso.jsx (App.jsx),
  // que passa a bloquear a tela pra quem for daquele tenant. Ação exclusiva
  // do rv_master (trigger protege_apps_contratados no banco recusa
  // qualquer outro papel tentando mexer nisso).
  async function alternarSuspensao(tenant) {
    setSalvandoId(tenant.id)
    setErro(null)
    try {
      await alternarSuspensaoTenant(tenant.id, !tenantSuspenso(tenant))
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvandoId(null)
    }
  }

  function abrirModalNovoCliente() {
    setNovoCliente({ ...NOVO_CLIENTE_VAZIO })
    setSlugEditadoManualmente(false)
    setErroNovoCliente(null)
    setModalNovoClienteAberto(true)
  }

  function alterarNomeNovoCliente(nome) {
    setNovoCliente((atual) => ({
      ...atual,
      nome,
      slug: slugEditadoManualmente ? atual.slug : slugificar(nome),
    }))
  }

  function alterarSlugNovoCliente(slug) {
    setSlugEditadoManualmente(true)
    setNovoCliente((atual) => ({ ...atual, slug: slugificar(slug) }))
  }

  function alternarAppNovoCliente(chave) {
    setNovoCliente((atual) => ({
      ...atual,
      apps: atual.apps.includes(chave) ? atual.apps.filter((c) => c !== chave) : [...atual.apps, chave],
    }))
  }

  async function salvarNovoCliente(e) {
    e.preventDefault()
    setErroNovoCliente(null)
    if (!novoCliente.nome.trim()) { setErroNovoCliente('Informe o nome do cliente.'); return }
    setSalvandoNovoCliente(true)
    try {
      await criarTenant({ nome: novoCliente.nome, slug: novoCliente.slug, appsContratados: novoCliente.apps })
      setModalNovoClienteAberto(false)
      await carregar()
    } catch (err) {
      // Erro mais comum aqui: sublink já usado por outro cliente (índice
      // único em marina.marinas.slug) — a mensagem do Postgres já deixa
      // isso claro o suficiente pra não precisar traduzir/mapear.
      setErroNovoCliente(err.message)
    } finally {
      setSalvandoNovoCliente(false)
    }
  }

  const totalClientes = tenants?.reduce((soma, t) => soma + t.stats.clientes, 0) || 0

  return (
    <div>
      <div className="resumo-financeiro">
        <div className="stat-card">
          <span>Clientes RV Invictus</span>
          <strong>{tenants?.length ?? '—'}</strong>
        </div>
        <div className="stat-card">
          <span>Cadastros finais (todos os tenants)</span>
          <strong>{tenants ? totalClientes : '—'}</strong>
        </div>
      </div>

      <div className="cliente-card-acoes" style={{ margin: '4px 0 20px' }}>
        <button type="button" className="botao-secundario" onClick={abrirModalNovoCliente}>
          + Adicionar cliente
        </button>
      </div>

      {erro && <p className="erro">Não foi possível carregar os clientes ({erro}).</p>}
      {tenants === null && !erro && <p className="dica">Carregando…</p>}

      <div className="lista-cards">
        {tenants?.map((t) => {
          const sublink = sublinkPrevisto(t)
          const suspenso = tenantSuspenso(t)
          return (
            <div key={t.id} className="cliente-card">
              <div className="cabecalho-cliente">
                <div className="titulo-cliente">
                  <span className="nome">{t.nome}</span>
                  <span className={`status-texto ${suspenso ? 'cancelado' : 'em-dia'}`}>
                    {suspenso ? 'Acesso suspenso' : 'Ativo'}
                  </span>
                </div>
              </div>
              <div className="linha">
                <b>Sublink:</b> {sublink || 'ainda sem sublink definido'}
              </div>
              <div className="linha"><b>Aplicações contratadas:</b></div>
              <div className="linha" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                {APLICACOES.map((appDaLista) => (
                  <label key={appDaLista.chave} className="opcao-checkbox">
                    <input
                      type="checkbox"
                      checked={!!t.apps_contratados?.includes(appDaLista.chave)}
                      disabled={salvandoId === t.id}
                      onChange={() => alternarApp(t, appDaLista.chave)}
                    />
                    {nomeCompleto(appDaLista)}
                  </label>
                ))}
              </div>
              <div className="linha"><b>Clientes cadastrados:</b> {t.stats.clientes}</div>

              {t.apps_contratados?.includes('marine') && (
                <div className="linha"><b>RV Marine — operações registradas:</b> {t.stats.operacoesMarine ?? 0}</div>
              )}
              {t.apps_contratados?.includes('enautica') && t.stats.matriculas && (
                <div className="linha">
                  <b>RV e-Náutica — matrículas:</b> {t.stats.matriculas.total} no total
                  {' '}({t.stats.matriculas.pendentes} pendentes, {t.stats.matriculas.aprovadas} aprovadas, {t.stats.matriculas.recusadas} recusadas)
                </div>
              )}

              <div className="cliente-card-acoes">
                <button type="button" className="botao-secundario" onClick={() => onEntrarComoTenant(t.id)}>
                  Entrar como este cliente
                </button>
                <button
                  type="button"
                  className={`botao-secundario ${suspenso ? '' : 'perigo'}`}
                  disabled={salvandoId === t.id}
                  onClick={() => alternarSuspensao(t)}
                >
                  {suspenso ? 'Reativar acesso' : 'Suspender acesso'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {modalNovoClienteAberto && (
        <div className="modal-fundo" onClick={() => !salvandoNovoCliente && setModalNovoClienteAberto(false)}>
          <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={salvarNovoCliente}>
            <h3>Adicionar cliente</h3>
            <input
              type="text" required placeholder="Nome do cliente (marina ou escola náutica)"
              value={novoCliente.nome}
              onChange={(e) => alterarNomeNovoCliente(e.target.value)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input
                type="text" placeholder="Sublink (ex.: prates)"
                value={novoCliente.slug}
                onChange={(e) => alterarSlugNovoCliente(e.target.value)}
              />
              <span className="dica" style={{ margin: 0 }}>
                {novoCliente.slug ? `${novoCliente.slug}.rvinvictus.com.br` : 'Pode deixar em branco e definir depois.'}
              </span>
            </div>
            <div className="linha"><b>Aplicações contratadas:</b></div>
            <div className="linha" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {APLICACOES.map((appDaLista) => (
                <label key={appDaLista.chave} className="opcao-checkbox">
                  <input
                    type="checkbox"
                    checked={novoCliente.apps.includes(appDaLista.chave)}
                    onChange={() => alternarAppNovoCliente(appDaLista.chave)}
                  />
                  {nomeCompleto(appDaLista)}
                </label>
              ))}
            </div>

            {erroNovoCliente && <p className="erro">{erroNovoCliente}</p>}

            <div className="acoes-modal">
              <button type="button" onClick={() => setModalNovoClienteAberto(false)} disabled={salvandoNovoCliente}>Cancelar</button>
              <button type="submit" disabled={salvandoNovoCliente}>{salvandoNovoCliente ? 'Salvando…' : 'Adicionar cliente'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
