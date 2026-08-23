// As 4 aplicações da RV Invictus, selecionáveis no menu lateral (Layout.jsx)
// — só RV Marine tem telas prontas hoje (ver TELAS em App.jsx); as outras 3
// mostram só "Em construção" com a marca d'água (PaginaMarcaDagua.jsx) até
// serem desenvolvidas. Fonte única da lista/ordem/nome — usada tanto pelo
// seletor da sidebar (Layout.jsx) quanto pelo título de página (App.jsx),
// pra nunca divergir entre os dois.
//
// `prefixo`/`nome` separados (em vez de um nome único "RV Marine") porque o
// seletor da sidebar estiliza o "RV" e o nome da aplicação em tamanhos
// diferentes (ver .nav-app-item-prefixo/.nav-app-item-nome no index.css) —
// quem precisar do nome completo usa `${prefixo} ${nome}`.
export const APLICACOES = [
  { chave: 'marine', prefixo: 'RV', nome: 'Marine' },
  { chave: 'nautdoc', prefixo: 'RV', nome: 'NautDoc' },
  { chave: 'enautica', prefixo: 'RV', nome: 'e-Náutica' },
  { chave: 'engenharia', prefixo: 'RV', nome: 'Engenharia' },
]
