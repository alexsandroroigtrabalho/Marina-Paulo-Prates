// Tela "vazia" da área de conteúdo — logo vertical (brasão + RV INVICTUS,
// versão preta, arquivo oficial da identidade visual) centralizada como
// marca d'água. Dois usos:
// - Sem `texto`: estado ocioso, nenhuma aplicação escolhida ainda no menu
//   lateral (App.jsx, appSelecionada === null) — só a marca d'água, sem
//   nenhum texto de apoio.
// - Com `texto="Em construção"`: as aplicações ainda sem telas próprias,
//   que ainda não têm telas próprias.
// Mesma técnica (posição absoluta centralizada, opacidade 0.14) já usada em
// TelaDocumentacao.jsx (.pagina-marca-dagua-despachos) — aqui generalizada
// numa classe própria (.pagina-marca-dagua) e com a logo vertical em vez da
// horizontal, sem mexer naquela tela.
export default function PaginaMarcaDagua({ texto }) {
  return (
    <div className="pagina-marca-dagua">
      {texto && <p className="pagina-marca-dagua-texto">{texto}</p>}
    </div>
  )
}
