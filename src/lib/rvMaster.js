import { db, dbEnautica } from './supabase'

// Tudo que a tela do RV Master (TelaRvMaster.jsx) precisa: a lista de
// tenants (marina.marinas — cada linha é um cliente nosso, marina ou
// escola náutica, ver decisão já tomada com o Alex) com estatísticas
// básicas, segmentadas por aplicação contratada. Só quem é rv_master
// consegue de fato ler os dados por trás disso — as policies
// `rv_master_acesso_total`/`rv_master_ve_clientes`/`rv_master_matriculas`
// (ver migrações rv_master_acesso_teste_enautica e
// rv_master_acesso_total_e_slug) liberam exatamente esse alcance.
//
// O "sublink" (slug) é o preparo pro subdomínio próprio por cliente
// (Parte 2, ainda sem o domínio curinga configurado no Vercel/DNS — ver
// nota em App.jsx) — aqui só monta a URL prevista, não significa que ela já
// responde.
export const DOMINIO_BASE_SUBLINK = 'rvinvictus.com.br'

export function sublinkPrevisto(marina) {
  return marina.slug ? `${marina.slug}.${DOMINIO_BASE_SUBLINK}` : null
}

// Uma contagem simples (`head: true, count: 'exact'`) não baixa as linhas,
// só o total — mais barato que listar tudo pra contar no cliente.
async function contar(query) {
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

// Liga/desliga aplicações contratadas de um cliente — usado pelo seletor de
// checkboxes na TelaRvMaster. Só funciona de verdade pra quem está logado
// como rv_master: a policy `rv_master_atualiza_marinas` (RLS) e o trigger
// `protege_apps_contratados` (migração do colega, rv_master_tenant_management)
// travam esse UPDATE pra qualquer outro papel, checando auth.uid() na hora —
// diferente do ajuste manual via SQL feito no piloto do e-Náutica (aquele
// precisou desligar o trigger porque rodava fora de uma sessão de usuário).
export async function atualizarAppsContratados(tenantId, apps) {
  const { error } = await db.from('marinas').update({ apps_contratados: apps }).eq('id', tenantId)
  if (error) throw error
}

export async function listarTenants() {
  const { data: marinas, error } = await db.from('marinas').select('*').order('nome')
  if (error) throw error

  return Promise.all((marinas || []).map(async (m) => {
    const apps = m.apps_contratados || []
    const stats = { clientes: 0 }

    // Clientes cadastrados: conta pra qualquer tenant, é o cadastro único
    // reaproveitado entre aplicações (ver decisão marina.clientes = "cliente
    // final da RV Invictus", não só do RV Marine).
    stats.clientes = await contar(db.from('clientes').select('id', { count: 'exact', head: true }).eq('marina_id', m.id))

    // Daqui pra baixo, só busca o que a aplicação contratada realmente usa
    // — evita 6 queries vazias pra um tenant que só tem "marine", por
    // exemplo.
    if (apps.includes('marine')) {
      stats.operacoesMarine = await contar(db.from('agendamentos').select('id', { count: 'exact', head: true }).eq('marina_id', m.id))
    }
    if (apps.includes('enautica')) {
      const { data: matriculas, error: erroMat } = await dbEnautica.from('matriculas').select('status').eq('marina_id', m.id)
      if (erroMat) throw erroMat
      stats.matriculas = {
        total: matriculas?.length || 0,
        pendentes: matriculas?.filter((x) => x.status === 'pendente').length || 0,
        aprovadas: matriculas?.filter((x) => x.status === 'aprovada').length || 0,
        recusadas: matriculas?.filter((x) => x.status === 'recusada').length || 0,
      }
    }

    return { ...m, stats }
  }))
}
