/* ============================================================
 * Clima do Painel de Controle — usa a API pública Open-Meteo (gratuita,
 * sem chave de API) pra mostrar temperatura, condição do tempo e vento
 * em tempo real na tela que a equipe deixa aberta na marina.
 *
 * A previsão reflete a localidade de CADA marina, não mais uma cidade fixa:
 * marinas.config_json guarda `climaLatitude`/`climaLongitude`/`climaLocal`
 * (mesmo padrão já usado pra apitos/e-mail do relatório de documentos —
 * ver ConfiguracoesPainel.jsx, categoria "Agenda"), preenchidos pelo
 * administrador buscando a cidade da própria marina (geocodePorCidade,
 * abaixo). Torres/RS continua como padrão só até a marina configurar a
 * própria localidade — mantém o comportamento de sempre pra quem ainda não
 * mexeu nessa configuração.
 * ============================================================ */
const LATITUDE_PADRAO = -29.33528
const LONGITUDE_PADRAO = -49.72694
const LOCAL_PADRAO = 'Torres/RS'

// Códigos de tempo WMO (padrão retornado pela Open-Meteo) mapeados pro
// português e pra um dos 5 ícones usados no widget.
const DESCRICAO_POR_CODIGO = {
  0: { texto: 'Céu limpo', icone: 'sol' },
  1: { texto: 'Poucas nuvens', icone: 'sol' },
  2: { texto: 'Parcialmente nublado', icone: 'nuvem' },
  3: { texto: 'Nublado', icone: 'nuvem' },
  45: { texto: 'Nevoeiro', icone: 'nuvem' },
  48: { texto: 'Nevoeiro com geada', icone: 'nuvem' },
  51: { texto: 'Garoa fraca', icone: 'chuva' },
  53: { texto: 'Garoa', icone: 'chuva' },
  55: { texto: 'Garoa forte', icone: 'chuva' },
  56: { texto: 'Garoa congelante', icone: 'chuva' },
  57: { texto: 'Garoa congelante forte', icone: 'chuva' },
  61: { texto: 'Chuva fraca', icone: 'chuva' },
  63: { texto: 'Chuva', icone: 'chuva' },
  65: { texto: 'Chuva forte', icone: 'chuva' },
  66: { texto: 'Chuva congelante', icone: 'chuva' },
  67: { texto: 'Chuva congelante forte', icone: 'chuva' },
  71: { texto: 'Neve fraca', icone: 'neve' },
  73: { texto: 'Neve', icone: 'neve' },
  75: { texto: 'Neve forte', icone: 'neve' },
  77: { texto: 'Grãos de neve', icone: 'neve' },
  80: { texto: 'Pancadas de chuva fracas', icone: 'chuva' },
  81: { texto: 'Pancadas de chuva', icone: 'chuva' },
  82: { texto: 'Pancadas de chuva fortes', icone: 'chuva' },
  85: { texto: 'Pancadas de neve fracas', icone: 'neve' },
  86: { texto: 'Pancadas de neve fortes', icone: 'neve' },
  95: { texto: 'Trovoada', icone: 'tempestade' },
  96: { texto: 'Trovoada com granizo', icone: 'tempestade' },
  99: { texto: 'Trovoada com granizo forte', icone: 'tempestade' },
}

export function descreverClima(codigo) {
  return DESCRICAO_POR_CODIGO[codigo] || { texto: 'Indisponível', icone: 'nuvem' }
}

// `localizacao` é o que vem de marinas.config_json — { latitude, longitude,
// local }. Qualquer parte que faltar (marina que ainda não configurou a
// própria localidade) cai no padrão de Torres/RS, exatamente o
// comportamento de antes.
export async function buscarClimaAtual(localizacao) {
  const latitude = localizacao?.latitude ?? LATITUDE_PADRAO
  const longitude = localizacao?.longitude ?? LONGITUDE_PADRAO
  const local = localizacao?.local || LOCAL_PADRAO
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,wind_speed_10m,weather_code&timezone=America%2FSao_Paulo`
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error('Não foi possível obter o clima agora.')
  const dados = await resposta.json()
  const atual = dados.current
  const { texto, icone } = descreverClima(atual.weather_code)
  return {
    local,
    temperatura: Math.round(atual.temperature_2m),
    descricao: texto,
    icone,
    velocidadeVento: Math.round(atual.wind_speed_10m),
  }
}

// Geocodificação por nome de cidade (ex: "Torres, RS" ou "Búzios, RJ"),
// usada pelo administrador em Configurações → Agenda pra configurar a
// localidade da própria marina sem precisar descobrir latitude/longitude na
// mão. Mesma API Open-Meteo, sem chave — o endpoint de geocoding é
// separado do de previsão.
export async function geocodePorCidade(nomeCidade) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nomeCidade)}&count=1&language=pt&format=json`
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error('Não foi possível buscar essa cidade agora.')
  const dados = await resposta.json()
  const resultado = dados?.results?.[0]
  if (!resultado) throw new Error('Cidade não encontrada — tente incluir o estado (ex: "Torres, RS").')
  const partes = [resultado.name, resultado.admin1].filter(Boolean)
  return { latitude: resultado.latitude, longitude: resultado.longitude, local: partes.join('/') }
}
