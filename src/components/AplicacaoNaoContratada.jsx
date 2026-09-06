import AplicacaoVendas from './AplicacaoVendas'

// O que o CLIENTE vê ao escolher uma aplicação que EXISTE e já está pronta,
// mas que não faz parte do contrato da própria marina/escola —
// `apps_contratados` em marina.marinas. A partir de 06/09/2026 (pedido do
// Alex: "vamos criar uma página de vendas dentro das aplicações não
// contratadas ou ainda não construídas") o conteúdo de verdade mora em
// AplicacaoVendas.jsx, a MESMA página usada por AplicacaoEmConstrucao.jsx —
// este componente só existe pra manter o import/uso já feito em App.jsx
// sem precisar trocar nada lá.
//
// Só a RV Master decide quem contratou o quê (trava já existe no banco) —
// por isso a página aponta pra "fale com a RV Invictus", nunca oferece um
// jeito de o próprio tenant liberar isso sozinho.
export default function AplicacaoNaoContratada({ app, onVoltar }) {
  return <AplicacaoVendas app={app} onVoltar={onVoltar} />
}
