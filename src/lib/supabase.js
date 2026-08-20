import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados — crie um .env.local (veja .env.local.example)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// As tabelas da plataforma vivem no schema "marina" (não no "public"), para
// coexistir no mesmo projeto Supabase do RV Invictus sem colidir com as
// tabelas da escola náutica. Use `db` para todas as queries às tabelas do
// app (clientes, embarcacoes, vagas, reservas, cobrancas, ordens_servico,
// marinas, perfis) e `supabase` apenas para auth (`supabase.auth.*`).
export const db = supabase.schema('marina')
