/* ============================================================
 * Catálogo de serviços de despacho junto à Capitania dos Portos.
 *
 * Curado a partir da "Carta de Serviços ao Usuário" (2025) da
 * Agência da Capitania dos Portos em Tramandaí (Marinha do Brasil),
 * com foco nos serviços que fazem sentido para o dono de uma
 * embarcação de esporte/recreio associado à marina — este é o
 * diferencial competitivo: a marina cuida da burocracia de
 * documentação/regularização por conhecer o processo por dentro.
 *
 * Cada item vira uma solicitação na tabela `despachos` (tipo = key).
 * A relação completa de documentos exigidos por serviço varia
 * conforme o porte/tipo da embarcação e muda por norma (NORMAM) —
 * por isso o texto aqui é um resumo; a equipe da marina confirma a
 * lista exata de documentos ao atender a solicitação.
 * ============================================================ */

export const CATEGORIAS_SERVICOS = [
  { key: 'registro', titulo: 'Registro e documentação da embarcação' },
  { key: 'seguranca', titulo: 'Segurança e vistorias' },
  { key: 'regularizacao', titulo: 'Regularizações e ocorrências' },
  { key: 'habilitacao', titulo: 'Habilitação de condutores (CHA)' },
  { key: 'operacao', titulo: 'Eventos e operação portuária' },
]

export const SERVICOS_DESPACHO = [
  // ---- Registro e documentação da embarcação ----
  {
    key: 'tie_emissao',
    categoria: 'registro',
    titulo: 'Emissão de Título de Inscrição (TIE/TIEM)',
    resumo: 'Registro de embarcação recém-adquirida ainda não inscrita na Capitania. Prazo legal: até 15 dias da compra, para evitar multa.',
  },
  {
    key: 'tie_2via',
    categoria: 'registro',
    titulo: '2ª via do Título de Inscrição (TIE/TIEM)',
    resumo: 'Reemissão do TIE/TIEM em caso de perda, roubo ou extravio do documento original.',
  },
  {
    key: 'transferencia_propriedade',
    categoria: 'registro',
    titulo: 'Transferência de propriedade',
    resumo: 'Regularização da embarcação após compra e venda. Prazo legal: até 15 dias da transação, para evitar multa.',
  },
  {
    key: 'documento_provisorio',
    categoria: 'registro',
    titulo: 'Documento provisório de propriedade',
    resumo: 'Documento que comprova a propriedade enquanto o TIE definitivo não é emitido.',
  },
  {
    key: 'transferencia_jurisdicao',
    categoria: 'registro',
    titulo: 'Transferência de jurisdição',
    resumo: 'Mudança da Capitania/Agência responsável pela embarcação, por exemplo ao trocar de região ou de marina.',
  },
  {
    key: 'alteracao_dados',
    categoria: 'registro',
    titulo: 'Alteração de dados cadastrais',
    resumo: 'Atualização de dados da embarcação (características, motor) ou do proprietário junto à Capitania.',
  },
  {
    key: 'baixa',
    categoria: 'registro',
    titulo: 'Cancelamento de inscrição (baixa)',
    resumo: 'Baixa definitiva da embarcação no cadastro da Capitania — para venda ao exterior, sucata ou perda total.',
  },
  {
    key: 'segunda_via_certificados',
    categoria: 'registro',
    titulo: '2ª via de certificados e licenças',
    resumo: 'Reemissão de certificados e licenças da embarcação perdidos ou danificados.',
  },

  // ---- Segurança e vistorias ----
  {
    key: 'csn_emissao',
    categoria: 'seguranca',
    titulo: 'Certificado de Segurança da Navegação (CSN)',
    resumo: 'Emissão do certificado que atesta as condições de segurança da embarcação para navegar.',
  },
  {
    key: 'csn_vistoria',
    categoria: 'seguranca',
    titulo: 'Vistoria anual/intermediária de CSN',
    resumo: 'Vistoria periódica exigida para manter o Certificado de Segurança da Navegação válido.',
  },
  {
    key: 'cts_emissao',
    categoria: 'seguranca',
    titulo: 'Cartão de Tripulação de Segurança (CTS)',
    resumo: 'Emissão do cartão que define a composição mínima de tripulação exigida para a embarcação.',
  },

  // ---- Regularizações e ocorrências ----
  {
    key: 'regularizacao_notificacao',
    categoria: 'regularizacao',
    titulo: 'Regularização de notificação de inspeção naval',
    resumo: 'Resolução de notificações/autuações recebidas em inspeção naval, dentro do prazo regulamentar.',
  },
  {
    key: 'liberacao_apreensao',
    categoria: 'regularizacao',
    titulo: 'Liberação de embarcação apreendida',
    resumo: 'Providências para liberação de embarcação apreendida em inspeção naval.',
  },
  {
    key: 'termo_entrega',
    categoria: 'regularizacao',
    titulo: 'Termo de entrega da embarcação',
    resumo: 'Emissão do termo de entrega após regularização de multas e despesas de guarda/conservação.',
  },

  // ---- Habilitação de condutores ----
  {
    key: 'cha_habilitacao',
    categoria: 'habilitacao',
    titulo: 'Habilitação de amador (CHA)',
    resumo: 'Inscrição e habilitação para Motonauta, Arrais Amador, Mestre-Amador ou Capitão-Amador, com emissão da carteira (CHA).',
  },
  {
    key: 'cha_2via',
    categoria: 'habilitacao',
    titulo: '2ª via / renovação da CHA',
    resumo: 'Reemissão ou renovação da Carteira de Habilitação de Amador vencida, perdida ou danificada.',
  },

  // ---- Eventos e operação portuária ----
  {
    key: 'evento_nautico',
    categoria: 'operacao',
    titulo: 'Autorização para evento náutico',
    resumo: 'Solicitação de autorização junto à Capitania para realização de regatas, passeios em grupo ou outros eventos náuticos.',
  },
  {
    key: 'despacho_entrada_saida',
    categoria: 'operacao',
    titulo: 'Despacho de embarcação (entrada/saída de porto)',
    resumo: 'Processamento da documentação de despacho exigida na chegada e saída de embarcações maiores junto à Capitania.',
  },
  {
    key: 'outro',
    categoria: 'operacao',
    titulo: 'Outro assunto com a Capitania dos Portos',
    resumo: 'Não encontrou o serviço que precisa? Descreva sua necessidade e a marina orienta o melhor caminho.',
  },
]
