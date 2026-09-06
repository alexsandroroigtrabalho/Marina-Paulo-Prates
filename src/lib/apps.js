import {
  IconAnchor, IconFileText, IconSchool, IconRuler2, IconTool, IconBoxMultiple, IconCoin,
} from '@tabler/icons-react'

// As aplicações da RV Invictus — fonte ÚNICA da lista, da ordem, do nome e
// das telas de cada uma. Usada nos dois lugares onde se escolhe uma
// aplicação, pra que os dois nunca divirjam:
//   - seleção do cliente, logo após o login (SelecaoAplicacoes.jsx)
//   - menu lateral do administrador (Layout.jsx), em formato de cartão
//     menor (pedido do Alex, 06/09/2026: "iguais aos botões das
//     aplicações quando o cliente acessa a plataforma, porém menores")
//
// `prefixo`/`nome` separados (em vez de um nome único "RV Marine") porque o
// seletor estiliza o "RV" e o nome da aplicação em tamanhos diferentes (ver
// .nav-app-item-prefixo/.nav-app-item-nome no index.css) — quem precisar do
// nome completo usa `nomeCompleto(app)` abaixo.
//
// `telas` são as telas da ÁREA ADMINISTRATIVA daquela aplicação, na ordem em
// que aparecem no menu lateral. Uma aplicação com `telas` vazio ainda não
// foi desenvolvida e mostra "Em construção" — é o único lugar a mexer
// quando uma delas ficar pronta. A chave de cada tela é resolvida em
// componente no App.jsx (COMPONENTES).
//
// `clientePronto` é separado de propósito: diz se a aplicação tem uma
// experiência para o CLIENTE FINAL, que é diferente da área administrativa.
// Hoje só o RV Marine tem (o painel do cliente); RV Finance e RV Manut já
// existem para a equipe da marina, mas o cliente ainda não entra neles.
export const APLICACOES = [
  {
    chave: 'marine', prefixo: 'RV', nome: 'Marine', clientePronto: true,
    telas: [
      { chave: 'vagas', label: 'Painel de Controle' },
      { chave: 'clientes', label: 'Clientes' },
      // Abastecimento saiu junto com tudo que envolvia pagamento e cobrança:
      // isso passa a ser assunto do RV Finance. O componente
      // (TelaAbastecimento.jsx) e as funções de banco continuam no projeto,
      // desligados da interface — mesmo tratamento dado ao Despachos, que
      // espera o RV Nautdoc.
      // Financeiro e Manutenção saíram daqui na Etapa 11, DEPOIS que o RV
      // Finance e o RV Manut já estavam funcionando com as mesmas telas
      // (TelaFinanceiro.jsx / TelaManutencao.jsx, reaproveitadas inteiras).
      // Nada foi apagado nem duplicado: os componentes, as tabelas
      // (cobrancas, ordens_servico), os relacionamentos, o histórico e as
      // policies continuam exatamente como estavam — só mudou em qual
      // aplicação o item aparece no menu.
    ],
  },
  { chave: 'nautdoc', prefixo: 'RV', nome: 'Nautdoc', clientePronto: false, telas: [] },
  // e-Náutica: sem NADA de pagamento/plano (diferente do rsnautica antigo,
  // que foi desligado) — o "gate" de acesso do aluno é a matrícula ser
  // aprovada pela equipe da escola (ver src/lib/enautica.js), não um
  // pagamento.
  //
  // 2 abas (TelaAlunosENautica.jsx + TelaAgendamentosENautica.jsx) — antes
  // eram 3 separadas (Matrículas / Agenda / Certificados), trocado a pedido
  // explícito do Alex: "Painel de Controle" traz a jornada por aluno
  // (trilha Matrícula → Agenda → Certificado, numa tabela só, com as ações
  // em massa de cada tela antiga reaproveitadas numa barra de seleção) e
  // "Agendamentos" traz só os compromissos já marcados (antes isso ficava
  // no topo do Painel de Controle; virou aba própria por ter mais o que
  // mostrar). Os 3 componentes antigos continuam no projeto, só não são
  // mais usados aqui — dá pra voltar trocando só esta lista.
  { chave: 'enautica', prefixo: 'RV', nome: 'e-Náutica', clientePronto: true, telas: [
    { chave: 'alunosEnautica', label: 'Painel de Controle' },
    { chave: 'agendamentosEnautica', label: 'Agendamentos' },
  ] },
  { chave: 'enge', prefixo: 'RV', nome: 'Enge', clientePronto: false, telas: [] },
  // manut/finance: telas vazias a pedido do Alex (06/09/2026, "o finanças
  // e manut estão com menu lateral flutuante... deixe as páginas com
  // formatação semelhante ao do nautdoc") — com `telas` preenchido a
  // sidebar se comportava como uma aplicação pronta (esconde/revela no
  // hover), diferente da sidebar sempre aberta + página de vendas que o
  // nautdoc/enge/stock já têm (ver `temTelas`/`sidebar-fixa` em
  // Layout.jsx e PaginaVendas.jsx em App.jsx). TelaManutencao.jsx e
  // TelaFinanceiro.jsx continuam intactos no projeto — só pararam de ser
  // referenciados por aqui; é só devolver a entrada de `telas` (igual à de
  // antes, comentada logo abaixo) pra reativar o menu de verdade.
  // telas: [{ chave: 'manutencao', label: 'Ordens de serviço' }],
  { chave: 'manut', prefixo: 'RV', nome: 'Manut', clientePronto: false, telas: [] },
  { chave: 'stock', prefixo: 'RV', nome: 'Stock', clientePronto: false, telas: [] },
  // telas: [{ chave: 'financeiro', label: 'Cobranças' }], (ver comentário
  // acima, em 'manut', mesmo motivo — TelaFinanceiro.jsx continua intacto).
  { chave: 'finance', prefixo: 'RV', nome: 'Finance', clientePronto: false, telas: [] },
]

// "Aplicação" própria do rv_master (não é uma das 7 de APLICACOES acima —
// não tem tenant nenhum, é a ferramenta da PRÓPRIA RV Invictus) — mesmo
// formato de `telas` das outras, pra a sidebar (Layout.jsx) desenhar o
// nome "RV MASTER" + a lista de telas do mesmo jeito dinâmico que já usa
// pras demais, em vez de um bloco fixo escrito à mão. "Painel de Controle"
// (TelaPainelControleRvMaster.jsx — números agregados em tabela + gráficos
// de pizza) fica em primeiro, "Clientes" (TelaRvMaster.jsx — cards de
// gestão por cliente: cadastrar, ligar/desligar aplicação, suspender)
// depois. Componentes resolvidos em App.jsx.
export const TELAS_RV_MASTER = [
  { chave: 'painel', label: 'Painel de Controle' },
  { chave: 'clientes', label: 'Clientes' },
]

export function buscarApp(chave) {
  return APLICACOES.find((a) => a.chave === chave) || null
}

export function nomeCompleto(app) {
  return app ? `${app.prefixo} ${app.nome}` : ''
}

// Uma aplicação está desenvolvida (para a equipe) quando tem pelo menos uma
// tela. Evita manter um segundo campo dizendo a mesma coisa, que poderia
// ficar desencontrado da lista de telas.
export function temTelas(app) {
  return !!app && app.telas.length > 0
}

export function primeiraTela(app) {
  return app?.telas?.[0]?.chave || null
}

// Ícone + descrição de uma linha por aplicação — usados tanto no cartão
// grande da seleção do cliente (SelecaoAplicacoes.jsx) quanto no cartão
// pequeno do menu lateral do administrador (Layout.jsx), pra manter os
// dois com a mesma identidade visual em vez de duas listas que podem
// divergir. Ficam aqui (não em cada componente) pela mesma razão de
// APLICACOES: fonte única.
export const ICONES_APLICACAO = {
  marine: IconAnchor,
  nautdoc: IconFileText,
  enautica: IconSchool,
  enge: IconRuler2,
  manut: IconTool,
  stock: IconBoxMultiple,
  finance: IconCoin,
}

// Todas no singular (pedido do Alex) — "documentos"/"projetos"/"ordens"/
// "cobranças" no plural soavam como se cada aplicação lidasse com uma
// COLEÇÃO de itens, quando a ideia é nomear a ÁREA/processo que ela cobre.
// nautdoc/enge/stock/finance trocados a pedido do Alex (06/09/2026): nomes
// compostos começam cada palavra com maiúscula (ex.: "Laudo e Projeto" —
// "e" de ligação continua minúsculo, mesmo padrão já usado em
// "Motonauta e Arrais Amador", ver lib/enautica.js).
// marina/náutica/serviço em maiúscula (pedido do Alex, 06/09/2026) — junto
// com o mesmo padrão de "nomes compostos começam cada palavra com
// maiúscula" já usado em nautdoc/enge/stock/finance (comentário acima).
export const DESCRICOES_APLICACAO = {
  marine: 'Gestão de Marina',
  nautdoc: 'Regularização',
  enautica: 'Escola Náutica',
  enge: 'Laudo e Projeto',
  manut: 'Ordem de Serviço',
  stock: 'Inventário',
  finance: 'Contabilidade',
}

// Lista curta de recursos por aplicação — usada nas páginas de vendas
// (PaginaVendas.jsx, pro lado do administrador, e AplicacaoVendas.jsx, pro
// lado do cliente) que aparecem no lugar de "Em construção"/"não faz parte
// do seu plano" (pedido do Alex, 06/09/2026: "vamos criar uma página de
// vendas dentro das aplicações não contratadas ou ainda não construídas").
// marine/enautica incluídas também (06/09/2026, segundo pedido): mesmo já
// tendo tela pronta e sendo as duas mais contratadas na prática, a página
// de vendas ainda pode aparecer pra uma marina/escola que não tenha
// nenhuma delas em `apps_contratados` — sem entrada aqui, caía no aviso
// genérico "ainda não está disponível", que fica errado pra uma aplicação
// que já existe e funciona (o certo é "não contratada", não "não pronta").
export const RECURSOS_APLICACAO = {
  marine: [
    'Cadastro completo de clientes e embarcações',
    'Agendamento de descidas e subidas, com fila de espera',
    'Controle de abastecimento, manutenção e documentação',
    'Painel de controle com o status de cada vaga em tempo real',
  ],
  enautica: [
    'Matrícula e acompanhamento do aluno até a certificação',
    'Agendamento de aulas teóricas e práticas',
    'Emissão de requerimentos e documentos da Capitania dos Portos',
    'Painel de controle por etapa: preparação, teórica e prática',
  ],
  nautdoc: [
    'Emissão e acompanhamento de processos na Capitania dos Portos',
    'Central de documentos por embarcação, com alertas de vencimento',
    'Regularização de registro, TIE e seguro obrigatório',
    'Histórico completo de cada processo, por cliente',
  ],
  enge: [
    'Laudos técnicos e vistorias de embarcações e estruturas',
    'Projetos e plantas com acompanhamento de aprovação',
    'Biblioteca organizada de laudos e projetos emitidos',
    'Assinatura e responsabilidade técnica documentadas',
  ],
  manut: [
    'Abertura e acompanhamento de ordens de serviço',
    'Histórico de manutenção por embarcação',
    'Controle de peças e insumos utilizados',
    'Status em tempo real para cliente e equipe',
  ],
  stock: [
    'Controle de estoque de peças e insumos',
    'Alertas automáticos de estoque mínimo',
    'Histórico completo de entradas e saídas',
    'Integração direta com ordens de serviço',
  ],
  finance: [
    'Cobranças e faturamento por cliente',
    'Conciliação financeira automatizada',
    'Relatórios de recebimentos e inadimplência',
    'Integração com o cadastro de clientes da marina',
  ],
}
