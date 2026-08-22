/* ============================================================
 * Sinais sonoros do Painel de Controle (Fila de Rampa).
 *
 * Assim que uma notificação nova aparece, o painel toca sozinho:
 *  - Descida  → um apito longo (sinal de partida)
 *  - Retorno  → três apitos curtos
 *
 * Duas fontes de som, nessa ordem de preferência:
 *
 *  1) Gravação real: se existirem os arquivos `public/sons/buzina-longa.mp3`
 *     (descida) e `public/sons/buzina-curta.mp3` (retorno — este é tocado 3x
 *     em sequência), o painel toca essa gravação. Não vêm nenhum arquivo
 *     junto por padrão — o ambiente onde este código é escrito não tem
 *     acesso à internet pra baixar um som de buzina de verdade com licença
 *     verificada. Pra usar uma gravação real: baixe um efeito sonoro de
 *     buzina de navio de um banco de som livre (ex: bigsoundbank.com,
 *     orangefreesounds.com, freesound.org — prefira licença CC0/domínio
 *     público) e salve os arquivos com esses dois nomes exatos dentro de
 *     `public/sons/`. Não precisa mexer em nenhum código depois disso.
 *
 *  2) Som sintetizado (fallback automático): se os arquivos acima não
 *     existirem (ou falharem ao carregar), o painel gera o som na hora via
 *     Web Audio API — fundamental grave + harmônicos + uma camada de ruído
 *     filtrado por baixo do tom, imitando o "ar comprimido" de uma buzina
 *     pneumática real. Não depende de nenhum arquivo externo.
 * ============================================================ */

const ARQUIVO_LONGO = '/sons/buzina-longa.mp3'
const ARQUIVO_CURTO = '/sons/buzina-curta.mp3'

let contexto = null
function getContexto() {
  if (!contexto) contexto = new (window.AudioContext || window.webkitAudioContext)()
  return contexto
}

// Toca um arquivo de áudio e resolve quando termina; rejeita se o arquivo
// não existir/não carregar (aí quem chamou cai pro som sintetizado).
function tocarArquivo(caminho, volume = 0.6) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(caminho)
    audio.volume = volume
    audio.addEventListener('ended', () => resolve(), { once: true })
    audio.addEventListener('error', () => reject(new Error('arquivo indisponível')), { once: true })
    audio.play().catch(reject)
  })
}

function pausa(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Buffer de ruído branco (usado só pra dar textura de "ar" por baixo do tom
// sintetizado — não é o som inteiro, só uma camada bem discreta).
function ruidoBuffer(c, duracaoSegundos) {
  const tamanho = Math.ceil(c.sampleRate * duracaoSegundos)
  const buffer = c.createBuffer(1, tamanho, c.sampleRate)
  const dados = buffer.getChannelData(0)
  for (let i = 0; i < tamanho; i++) dados[i] = Math.random() * 2 - 1
  return buffer
}

// Um apito sintetizado: fundamental + harmônicos com leve variação de
// afinação ao longo do tempo (como um compressor de ar real, que nunca
// segura a nota perfeitamente estável) e uma camada de ruído filtrado por
// baixo — dá a sensação de ar comprimido saindo, em vez de um tom digital puro.
function tocarApitoSintetizado({ duracao, volume = 0.28, atraso = 0 }) {
  const c = getContexto()
  if (c.state === 'suspended') c.resume()
  const inicio = c.currentTime + atraso
  const fim = inicio + duracao

  const saida = c.createGain()
  saida.connect(c.destination)

  const fundamental = 115
  const harmonicos = [
    { mult: 1, ganho: 1 },
    { mult: 1.5, ganho: 0.4 },
    { mult: 2, ganho: 0.22 },
    { mult: 3, ganho: 0.09 },
  ]

  harmonicos.forEach(({ mult, ganho }) => {
    const freq = fundamental * mult
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq, inicio)
    osc.frequency.linearRampToValueAtTime(freq * 1.006, fim)

    const envelope = c.createGain()
    const pico = volume * ganho
    envelope.gain.setValueAtTime(0.0001, inicio)
    envelope.gain.exponentialRampToValueAtTime(pico, inicio + 0.07)
    envelope.gain.setValueAtTime(pico, Math.max(inicio + 0.07, fim - 0.15))
    envelope.gain.exponentialRampToValueAtTime(0.0001, fim)

    osc.connect(envelope)
    envelope.connect(saida)
    osc.start(inicio)
    osc.stop(fim + 0.05)
  })

  // Camada de ruído (ar comprimido) — bem baixa, só pra textura.
  const ruido = c.createBufferSource()
  ruido.buffer = ruidoBuffer(c, duracao + 0.1)
  const filtro = c.createBiquadFilter()
  filtro.type = 'bandpass'
  filtro.frequency.value = 850
  filtro.Q.value = 0.5
  const ganhoRuido = c.createGain()
  const picoRuido = volume * 0.06
  ganhoRuido.gain.setValueAtTime(0.0001, inicio)
  ganhoRuido.gain.exponentialRampToValueAtTime(picoRuido, inicio + 0.08)
  ganhoRuido.gain.setValueAtTime(picoRuido, Math.max(inicio + 0.08, fim - 0.15))
  ganhoRuido.gain.exponentialRampToValueAtTime(0.0001, fim)
  ruido.connect(filtro)
  filtro.connect(ganhoRuido)
  ganhoRuido.connect(saida)
  ruido.start(inicio)
  ruido.stop(fim + 0.05)

  return fim
}

// Navegadores só deixam tocar áudio depois de alguma interação do usuário na
// página — por isso o painel mostra um botão "Ativar sons" que chama isso
// uma vez (e toca um apito curtinho de confirmação).
export function ativarSons() {
  tocarApitoSintetizado({ duracao: 0.2, volume: 0.15 })
}

// Descida: apito(s) longo(s) (~4s cada) — sinal de partida. A quantidade é
// configurável pela administração (Painel de Controle → engrenagem →
// "Configurar apitos"); por padrão é 1. Tenta a gravação real primeiro; se
// não existir, usa o som sintetizado — nos dois casos, repete "vezes" vezes.
export async function tocarSinalDescida(vezes = 1) {
  const n = Math.max(1, Number(vezes) || 1)
  for (let i = 0; i < n; i++) {
    try {
      await tocarArquivo(ARQUIVO_LONGO)
    } catch {
      tocarApitoSintetizado({ duracao: 4, volume: 0.28 })
      await pausa(4200)
    }
    if (i < n - 1) await pausa(500)
  }
}

// Retorno: apitos curtos em sequência, com pausa entre eles. Quantidade
// configurável pela administração; por padrão são 3. Mesma lógica: gravação
// real (tocada "vezes" vezes em sequência) ou, se não existir, som sintetizado.
export async function tocarSinalRetorno(vezes = 3) {
  const n = Math.max(1, Number(vezes) || 1)
  try {
    for (let i = 0; i < n; i++) {
      await tocarArquivo(ARQUIVO_CURTO)
      if (i < n - 1) await pausa(280)
    }
  } catch {
    const duracao = 0.5
    const intervalo = 0.28
    for (let i = 0; i < n; i++) {
      tocarApitoSintetizado({ duracao, volume: 0.28, atraso: i * (duracao + intervalo) })
    }
  }
}
