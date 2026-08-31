import { useEffect, useState } from 'react'
import { listarTenants, tenantSuspenso } from '../lib/rvMaster'
import { APLICACOES, nomeCompleto } from '../lib/apps'

// Cores dos gráficos abaixo — reaproveitando a paleta que já existe no resto
// do sistema (index.css, :root), sem inventar cor nova só pra este
// componente: verde/vermelho são os mesmos já usados em pago/pendente,
// dourado é o da marca, o resto vem do azul-petróleo em variações.
const COR_ATIVO = '#55702F'
const COR_SUSPENSO = '#A23B2E'
const CORES_MATRICULA = { pendentes: '#D9713E', aprovadas: '#55702F', recusadas: '#A23B2E' }
const CORES_APPS = ['#0D1B2A', '#D4AF37', '#5B7887', '#A23B2E', '#55702F', '#D9713E', '#16324A']

// Gráfico de pizza via conic-gradient (CSS puro, sem biblioteca de
// gráficos): cada fatia é um trecho do gradiente cônico proporcional ao
// valor. A legenda ao lado mostra a cor, o rótulo, o valor e a porcentagem
// de cada fatia.
function GraficoPizza({ titulo, fatias }) {
  const total = fatias.reduce((soma, f) => soma + f.valor, 0)
  let acumulado = 0
  const gradiente = total
    ? fatias.filter((f) => f.valor > 0).map((f) => {
        const inicio = acumulado
        acumulado += (f.valor / total) * 100
        return `${f.cor} ${inicio}% ${acumulado}%`
      }).join(', ')
    : '#E3E7EA 0% 100%'

  return (
    <div className="rvmaster-pizza-bloco">
      <div className="rvmaster-pizza" style={{ background: `conic-gradient(${gradiente})` }} />
      <div>
        <p className="rvmaster-pizza-titulo">{titulo}</p>
        <ul className="rvmaster-pizza-legenda">
          {fatias.map((f) => (
            <li key={f.label}>
              <span className="rvmaster-pizza-dot" style={{ background: f.cor }} />
              {f.label}: <b>{f.valor}</b>
              {total > 0 && <span className="rvmaster-pizza-pct"> ({Math.round((f.valor / total) * 100)}%)</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Painel de Controle do rv_master (TELAS_RV_MASTER, lib/apps.js) — números
// AGREGADOS de todos os clientes (marinas/escolas) juntos, só leitura: uma
// tabela de indicadores + gráficos de pizza, sem nenhum card. A gestão
// cliente por cliente (cadastrar, ligar/desligar aplicação, suspender)
// continua inteira na aba "Clientes" (TelaRvMaster.jsx) — este componente
// não tem nenhuma ação, só reaproveita a mesma `listarTenants()` pra somar
// os números.
export default function TelaPainelControleRvMaster() {
  const [tenants, setTenants] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarTenants().then(setTenants).catch((err) => setErro(err.message))
  }, [])

  if (erro) return <p className="erro">Não foi possível carregar os números ({erro}).</p>
  if (!tenants) return <p className="dica">Carregando…</p>

  const ativos = tenants.filter((t) => !tenantSuspenso(t)).length
  const suspensos = tenants.length - ativos
  const totalClientesFinais = tenants.reduce((soma, t) => soma + t.stats.clientes, 0)
  const tenantsMarine = tenants.filter((t) => t.apps_contratados?.includes('marine'))
  const totalOperacoesMarine = tenantsMarine.reduce((soma, t) => soma + (t.stats.operacoesMarine || 0), 0)
  const tenantsENautica = tenants.filter((t) => t.stats.matriculas)
  const matriculas = tenantsENautica.reduce((soma, t) => ({
    total: soma.total + t.stats.matriculas.total,
    pendentes: soma.pendentes + t.stats.matriculas.pendentes,
    aprovadas: soma.aprovadas + t.stats.matriculas.aprovadas,
    recusadas: soma.recusadas + t.stats.matriculas.recusadas,
  }), { total: 0, pendentes: 0, aprovadas: 0, recusadas: 0 })

  // Quantos tenants contrataram cada aplicação — só entram as que têm pelo
  // menos 1, pra não poluir o gráfico com fatias de valor zero.
  const contagemPorApp = APLICACOES
    .map((app) => ({ app, total: tenants.filter((t) => t.apps_contratados?.includes(app.chave)).length }))
    .filter((c) => c.total > 0)

  return (
    <div>
      <table className="tabela rvmaster-tabela-stats">
        <thead><tr><th className="col-indicador">Indicador</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td className="col-indicador">Clientes RV Invictus (tenants)</td><td>{tenants.length}</td></tr>
          <tr><td className="col-indicador">— ativos</td><td>{ativos}</td></tr>
          <tr><td className="col-indicador">— com acesso suspenso</td><td>{suspensos}</td></tr>
          <tr><td className="col-indicador">Cadastros finais (todos os tenants)</td><td>{totalClientesFinais}</td></tr>
          <tr><td className="col-indicador">RV Marine — operações registradas</td><td>{totalOperacoesMarine}</td></tr>
          {matriculas.total > 0 && (
            <>
              <tr><td className="col-indicador">RV e-Náutica — matrículas</td><td>{matriculas.total}</td></tr>
              <tr><td className="col-indicador">— pendentes</td><td>{matriculas.pendentes}</td></tr>
              <tr><td className="col-indicador">— aprovadas</td><td>{matriculas.aprovadas}</td></tr>
              <tr><td className="col-indicador">— recusadas</td><td>{matriculas.recusadas}</td></tr>
            </>
          )}
        </tbody>
      </table>

      <div className="rvmaster-pizzas">
        <GraficoPizza
          titulo="Clientes por status"
          fatias={[
            { label: 'Ativos', valor: ativos, cor: COR_ATIVO },
            { label: 'Acesso suspenso', valor: suspensos, cor: COR_SUSPENSO },
          ]}
        />
        {contagemPorApp.length > 0 && (
          <GraficoPizza
            titulo="Aplicações contratadas"
            fatias={contagemPorApp.map((c, i) => ({
              label: nomeCompleto(c.app),
              valor: c.total,
              cor: CORES_APPS[i % CORES_APPS.length],
            }))}
          />
        )}
        {matriculas.total > 0 && (
          <GraficoPizza
            titulo="Matrículas e-Náutica por status"
            fatias={[
              { label: 'Pendentes', valor: matriculas.pendentes, cor: CORES_MATRICULA.pendentes },
              { label: 'Aprovadas', valor: matriculas.aprovadas, cor: CORES_MATRICULA.aprovadas },
              { label: 'Recusadas', valor: matriculas.recusadas, cor: CORES_MATRICULA.recusadas },
            ]}
          />
        )}
      </div>
    </div>
  )
}
