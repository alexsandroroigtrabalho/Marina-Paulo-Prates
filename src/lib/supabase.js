import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados — crie um .env.local (veja .env.local.example)')
}

// persistSession: false — o login é pedido SEMPRE, a cada carregamento da
// página, mesmo para quem já entrou antes. Sem isso o Supabase guarda a
// sessão no navegador e devolve a pessoa direto pra dentro do sistema, o que
// impedia conferir as telas de entrada (login, cadastro, recuperação) sem
// deslogar a cada vez.
//
// A sessão continua valendo normalmente ENQUANTO a página está aberta:
// navegar entre telas, trocar de aplicação e usar o sistema não pedem senha
// de novo — só recarregar ou reabrir pede.
//
// detectSessionInUrl continua ligado (padrão): é o que faz o link de
// redefinição de senha do e-mail ser reconhecido ao abrir a página.
//
// ATENÇÃO: isto é o comportamento pedido para a fase de desenvolvimento.
// Antes de abrir a plataforma para os clientes, reavaliar — no uso diário,
// principalmente no celular, digitar a senha a cada abertura é bem custoso.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
})

// As tabelas da plataforma vivem no schema "marina" (não no "public"), para
// coexistir no mesmo projeto Supabase do RV Invictus sem colidir com as
// tabelas da escola náutica. Use `db` para todas as queries às tabelas do
// app (clientes, embarcacoes, vagas, reservas, cobrancas, ordens_servico,
// marinas, perfis) e `supabase` apenas para auth (`supabase.auth.*`).
export const db = supabase.schema('marina')

// Schema próprio do RV e-Náutica (matrículas, agenda de aulas,
// certificados) — mesma convenção do `db` acima, só que apontando pro
// schema `enautica` em vez de `marina`. O cadastro do aluno em si continua
// em marina.clientes (ver src/lib/enautica.js): só o que é específico da
// aplicação e-Náutica mora aqui.
//
// ATENÇÃO — passo manual pendente: assim como "marina", o schema
// "enautica" precisa estar na lista de "Exposed schemas" em Supabase →
// Project Settings → Data API, senão toda chamada por aqui devolve erro
// "schema must be one of the following: ...". Não existe jeito de fazer
// isso por SQL/migração — é ajuste de configuração da API, só pelo painel.
export const dbEnautica = supabase.schema('enautica')
