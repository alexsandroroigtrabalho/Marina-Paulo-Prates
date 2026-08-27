// As aplicações da RV Invictus — fonte ÚNICA da lista, da ordem e do nome.
// Usada nos dois lugares onde o usuário escolhe uma aplicação, pra que os
// dois nunca divirjam:
//   - seleção do cliente, logo após o login (SelecaoAplicacoes.jsx)
//   - menu lateral do administrador (Layout.jsx)
//
// `prefixo`/`nome` separados (em vez de um nome único "RV Marine") porque o
// seletor estiliza o "RV" e o nome da aplicação em tamanhos diferentes (ver
// .nav-app-item-prefixo/.nav-app-item-nome no index.css) — quem precisar do
// nome completo usa `nomeCompleto(app)` abaixo.
//
// `pronta` diz se a aplicação já tem telas de verdade. Só o RV Marine tem
// hoje; as demais entram no lugar certo da lista desde já, mas levam à tela
// "Em construção" (mesma regra pro cliente e pro administrador) até serem
// desenvolvidas. É o único ponto a mudar quando uma delas ficar pronta.
export const APLICACOES = [
  { chave: 'marine', prefixo: 'RV', nome: 'Marine', pronta: true },
  { chave: 'nautdoc', prefixo: 'RV', nome: 'NautDoc', pronta: false },
  { chave: 'enautica', prefixo: 'RV', nome: 'e-Náutica', pronta: false },
  { chave: 'enge', prefixo: 'RV', nome: 'Enge', pronta: false },
  { chave: 'manut', prefixo: 'RV', nome: 'Manut', pronta: false },
  { chave: 'stock', prefixo: 'RV', nome: 'Stock', pronta: false },
  { chave: 'finance', prefixo: 'RV', nome: 'Finance', pronta: false },
]

export function buscarApp(chave) {
  return APLICACOES.find((a) => a.chave === chave) || null
}

export function nomeCompleto(app) {
  return app ? `${app.prefixo} ${app.nome}` : ''
}
