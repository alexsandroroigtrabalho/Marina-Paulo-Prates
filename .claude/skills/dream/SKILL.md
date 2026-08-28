---
name: dream
description: Revisa o contexto recente do projeto Marina Manager (RV Invictus), compara com a memória persistente atual e propõe atualizações (correções, preferências repetidas, fatos novos, memórias desatualizadas, duplicatas). Invocado por /dream, por uma tarefa agendada noturna, ou quando o usuário pedir uma "consolidação de memória" / "revisão do dream".
---

# Dream — revisão noturna de memória (Marina Manager)

Rotina de consolidação de memória para o projeto Marina Manager / RV Invictus (repo
`Marina-Paulo-Prates`). Compara o que aconteceu recentemente com o que já está
gravado em `memory/` (neste mesmo repo) e propõe ajustes.

Adaptada do padrão original de `~/dream` no Mac do usuário — lá, o Passo 1 lê
sessões anteriores via ferramentas `mcp__ccd_session_mgmt__*` (de outro produto,
com histórico de sessões persistente). Este ambiente (Cowork, sobre o Claude Agent
SDK) não tem essa API: uma sessão nova nunca enxerga a transcrição de outra sessão,
nem desta nem de nenhuma conversa anterior. Por isso o Passo 1 aqui usa duas fontes
diferentes — ver abaixo. Todo o resto (índice de memória, propostas pendentes,
protocolo de aprovação) segue o mesmo desenho.

## Passo 1 — Coletar contexto recente

1. Se este `/dream` estiver sendo chamado DENTRO de uma conversa em andamento sobre
   o Marina Manager, releia essa própria conversa (as últimas dezenas de mensagens)
   como fonte primária — é o equivalente mais próximo de "ler a sessão atual".
2. Leia sempre `memory/session-log.md` (neste repo): é o registro cumulativo de
   observações — correções, preferências repetidas, fatos novos — que deve ser
   alimentado ao longo do trabalho normal no projeto (não só na hora do /dream).
   Esse arquivo existe justamente para suprir a falta de uma API de sessões
   anteriores: numa rodada automática (disparada pela tarefa agendada das 3h, numa
   sessão nova sem a conversa original), ele é a ÚNICA fonte de "o que aconteceu
   recentemente" — sem ele, a rodada não tem nada pra revisar.
3. Considere apenas entradas de `session-log.md` datadas depois do carimbo
   `Última rodada do dream:` no topo do próprio arquivo (evita reprocessar o que já
   foi revisado).
4. Se não houver entradas novas em `session-log.md` desde a última rodada, e não
   houver conversa interativa em andamento, não é erro — é só um período parado.
   Registre isso e siga direto para o Passo 6 com "nenhuma proposta nesta rodada".

## Passo 2 — Ler a memória atual

1. Leia `memory/MEMORY.md` (o índice).
2. Leia cada arquivo de memória referenciado nele.
3. Leia também `memory/dream-pending.md` se existir — pode haver propostas de uma
   rodada anterior ainda não aprovadas nem rejeitadas; não as duplique.
4. Leia também `CLAUDE.md` (raiz do repo) e, por alto, o `README.md` — o que já
   está documentado ali não precisa virar memória duplicada (ver Passo 3).

## Passo 3 — Identificar mudanças

Compare o contexto recente (Passo 1) com a memória atual (Passo 2) e separe achados
em 5 categorias:

- **Correções**: o usuário corrigiu algo que Claude fez ou assumiu.
- **Preferências repetidas**: algo que o usuário pediu mais de uma vez, ou confirmou
  como certo sem contestar (ex: "nunca fazer X", "sempre validar com esbuild antes
  de sincronizar").
- **Fatos novos**: informação sobre o usuário, o projeto Marina Manager, ou um
  sistema externo (Supabase, Vercel) que vale a pena guardar — e que NÃO já está
  coberta pelo `CLAUDE.md`, pelo `README.md`, ou derivável do próprio código/git
  (não duplicar o que já está versionado).
- **Memórias desatualizadas ou incorretas**: algo em `memory/*.md` que o contexto
  recente contradiz (ex: um comportamento que mudou, uma regra que foi substituída).
- **Duplicatas**: dois ou mais arquivos de memória dizendo essencialmente a mesma
  coisa.

Ignore ruído: detalhes efêmeros da tarefa em andamento (um valor de teste, um id de
commit específico) e qualquer coisa já coberta pelo código/git/CLAUDE.md/README.

## Passo 4 — Classificar cada achado

Para cada achado, decida:

- **Auto-aplicável** (aplique imediatamente, sem esperar aprovação):
  - erro de digitação/formatação dentro de um arquivo de memória existente;
  - ajuste puramente mecânico no índice `MEMORY.md` (link quebrado, entrada
    faltando para um arquivo que já existe, ordenação/formatação).
  - Isso NUNCA inclui apagar ou reescrever o conteúdo/sentido de uma memória — só
    corrigir a forma.
- **Requer aprovação** (tudo mais): criar memória nova, reescrever o conteúdo de
  uma memória existente, marcar uma memória como desatualizada/incorreta, remover
  uma memória, ou fundir duplicatas.

Regra de segurança: em caso de dúvida sobre se algo é "pequeno e seguro", trate
como "requer aprovação". Nunca exclua nem reescreva conteúdo de memória sem
aprovação explícita do usuário.

## Passo 5 — Aplicar as correções pequenas

Aplique agora as correções classificadas como auto-aplicáveis (Edit direto nos
arquivos, seguindo o fluxo de sincronização do `marina-manager-dev`: editar no
espelho, sincronizar pro Mac com guarda de mtime, commitar — nunca dar push).
Guarde uma lista curta do que foi corrigido para reportar ao usuário.

## Passo 6 — Apresentar as propostas que precisam de aprovação

1. Numere cada proposta (1, 2, 3, ...), com:
   - o achado (o que mudaria e em qual arquivo);
   - uma citação curta do contexto recente como evidência (conversa ou
     `session-log.md`, com data/trecho literal);
   - a ação proposta (criar / reescrever / marcar como desatualizada / fundir).
2. Grave essa lista em `memory/dream-pending.md`, mantendo os itens antigos ainda
   pendentes (renumerando se necessário) — formato:

   ```
   # Propostas pendentes do Dream — <data ISO da rodada>

   1. [<categoria>] <resumo de uma linha>
      Arquivo alvo: <memory/xxx.md ou "novo arquivo">
      Evidência: "<citação>" — <conversa/session-log>, <timestamp>
      Ação proposta: <texto exato ou diff resumido>

   2. ...
   ```

3. No chat, mostre a mesma lista numerada ao usuário e termine com um lembrete do
   protocolo de aprovação (Passo 7).
4. Atualize o carimbo `Última rodada do dream:` no topo de `memory/session-log.md`
   para agora, independentemente de ter havido proposta ou não — é isso que evita
   reprocessar as mesmas entradas na próxima rodada.

Se não houver nenhuma proposta que precise de aprovação nesta rodada, diga isso
explicitamente e não crie/edite `dream-pending.md` vazio à toa (pode deixá-lo
ausente ou apagado se ficar vazio).

## Passo 7 — Protocolo de aprovação

O usuário aprova respondendo, em qualquer sessão sobre este projeto (não precisa
ser a mesma sessão/conversa que gerou a proposta — só precisa ler
`memory/dream-pending.md` deste repo):

- `Dream apply [1, 2, 3]` — aplica só os itens com esses números;
- `Dream apply all` — aplica todos os itens ainda pendentes em `dream-pending.md`.

Ao receber uma dessas mensagens:

1. Leia `memory/dream-pending.md`.
2. Para cada número pedido (ou todos, no caso de `all`), aplique a ação descrita:
   crie/edite o(s) arquivo(s) de memória com uma estrutura simples e consistente
   (título, contexto, o fato/regra em si), e atualize `memory/MEMORY.md` de acordo.
3. Siga o mesmo fluxo de sincronização do `marina-manager-dev` (editar → validar se
   for código, não é o caso pra estes .md → sincronizar com guarda de mtime →
   commitar, sem dar push).
4. Remova do `dream-pending.md` os itens aplicados. Se um número pedido não existir
   mais na lista, avise o usuário em vez de inventar uma ação.
5. Se depois de aplicar não sobrar nenhum item, apague `dream-pending.md`.
6. Confirme ao usuário, em poucas linhas, o que foi de fato alterado.

Nunca aplique um item de `dream-pending.md` sem essa aprovação explícita, mesmo que
pareça óbvio — essa é a régua entre "auto-aplicável" (Passo 4/5) e "requer
aprovação" (Passo 6/7).

## Saída esperada de uma rodada normal de /dream

1. Uma frase dizendo o que foi revisado (conversa atual e/ou quantas entradas novas
   de `session-log.md`) e o período coberto.
2. O que foi auto-corrigido (se algo foi).
3. A lista numerada de propostas pendentes (se houver), com citação de evidência.
4. O lembrete de como aprovar (`Dream apply [...]` / `Dream apply all`).

## Alimentando session-log.md fora do /dream

Esta é a peça que substitui a API de sessões: ao trabalhar no Marina Manager (não
só quando o `/dream` for chamado), vale a pena registrar em `memory/session-log.md`
uma linha curta sempre que: o usuário corrigir algo que Claude tinha assumido
errado; o usuário repetir uma preferência/regra; ou surgir um fato novo sobre o
projeto que não está no código nem no README. Sem esse hábito, uma rodada noturna
automática (sessão nova, sem a conversa original) não tem nada pra revisar além do
que já está gravado.
