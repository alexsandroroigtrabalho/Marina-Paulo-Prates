/* ============================================================
 * Sinais sonoros do Painel de Controle (Fila de Rampa).
 *
 * Assim que uma notificação nova aparece, o painel toca sozinho:
 *  - Descida  → um apito longo (sinal de partida)
 *  - Retorno  → três apitos curtos
 *
 * O som é sintetizado na hora com a Web Audio API — não depende de nenhum
 * arquivo de áudio externo (nem de licença de uso). Osciladores numa oitava
 * grave, levemente dessintonizados entre si, dão o timbre "metálico" de
 * buzina de navio.
 * ============================================================ */

let contexto = null
function getContexto() {
  if (!contexto) contexto = new (window.AudioContext || window.webkitAudioContext)()
  return contexto
}

// Um apito: 3 osciladores (fundamental + 2 harmônicos) com envelope de
// ataque rápido e corte suave, pra não estourar nem cortar seco.
function tocarApito({ duracao, volume = 0.28, atraso = 0 }) {
  const c = getContexto()
  if (c.state === 'suspended') c.resume()
  const inicio = c.currentTime + atraso
  const fim = inicio + duracao

  const saida = c.createGain()
  saida.connect(c.destination)

  const harmonicos = [
    { freq: 138, ganho: 1 },
    { freq: 207, ganho: 0.45 },
    { freq: 276, ganho: 0.18 },
  ]

  harmonicos.forEach(({ freq, ganho }) => {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq

    const envelope = c.createGain()
    const pico = volume * ganho
    envelope.gain.setValueAtTime(0.0001, inicio)
    envelope.gain.exponentialRampToValueAtTime(pico, inicio + 0.09)
    envelope.gain.setValueAtTime(pico, Math.max(inicio + 0.09, fim - 0.15))
    envelope.gain.exponentialRampToValueAtTime(0.0001, fim)

    osc.connect(envelope)
    envelope.connect(saida)
    osc.start(inicio)
    osc.stop(fim + 0.05)
  })

  return fim
}

// Navegadores só deixam tocar áudio depois de alguma interação do usuário na
// página — por isso o painel mostra um botão "Ativar sons" que chama isso
// uma vez (e toca um apito curtinho de confirmação).
export function ativarSons() {
  tocarApito({ duracao: 0.2, volume: 0.15 })
}

// Descida: um apito longo (~4s) — sinal de partida.
export function tocarSinalDescida() {
  tocarApito({ duracao: 4, volume: 0.28 })
}

// Retorno: três apitos curtos, com pausa entre eles.
export function tocarSinalRetorno() {
  const duracao = 0.5
  const pausa = 0.28
  tocarApito({ duracao, volume: 0.28, atraso: 0 })
  tocarApito({ duracao, volume: 0.28, atraso: duracao + pausa })
  tocarApito({ duracao, volume: 0.28, atraso: 2 * (duracao + pausa) })
}
