// Lógica de branding por marina (multi-tenant), mesmo padrão do RV Invictus.
// Paleta padrão extraída do app de referência "Marina Paulo Prates"
export const TEMA_PADRAO = {
  corPrimaria: '#0E4461',
  corSecundaria: '#26799F',
  logoUrl: null,
  nomeExibicao: 'Marina Paulo Prates',
  // Link de pagamento da marina, mostrado em "Serviços → Pagamentos" no
  // painel do cliente (ex: link de cobrança do Mercado Pago, PagSeguro
  // etc.). Fica null até a marina configurar sua conta de recebimento —
  // a tela de Pagamentos mostra um aviso enquanto isso.
  linkPagamento: null,
}

export function aplicarTema(configJson) {
  const tema = { ...TEMA_PADRAO, ...(configJson || {}) }
  document.documentElement.style.setProperty('--cor-primaria', tema.corPrimaria)
  document.documentElement.style.setProperty('--cor-secundaria', tema.corSecundaria)
  return tema
}
