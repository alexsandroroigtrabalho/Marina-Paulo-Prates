import { useEffect, useState } from 'react'
import { APLICACOES, nomeCompleto } from '../lib/apps'
import { listarTenants, sublinkPrevisto, atualizarAppsContratados } from '../lib/rvMaster'

// Painel do RV Master: primeira tela de quem loga como rv_master (ver
// App.jsx, ehRvMaster) — lista todos os clientes da RV Invictus (marinas e
// escolas náuticas, cada linha de marina.marinas é um tenant), com o
// sublink previsto, as aplicações contratadas e um resumo de uso por
// aplicação. Escolher um tenant aqui ("Entrar como esta marina/escola")
// leva pro mesmo painel interno que a equipe daquele tenant usa
// normalmente — mesmo fluxo que já existia, só que agora com esta vitrine
// na frente em vez de uma lista seca.
export default function TelaRvMaster({ onEntrarComoTenant }) {
  const [tenants, setTenants] = useState(null)
  const [erro, setErro] = useState(null)
  // Qual tenant está com o toggle de aplicações em andamento (desabilita os
  // checkboxes dele só, não a tela toda, enquanto salva).
  const [salvandoId, setSalvandoId] = useState(null)

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

      {erro && <p className="erro">Não foi possível carregar os clientes ({erro}).</p>}
      {tenants === null && !erro && <p className="dica">Carregando…</p>}

      <div className="lista-cards">
        {tenants?.map((t) => {
          const sublink = sublinkPrevisto(t)
          return (
            <div key={t.id} className="cliente-card">
              <div className="cabecalho-cliente">
                <div className="titulo-cliente"><span className="nome">{t.nome}</span></div>
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
