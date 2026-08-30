import { db } from './supabase'

// Resolve qual cliente RV Invictus (marina ou escola) corresponde ao
// sublink que o visitante está usando agora — a base do frontend da Parte
// 2 do RV Master (ver TelaRvMaster.jsx / lib/rvMaster.js:
// DOMINIO_BASE_SUBLINK e sublinkPrevisto). Continua precisando dos dois
// passos manuais fora do código (domínio curinga *.rvinvictus.com.br no
// Vercel + registro DNS curinga no Registro.br) pra um hostname de
// verdade bater aqui — até esses dois passos serem feitos, todo hostname
// (localhost, o domínio principal, previews do Vercel) cai no fallback
// null, e quem chama esta função usa o comportamento de sempre
// (VITE_MARINA_ID fixo, ver FichaCadastro.jsx).
//
// Só resolve pelo NOME do host (não muda rota nem exige subpasta) —
// mesma ideia do `HOSTNAME_TO_SLUG` do rsnautica antigo, só que dinâmico
// (lê o slug direto de marina.marinas_publicas em vez de um mapa fixo no
// código, porque agora são vários clientes, cadastrados pelo RV Master,
// não uma lista curta hardcoded).
const DOMINIO_BASE = 'rvinvictus.com.br'

function slugDoHostnameAtual() {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname
  const sufixo = `.${DOMINIO_BASE}`
  if (!host.endsWith(sufixo)) return null
  const sub = host.slice(0, -sufixo.length)
  // "www" e o domínio principal do painel (ex: manager.rvinvictus.com.br)
  // não são sublink de cliente nenhum.
  if (!sub || sub === 'www' || sub === 'manager') return null
  return sub
}

// Memoiza dentro da mesma carga de página — o hostname não muda em
// runtime, então resolve no banco só uma vez por sessão de navegador.
let cachePromise

// { id, nome, slug } do tenant do sublink atual, ou null se o hostname
// atual não é um sublink de cliente (domínio principal, localhost,
// preview do Vercel, ou um slug que ainda não existe/está sem sublink).
export function resolverMarinaPeloSublink() {
  if (!cachePromise) {
    const slug = slugDoHostnameAtual()
    cachePromise = slug
      ? db.from('marinas_publicas').select('*').eq('slug', slug).maybeSingle()
        .then(({ data, error }) => (error ? null : data))
        .catch(() => null)
      : Promise.resolve(null)
  }
  return cachePromise
}
