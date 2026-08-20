// Lógica de branding por marina (multi-tenant), mesmo padrão do RV Invictus.
// Paleta padrão extraída do app de referência "Marina Paulo Prates"
export const TEMA_PADRAO = {
  corPrimaria: '#0E4461',
  corSecundaria: '#26799F',
  logoUrl: null,
  nomeExibicao: 'Minha Marina',
}

export function aplicarTema(configJson) {
  const tema = { ...TEMA_PADRAO, ...(configJson || {}) }
  document.documentElement.style.setProperty('--cor-primaria', tema.corPrimaria)
  document.documentElement.style.setProperty('--cor-secundaria', tema.corSecundaria)
  return tema
}
