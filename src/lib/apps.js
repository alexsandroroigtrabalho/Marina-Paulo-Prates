// As aplicações da RV Invictus — fonte ÚNICA da lista, da ordem, do nome e
// das telas de cada uma. Usada nos dois lugares onde se escolhe uma
// aplicação, pra que os dois nunca divirjam:
//   - seleção do cliente, logo após o login (SelecaoAplicacoes.jsx)
//   - menu lateral do administrador (Layout.jsx)
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
      // espera o RV NautDoc.
      // Financeiro e Manutenção saíram daqui na Etapa 11, DEPOIS que o RV
      // Finance e o RV Manut já estavam funcionando com as mesmas telas
      // (TelaFinanceiro.jsx / TelaManutencao.jsx, reaproveitadas inteiras).
      // Nada foi apagado nem duplicado: os componentes, as tabelas
      // (cobrancas, ordens_servico), os relacionamentos, o histórico e as
      // policies continuam exatamente como estavam — só mudou em qual
      // aplicação o item aparece no menu.
    ],
  },
  { chave: 'nautdoc', prefixo: 'RV', nome: 'NautDoc', clientePronto: false, telas: [] },
  // e-Náutica: sem NADA de pagamento/plano (diferente do rsnautica antigo,
  // que foi desligado) — o "gate" de acesso do aluno é a matrícula ser
  // aprovada pela equipe da escola (ver src/lib/enautica.js), não um
  // pagamento. Aulas/Agenda/Certificados ainda não têm tela própria —
  // "Matrículas" é a primeira (aprovar/recusar pedidos); o restante chega
  // nas próximas fases, já com o schema do banco pronto.
  { chave: 'enautica', prefixo: 'RV', nome: 'e-Náutica', clientePronto: true, telas: [
    { chave: 'matriculas', label: 'Matrículas' },
    { chave: 'enauticaAgenda', label: 'Agenda' },
    { chave: 'enauticaCertificados', label: 'Certificados' },
  ] },
  { chave: 'enge', prefixo: 'RV', nome: 'Enge', clientePronto: false, telas: [] },
  {
    chave: 'manut', prefixo: 'RV', nome: 'Manut', clientePronto: false,
    telas: [
      { chave: 'manutencao', label: 'Ordens de serviço' },
    ],
  },
  { chave: 'stock', prefixo: 'RV', nome: 'Stock', clientePronto: false, telas: [] },
  {
    chave: 'finance', prefixo: 'RV', nome: 'Finance', clientePronto: false,
    telas: [
      { chave: 'financeiro', label: 'Cobranças' },
    ],
  },
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
