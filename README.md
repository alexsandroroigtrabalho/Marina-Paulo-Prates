# ⚓ Marina Manager

Plataforma de gerenciamento de marina — fila de rampa (retirada/retorno), cadastro de clientes e embarcações, financeiro/cobrança e manutenção/serviços.

Construída com a mesma stack usada no projeto RV Invictus (escola náutica):

| Camada | Tecnologia |
|---|---|
| Front-end | React + Vite |
| Banco de dados + autenticação | Supabase (PostgreSQL + Auth + RLS) |
| Hospedagem | Vercel |
| E-mails transacionais | Resend |
| Pagamentos | Mercado Pago (PIX, cartão, boleto) |
| Funções de servidor | Supabase Edge Functions |
| Ícones | Tabler Icons |
| Controle de versão | Git + GitHub |

## Identidade visual

A estrutura de telas e a paleta de cores foram extraídas do app de referência
"Marina Paulo Prates" (vídeo enviado pelo cliente) e aplicadas em `src/index.css`
e `src/lib/tema.js`:

| Uso | Cor |
|---|---|
| Cabeçalhos, ícones fortes | `#0E4461` |
| Botões, links, destaque, toggle ligado | `#26799F` |
| Fundo geral (com watermark sutil) | `#EEF7FA` |
| Pendências / inadimplência | `#D9713E` |

Fluxo de telas replicado: **Home** (seleção "Sou cliente" / "Administração") →
**Área do cliente** (login ou ficha de autocadastro) ou **Área da administração**
(login) → direto no **Painel de Controle** (menu lateral com os módulos), com a
tela "Clientes" reproduzindo o layout de cartões com selo numerado,
toggle de status e texto de pagamento em dia/pendente do app de referência.

## Estrutura

```
src/
├── App.jsx                   → Orquestra Home / Área do cliente / Administração
├── components/
│   ├── Home.jsx               → Landing: "Sou cliente" / "Administração"
│   ├── AreaCliente.jsx        → Login do cliente ou ir para a ficha de cadastro
│   ├── FichaCadastro.jsx      → Autocadastro do cliente + embarcações
│   ├── AdminLogin.jsx         → Login da administração
│   ├── TelaClienteDashboard.jsx → Visão do cliente logado (agendamentos/cobranças)
│   ├── Layout.jsx             → Menu lateral + navegação (área interna)
│   ├── TelaVagas.jsx          → Painel de Controle (visão TV: Fila de Rampa, abastecimento por card e status ao vivo) — tela inicial da área interna
│   ├── TelaClientes.jsx       → Clientes (clientes e embarcações)
│   ├── TelaFinanceiro.jsx     → Cobranças e pagamentos
│   └── TelaManutencao.jsx    → Ordens de serviço
└── lib/
    ├── supabase.js           → Cliente Supabase
    ├── db.js                 → Todas as operações de banco
    └── tema.js                → Branding por marina (multi-tenant)

supabase/
├── sql/schema.sql            → Tabelas + RLS
└── functions/
    ├── payment/index.ts      → Edge Function Mercado Pago
    └── send-email/index.ts   → Edge Function Resend
```

## Como rodar localmente

O banco já está configurado (projeto Supabase `rv-invictus`, schema `marina`, ver nota
em `supabase/sql/schema.sql`) e o `.env.local` já foi criado nesta pasta com as chaves
reais — só falta instalar e rodar:

1. Instale as dependências:
   ```
   npm install
   ```
2. Rode o projeto:
   ```
   npm run dev
   ```

Para configurar do zero em outro projeto Supabase: crie o projeto em
[supabase.com](https://supabase.com), rode `supabase/sql/schema.sql` no SQL Editor,
copie `.env.local.example` para `.env.local` e preencha com as chaves do seu projeto.

## Deploy

1. Suba o projeto no GitHub (veja abaixo).
2. Conecte o repositório na [Vercel](https://vercel.com) → New Project → Import Git Repository.
3. Configure as variáveis de ambiente (as mesmas do `.env.local`) no painel da Vercel.
4. Deploy automático a cada push.

## Módulos

- **Painel de Controle** *(diferencial competitivo — pensado para ficar aberto numa smart TV na marina, e é a tela inicial da área interna)* — relógio ao vivo, contadores de embarcações na água / pedidos de serviço em aberto / abastecimentos pendentes, e a **Fila de Rampa**: uma tabela em tempo real com cada notificação de descida ou subida, atualizada sozinha a cada 45s. Tela em `TelaVagas.jsx`. *Esta marina não trabalha com reserva de vaga/pier — só com a fila de retirada e retorno.*
  - Cada linha tem um indicativo luminoso: 🟢 verde para pedido de descida, 🔴 vermelho para pedido de subida.
  - Só existem 3 status por notificação: **Aguardando descida**, **Aguardando retorno** ou **Navegando**. Sem etapas intermediárias de "confirmado"/"em andamento" — o operador dá um clique ("Confirmar saída" / "Confirmar retorno") e o status muda na hora; uma notificação de descida confirmada vira automaticamente **Navegando**.
  - Não existe mais uma tela separada de Abastecimento: o pedido de combustível aparece **direto na linha da descida ou subida da embarcação**, mas só depois de já estar pago via Pix — o painel não tem opção de marcar "aguardando pagamento" ou "pago" (isso acontece automaticamente quando o pagamento real for confirmado). A única ação aqui é dar baixa: "Marcar entregue" depois de abastecer. Um pedido pago sem uma descida/subida em aberto correspondente aparece à parte, na seção "Abastecimento sem descida/subida em aberto". O botão "Gerenciar combustíveis", no topo do Painel de Controle, abre o cadastro de combustíveis (nome, preço por litro, estoque).
- **Clientes / Embarcações** — cadastro de sócios e das embarcações vinculadas a cada um.
- **Financeiro** — cobranças (mensalidade, serviço, multa), controle de pendente/pago, integração com Mercado Pago via Edge Function, mais a aba **Previsão de Caixa**: resumo de entradas previstas x recebidas por mês e lista de próximos vencimentos, calculado direto a partir das cobranças (sem precisar de lançamento/programação separados).
- **Manutenção** — ordens de serviço por embarcação (limpeza, motor, guincho, combustível, pintura), com status e prioridade.
- **Despachos** *(diferencial competitivo)* — controle de vencimento de documentos da embarcação (TIE, seguro, habilitação, vistoria), laudos técnicos emitidos por engenheiro responsável da marina, e acompanhamento de despachos junto à Capitania dos Portos.
- **Botão "Serviços" (dashboard do cliente)** — catálogo de serviços de despacho junto à Capitania dos Portos (registro/TIE, transferência de propriedade, alteração cadastral, baixa, CSN, CHA, regularizações etc.), curado a partir da Carta de Serviços ao Usuário da Agência da Capitania dos Portos em Tramandaí (`src/lib/servicosDespacho.js`). O cliente escolhe o serviço e a solicitação vira um registro em "despachos" para a equipe da marina tratar com a Capitania. *A solicitação de laudo técnico foi retirada do app do cliente* — como o laudo é pré-requisito de alguns desses serviços, é a própria marina que entra em contato quando ele for necessário.
- **Abastecimento (app do cliente)** — o cliente solicita abastecimento pelo app, escolhendo a embarcação, e o pedido já é vinculado automaticamente à descida ou subida em aberto mais próxima daquela embarcação, para aparecer no card certo no Painel de Controle. Ele recebe um QR de pagamento (Pix). *Hoje o QR é de demonstração* — para ativar o Pix real é preciso configurar uma conta Mercado Pago própria da marina (ver nota abaixo).
- **Pessoas autorizadas** — o próprio cliente cadastra quem mais pode retirar/devolver a embarcação em seu nome (filho, sócio, funcionário...). Ao pedir retirada/retorno, ele escolhe quem vai de fato buscar/entregar, e a administração vê esse nome na Fila de Rampa do Painel de Controle para conferir.
- **Notas fiscais (NFS-e)** — aba dentro do Financeiro para controlar quais cobranças precisam de nota fiscal de serviço. *Emissão real ainda não conectada* (ver nota abaixo) — hoje é um controle interno onde você registra o número da nota emitida pelo canal que já usa.

### ⚠️ Emissão real de NFS-e

NFS-e não tem padrão único no Brasil — cada prefeitura tem seu próprio sistema, e emitir de verdade exige inscrição municipal e, geralmente, certificado digital A1/A3. A tabela `notas_fiscais` já tem um campo `forma_emissao` (`manual` | `api`) pronto para o dia em que a marina configurar um provedor (ex: Focus NFe, NFE.io, PlugNotas) ou fizer a integração direta com a prefeitura — nesse momento, é só me avisar qual caminho vocês escolheram que eu conecto a emissão automática ali.

### ⚠️ Pagamento real do abastecimento (Mercado Pago)

O QR gerado hoje na tela de abastecimento é só de demonstração (`qr_code_demo = true` na tabela `pedidos_abastecimento`). O projeto já tem uma Edge Function pronta para gerar Pix real (`supabase/functions/payment`), mas **ela não pode reaproveitar a função `payment` já publicada no projeto Supabase**, porque esse projeto é compartilhado com a Escola Náutica (RV Invictus) e aquele slug já pertence ao pagamento de matrículas da escola — sobrescrever ia quebrar o fluxo deles. Quando você tiver uma conta Mercado Pago própria da marina, é só pedir para eu publicar essa função sob um nome próprio (ex: `marina-payment`) com o Access Token da marina, e trocar o QR de demonstração pelo Pix real.

## Trabalhando em equipe

Este repositório é privado no GitHub. Para colaborar:
1. O dono do repositório vai em **Settings → Collaborators and teams → Add people** e convida pelo usuário/e-mail do GitHub do colaborador.
2. O colaborador aceita o convite (chega por e-mail e nas notificações do GitHub).
3. A partir daí ele pode clonar, criar branches, dar push e abrir pull requests normalmente.
