import AplicacaoVendas from './AplicacaoVendas'

// O que o CLIENTE vê ao escolher, na tela de seleção, uma aplicação que
// ainda não foi desenvolvida (todas menos o RV Marine — ver `pronta` em
// lib/apps.js). A partir de 06/09/2026 (pedido do Alex: "vamos criar uma
// página de vendas dentro das aplicações não contratadas ou ainda não
// construídas") o conteúdo de verdade mora em AplicacaoVendas.jsx, a MESMA
// página usada por AplicacaoNaoContratada.jsx — este componente só existe
// pra manter o import/uso já feito em App.jsx sem precisar trocar nada lá.
export default function AplicacaoEmConstrucao({ app, onVoltar }) {
  return <AplicacaoVendas app={app} onVoltar={onVoltar} />
}
