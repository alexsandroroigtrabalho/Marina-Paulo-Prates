// Máscaras de formatação para campos de formulário — usadas em
// FichaCadastro.jsx (cadastro inicial), TelaClientes.jsx (cadastro/edição
// pela equipe) e TelaClienteDashboard.jsx ("Minha conta" do cliente).
//
// As duas funções são "à prova de colar": aceitam qualquer digitação
// (com ou sem pontuação já presente, colada de outro lugar, etc.) porque
// sempre partem de `valor.replace(/\D/g, '')` — extraem só os dígitos e
// remontam a máscara do zero a cada tecla, em vez de tentar inserir
// caracteres no meio do que já está digitado. Aceitam onChange (event ou
// string) devolvendo sempre o valor JÁ formatado, pronto pra ir direto no
// estado do formulário (value=... nos inputs correspondentes).
//
// Nenhuma delas valida — só formata visualmente. CPF/telefone inválidos
// continuam sendo aceitos pelo formulário (mesma tolerância que o cadastro
// já tinha antes das máscaras); validação de dígito verificador do CPF não
// foi pedida e ficaria fácil de gerar falso negativo com dados reais de
// clientes antigos.

// 000.000.000-00 — trava em 11 dígitos (CPF; não tenta virar CNPJ).
export function maskCpf(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11)
  return digitos
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// (00) 00000-0000 — celular com DDD, 11 dígitos. Números fixos (10
// dígitos, sem o 9) também formatam corretamente: o terceiro grupo cai
// pra 4 dígitos sozinho ((00) 0000-0000) porque a máscara é aplicada
// dígito a dígito, não por um comprimento fixo esperado.
export function maskTelefone(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11)
  if (digitos.length <= 10) {
    return digitos
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return digitos
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

// dd/mm/aaaa — usada no lugar do seletor nativo <input type="date"> em
// telas onde ele destoa do resto do formulário (ex.: modal de matrícula do
// RV e-Náutica, fundo escuro — o calendário nativo do navegador não
// acompanha o tema). Mesma técnica das duas máscaras acima: só dígitos,
// remontada do zero a cada tecla.
export function maskData(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 8)
  return digitos
    .replace(/(\d{2})(\d)/, '$1/$2')
    .replace(/(\d{2})(\d)/, '$1/$2')
}

// "dd/mm/aaaa" -> "aaaa-mm-dd" (formato que uma coluna `date` do Postgres
// espera). Devolve null se a data ainda não estiver completa/válida — quem
// chama decide o que fazer (normalmente: barrar o envio com uma mensagem,
// em vez de mandar uma data quebrada pro banco).
export function dataMascaradaParaIso(valor) {
  const m = String(valor || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dia, mes, ano] = m
  const data = new Date(`${ano}-${mes}-${dia}T12:00`)
  if (Number.isNaN(data.getTime()) || data.getUTCDate() !== Number(dia) || data.getUTCMonth() + 1 !== Number(mes)) return null
  return `${ano}-${mes}-${dia}`
}

// Caminho inverso de dataMascaradaParaIso — "aaaa-mm-dd" (o que vem do
// banco) -> "dd/mm/aaaa" (o que o campo mascarado mostra). Usada quando um
// formulário reabre um valor já salvo pra edição (ex.: "Meus dados" do
// e-Náutica, corrigindo uma data de nascimento que foi digitada errada).
export function isoParaDataMascarada(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const [, ano, mes, dia] = m
  return `${dia}/${mes}/${ano}`
}
