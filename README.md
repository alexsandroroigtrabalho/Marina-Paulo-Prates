# ⚓ Marina Manager

Plataforma de gerenciamento de marina — reservas de vagas/atracação, cadastro de clientes e embarcações, financeiro/cobrança e manutenção/serviços.

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
(login) → **Painel da marina** (cards de navegação) → módulos internos, com a
"Planilha de cadastros" reproduzindo o layout de cartões com selo numerado,
toggle de status e texto de pagamento em dia/pendente do app de referência.

## Estrutura

```
src/
├── App.jsx                   → Orquestra Home / Área do cliente / Administração / Painel
├── components/
│   ├── Home.jsx               → Landing: "Sou cliente" / "Administração"
│   ├── AreaCliente.jsx        → Login do cliente ou ir para a ficha de cadastro
│   ├── FichaCadastro.jsx      → Autocadastro do cliente + embarcações
│   ├── AdminLogin.jsx         → Login da administração
│   ├── PainelMarina.jsx       → Cards de navegação (painel interno)
│   ├── TelaClienteDashboard.jsx → Visão do cliente logado (reservas/cobranças)
│   ├── Layout.jsx             → Menu lateral + navegação (área interna)
│   ├── TelaVagas.jsx          → Reserva de vagas / atracação
│   ├── TelaClientes.jsx       → Planilha de cadastros (clientes e embarcações)
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

- **Vagas / Atracação** — grade visual das vagas, reserva vinculando cliente + embarcação + período.
- **Clientes / Embarcações** — cadastro de sócios e das embarcações vinculadas a cada um.
- **Financeiro** — cobranças (mensalidade, serviço, multa), controle de pendente/pago, integração com Mercado Pago via Edge Function.
- **Manutenção** — ordens de serviço por embarcação (limpeza, motor, guincho, combustível, pintura), com status e prioridade.

## Trabalhando em equipe

Este repositório é privado no GitHub. Para colaborar:
1. O dono do repositório vai em **Settings → Collaborators and teams → Add people** e convida pelo usuário/e-mail do GitHub do colaborador.
2. O colaborador aceita o convite (chega por e-mail e nas notificações do GitHub).
3. A partir daí ele pode clonar, criar branches, dar push e abrir pull requests normalmente.
