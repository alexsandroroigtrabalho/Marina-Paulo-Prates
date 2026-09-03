Última rodada do dream: 2026-08-28T18:35Z (rodada manual, dentro da mesma conversa; sem entradas novas em session-log.md desde a rodada anterior)

# Registro cumulativo de observações — Marina Manager

Substitui a API de histórico de sessões que o `/dream` original (em `~/dream`)
usava — ver `.claude/skills/dream/SKILL.md`. Uma linha por observação, mais recente
no topo, no formato:

`- <data ISO> — [<correção|preferência|fato novo>] <descrição curta>`

Alimentado ao longo do trabalho normal no projeto (não só na hora do `/dream`).
Entradas datadas depois de "Última rodada do dream" acima são o que a próxima
rodada revisa; o `/dream` atualiza esse carimbo a cada rodada, tenha havido
proposta ou não.

- 2026-09-02 — [fato novo] O repo `Marina-Paulo-Prates` tem remote real no GitHub (`origin` = `https://github.com/alexsandroroigtrabalho/Marina-Paulo-Prates.git`, branch default, working tree limpo). Descoberta importante: dá pra sincronizar o espelho na nuvem com `git clone` direto desse remote (a rede da nuvem alcança o GitHub) em vez do processo manual de transferência por base64 — muito mais rápido e, principalmente, elimina o risco de erro de transcrição de um byte só (já aconteceu 2x nesta sessão: `apps.js` e `Layout.jsx`, ver sessões anteriores). Preferir `git clone`/`git pull` sempre que possível daqui pra frente; o processo base64+md5 fica só como plano B se o clone não estiver acessível.
- 2026-09-02 — [fato novo] O usuário (dono desta conta, aparentemente também operando como "Alex"/`alexsandroroigtrabalho` no GitHub) construiu, em paralelo a esta sessão (enquanto ela estava desconectada), um app RV Master completo (papel `rv_master`, `lib/rvMaster.js`, `TelaRvMaster.jsx`, `TelaPainelControleRvMaster.jsx`, `AcessoSuspenso.jsx`, `AplicacaoNaoContratada.jsx`), um sistema de subdomínio/sublink por cliente (`lib/tenant.js`, tabela `marinas_publicas`), e uma aplicação nova inteira, o RV e-Náutica (`enautica.js`, `TelaClienteENautica.jsx`, `TelaAlunosENautica.jsx`, etc.) — tudo isso construído em cima da migration `rv_master_tenant_management` que esta sessão já tinha aplicado antes. Nada foi perdido (o scaffolding de RV Master feito por esta sessão nunca chegou a sincronizar pro Mac), mas o espelho na nuvem ficou defasado por um tempo até ser reconciliado via `git clone` (ver entrada acima).
- 2026-09-02 — [fato novo] Confirmado ao vivo no Supabase (`yhioftajhsfpymrqaijd`): a policy `cliente_atualiza_proprios_dados` (UPDATE em `marina.clientes`, USING/WITH CHECK `user_id = auth.uid()`) e o trigger `protege_campos_admin_clientes_trigger` (BEFORE UPDATE, bloqueia campos administrativos/financeiros quando quem edita não é staff) existem e estão ativos exatamente como descrito em `supabase/sql/migration_cliente_edita_proprios_dados.sql` — a edição do próprio cadastro pelo cliente ("Minha conta" em TelaClienteDashboard.jsx) já estava implementada e é segura.
