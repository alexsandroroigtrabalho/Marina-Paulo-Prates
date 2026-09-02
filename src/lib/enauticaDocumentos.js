// Geração dos documentos de matrícula do RV e-Náutica — a funcionalidade
// que o Alex pediu explicitamente como "fundamental": preencher, a partir
// dos dados já cadastrados, os documentos que a escola precisa entregar à
// Capitania dos Portos/Marinha do Brasil pra cada aluno.
//
// Reescrito para ser fiel ao FORMATO real dos anexos oficiais da
// NORMAM-211/DPC, replicando estrutura/campos/checkboxes/citações do
// rsnautica (src/gerarDocumentos.js, a referência operacional) — isso não
// é "cópia visual do rsnautica" no sentido que o Alex proibiu: é o
// conteúdo/diagramação exigido pelo formulário oficial da Marinha do
// Brasil, uma exigência externa, não uma escolha de estilo do rsnautica.
// A "identidade visual própria" da RV Invictus fica nos elementos que NÃO
// são o formulário em si (botão de imprimir/fechar, por exemplo).
//
// Uma diferença importante em relação ao rsnautica: lá, os "outorgados" da
// Procuração e o responsável técnico do Atestado vêm HARDCODED com nome e
// CPF de pessoas reais da equipe do rsnautica. Aqui isso NUNCA é copiado —
// usamos sempre os dados que a própria escola RV configurou em
// Configurações → Documentos (config_json.documentos, ver
// ConfiguracoesENautica.jsx), preenchidos pelo admin da marina.
//
// Mesma técnica do rsnautica (não é invenção nossa): gera HTML pronto pra
// impressão/"Salvar como PDF" pelo próprio navegador — não existe geração
// de PDF no servidor em nenhum dos dois sistemas. Sem isso, a escola
// preenchia esses 4 formulários um por um, à mão, pra cada aluno.
//
// IMPORTANTE — isto é um MODELO operacional (mesma base normativa usada no
// rsnautica), não peça jurídica revisada por advogado nem garantia de
// conformidade com a norma NORMAM-211 vigente. A escola deve conferir o
// texto antes de protocolar. Nenhum dado de pagamento entra em nenhum
// desses documentos.

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function dataHoje() {
  const hoje = new Date()
  return {
    dia: String(hoje.getDate()).padStart(2, '0'),
    mes: String(hoje.getMonth() + 1).padStart(2, '0'),
    ano: hoje.getFullYear(),
    mesExtenso: MESES[hoje.getMonth()],
  }
}

// Telefone do cadastro de cliente vem como campo único ("(00) 00000-0000"),
// sem separação DDD/número em coluna própria — mesmo parsing do rsnautica.
function parseTel(tel) {
  if (!tel) return { ddd: '  ', numero: '' }
  const m = tel.match(/^\((\d{2})\)\s*(.+)$/)
  return m ? { ddd: m[1], numero: m[2] } : { ddd: '  ', numero: tel }
}

/* ─── Helpers de campo (idênticos ao formato oficial do rsnautica) ──────── */
function val(v, minWidth = '180px') {
  return v
    ? `<span style="border-bottom:1px solid #000;display:inline-block;min-width:${minWidth};padding:0 2px;">${v}</span>`
    : `<span style="border-bottom:1px solid #000;display:inline-block;min-width:${minWidth};">&nbsp;</span>`
}

function valFlex(v, grow = 1) {
  const s = `flex:${grow};border-bottom:1px solid #000;padding:0 2px;min-width:20px;`
  return v ? `<span style="${s}">${v}</span>` : `<span style="${s}">&nbsp;</span>`
}

function checkbox(marcado = false) {
  return marcado
    ? `<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #000;background:#000;color:#fff;font-size:11px;line-height:14px;text-align:center;vertical-align:middle;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;">✓</span>`
    : `<span style="display:inline-block;width:14px;height:14px;border:1.5px solid #000;background:#fff;vertical-align:middle;flex-shrink:0;"></span>`
}

function estiloBase() {
  return `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #000; background: #fff; line-height: 1.3; }
    .pagina { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 14mm 20mm 16mm 20mm; position: relative; }
    .topo-direito { text-align: right; font-size: 9.5pt; margin-bottom: 6mm; }
    .titulo-centro { text-align: center; font-weight: bold; margin-bottom: 4mm; }
    .linha-texto { margin-bottom: 2.5mm; line-height: 1.6; text-align: justify; }
    .opcao-item { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 1.8mm; font-size: 9.5pt; }
    .opcao-texto { flex: 1; line-height: 1.3; text-align: justify; }
    .sub-opcao { display: flex; align-items: flex-start; gap: 6px; margin: 0.8mm 0 0.8mm 20px; font-size: 9.5pt; }
    .rodape-pagina { position: absolute; bottom: 8mm; left: 0; right: 0; text-align: center; font-size: 9.5pt; }
    .linha-assinatura { display: flex; gap: 20mm; margin-top: 8mm; }
    .campo-assin { flex: 1; font-size: 9.5pt; text-align: center; }
    .campo-assin-linha { border-bottom: 1px solid #000; min-height: 7mm; padding-bottom: 1mm; }
    .descricao-linhas { border-bottom: 1px solid #000; min-height: 6mm; margin-bottom: 2mm; }
    @page { margin: 0; }
    @media print {
      body { margin: 0; }
      .pagina { margin: 0; padding: 12mm 18mm 14mm 18mm; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
  </style>`
}

// Botão flutuante de imprimir/fechar: é a única peça de "chrome" (fora do
// formulário oficial em si) desta página — por isso usa a identidade visual
// da RV Invictus (azul-petróleo --cor-primaria, ver src/index.css), não o
// azul do rsnautica. O formulário abaixo dele continua fiel ao anexo
// oficial, que não é estilo de ninguém, é exigência da norma.
function botaoImprimir() {
  return `
  <div class="no-print" style="position:fixed;top:12px;right:12px;display:flex;gap:8px;z-index:9999;font-family:Arial,sans-serif;">
    <button onclick="window.print()" style="background:#0D1B2A;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500;">
      🖨️ Imprimir / Salvar PDF
    </button>
    <button onclick="window.close()" style="background:#fff;color:#0D1B2A;border:1px solid #0D1B2A;padding:8px 14px;border-radius:6px;font-size:12px;cursor:pointer;">
      Fechar
    </button>
  </div>`
}

// Mapeia os campos do cadastro (marina.clientes) pro vocabulário dos
// formulários oficiais. Ver TelaClienteENautica.jsx / FichaCadastro.jsx
// pros nomes reais das colunas.
function dadosAluno(cliente) {
  return {
    nome: cliente?.nome || '',
    cpf: cliente?.cpf_cnpj || '',
    rg: cliente?.rg || '',
    orgao: cliente?.orgao_expedidor || '',
    dataEmissaoRg: cliente?.data_emissao_rg ? new Date(`${cliente.data_emissao_rg}T12:00`).toLocaleDateString('pt-BR') : '',
    nacionalidade: cliente?.nacionalidade || '',
    naturalidade: cliente?.naturalidade || '',
    rua: cliente?.rua || '',
    numero: cliente?.numero_casa || '',
    complemento: cliente?.complemento || '',
    bairro: cliente?.bairro || '',
    cidade: cliente?.cidade || '',
    uf: cliente?.uf || '',
    cep: cliente?.cep || '',
    telefone: cliente?.telefone || '',
    email: cliente?.email || '',
  }
}

/* ══════════════════════════════════════════════════════════════════════
 * ANEXO 5-H — REQUERIMENTO DE HABILITAÇÃO (NORMAM-211/DPC)
 * ══════════════════════════════════════════════════════════════════════ */
function gerarRequerimento5H(cliente, marina, docConfig, labelHabilitacao, habilitacao) {
  const a = dadosAluno(cliente)
  const { dia, mes, ano } = dataHoje()
  const telP = parseTel(a.telefone)
  const celP = parseTel(a.telefone)

  const opcoes = [
    { num: 1, marcado: false, texto: 'CONCESSÃO DE CHA POR CORRESPONDÊNCIA/ EQUIVALÊNCIA PROFISSIONAL' },
    { num: 2, marcado: true, texto: 'EMISSÃO/RENOVAÇÃO' },
    { num: 3, marcado: false, texto: 'RENOVAÇÃO DE CHA DE ARA, MSA OU CPA COM AGREGAÇÃO DA CATEGORIA DE MTA (SERÁ COBRADO APENAS UMA TAXA DE GRU RELATIVO AO SERVIÇO DE RENOVAÇÃO)' },
    { num: 4, marcado: false, texto: 'EMISSÃO DE CERTIFICADO DE CADASTRAMENTO DE MARINAS, CLUBES E ENTIDADES DESPORTIVAS NÁUTICAS' },
    { num: 5, marcado: false, texto: 'RENOVAÇÃO DO CERTIFICADO DE CADASTRAMENTO DE MARINAS, CLUBES E ENTIDADES DESPORTIVAS NÁUTICAS' },
    { num: 6, marcado: false, texto: 'CANCELAMENTO DE CADASTRAMENTO DE MARINAS, CLUBES E ENTIDADES DESPORTIVAS NÁUTICAS' },
    { num: 7, marcado: false, texto: 'CREDENCIAMENTO DE ESTABELECIMENTO DE TREINAMENTO NÁUTICO / PESSOA FÍSICA PARA EMISSÃO DE ATESTADOS DE TREINAMENTO PARA ARA' },
    { num: 8, marcado: false, texto: 'CREDENCIAMENTO DE ÓRGÃO DO ESCOTEIRO DO MAR' },
    { num: 9, marcado: false, texto: 'CREDENCIAMENTO DE ESTABELECIMENTOS NÁUTICOS PARA CURSO NA CATEGORIA DE VELEIRO' },
    { num: 10, marcado: false, texto: 'RENOVAÇÃO DO CREDENCIAMENTO: (ASSINALAR A OPÇÃO ABAIXO)', subOpcoes: [
      'A) DE ESTABELECIMENTO DE TREINAMENTO NÁUTICO / PESSOA FÍSICA PARA EMISSÃO DE ATESTADOS DE TREINAMENTO PARA ARA',
      'B) DE ÓRGÃO DO ESCOTEIRO DO MAR',
      'C) DE ESTABELECIMENTOS NÁUTICOS PARA CURSO NA CATEGORIA DE VELEIRO',
    ] },
    { num: 11, marcado: false, texto: 'DESCREDENCIAMENTO VOLUNTÁRIO DE ETN-A/PF, ETN-VLA E ÓRGÃO DO ESCOTEIRO DO MAR' },
    { num: 12, marcado: false, texto: 'PEDIDO DE REVISÃO DE PROVA DE CAPITÃO-AMADOR' },
  ]

  const listaOpcoes = opcoes.map((o) => {
    let html = `
      <div class="opcao-item">
        ${checkbox(o.marcado)}
        <span class="opcao-texto">${o.num} - ${o.texto}</span>
      </div>`
    if (o.subOpcoes) {
      html += o.subOpcoes.map((s) => `
        <div class="sub-opcao">
          ${checkbox(false)}
          <span class="opcao-texto">${s}</span>
        </div>`).join('')
    }
    return html
  }).join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Requerimento de Habilitação — Anexo 5-H — NORMAM-211/DPC</title>
  ${estiloBase()}
</head>
<body>
${botaoImprimir()}

<div class="pagina">
  <div class="topo-direito"><strong>NORMAM-211/DPC</strong></div>
  <div class="titulo-centro">ANEXO 5-H</div>
  <div class="linha-texto">Ao: Sr. Capitão dos Portos, Delegado ou Agente</div>
  <div class="titulo-centro" style="margin-top:2mm;margin-bottom:2mm;">REQUERIMENTO</div>

  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">Eu</span>${valFlex(a.nome)}<span>,</span>
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">CPF:</span>${valFlex(a.cpf, 2)}
    <span style="white-space:nowrap;">, Identidade nº</span>${valFlex(a.rg, 2)}
    <span style="white-space:nowrap;">, Órgão expedidor</span>${valFlex(a.orgao, 1)}<span>,</span>
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">residente:</span>${valFlex(a.rua)}
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">n°</span>${valFlex(a.numero, 0.5)}
    <span style="white-space:nowrap;">, complemento</span>${valFlex(a.complemento, 1)}
    <span style="white-space:nowrap;">, Bairro:</span>${valFlex(a.bairro, 1.5)}
    <span style="white-space:nowrap;">, Cidade:</span>${valFlex(a.cidade, 1.5)}
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">UF</span>${valFlex(a.uf, 0.3)}
    <span style="white-space:nowrap;">, CEP</span>${valFlex(a.cep, 0.8)}
    <span style="white-space:nowrap;">, TEL (${telP.ddd})</span>${valFlex(telP.numero, 1.5)}
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">Celular (${celP.ddd})</span>${valFlex(celP.numero, 1.5)}
    <span style="white-space:nowrap;">, e-mail</span>${valFlex(a.email, 2)}
  </div>

  <div class="linha-texto" style="margin-top:2mm;">Vem requerer a V. S<sup>a</sup> a realização do seguinte serviço:</div>
  <div style="margin-top:1.5mm;">${listaOpcoes}</div>

  <div class="rodape-pagina"><strong>- 5-H-1 -</strong></div>
</div>

<div class="pagina page-break">
  <div class="topo-direito"><strong>NORMAM-211/DPC</strong></div>
  <div style="margin-bottom:2.5mm;line-height:1.6;text-align:left;"><strong>DESCRIÇÃO DO PEDIDO:</strong> ${val('Solicitação de ' + (habilitacao ? labelHabilitacao(habilitacao) : 'habilitação') + ' — emissão de Carteira de Habilitação de Amador (CHA), conforme documentação anexada.', '480px')}</div>
  ${[1, 2, 3, 4, 5].map(() => `<div class="descricao-linhas"></div>`).join('')}

  <div class="linha-texto" style="margin-top:8mm;">Observações:</div>
  <div class="linha-texto" style="margin-bottom:0;">1) O requerente poderá requerer mais de uma opção de serviço no requerimento; e</div>
  <div class="linha-texto">2) Deverá ser apensada ao presente requerimento toda a documentação pertinente e exigida na NORMAM-211/DPC, para os serviços solicitados.</div>

  <div class="linha-assinatura" style="margin-top:14mm;">
    <div class="campo-assin"><div class="campo-assin-linha">${a.cidade}</div><div style="font-size:9pt;margin-top:1mm;">(local)</div></div>
    <div class="campo-assin"><div class="campo-assin-linha">${dia}&nbsp;/&nbsp;${mes}&nbsp;/&nbsp;${ano}</div><div style="font-size:9pt;margin-top:1mm;">(data)</div></div>
  </div>
  <div class="linha-assinatura" style="margin-top:10mm;">
    <div class="campo-assin"><div class="campo-assin-linha">${a.cpf}</div><div style="font-size:9pt;margin-top:1mm;">CPF</div></div>
    <div class="campo-assin"><div class="campo-assin-linha"></div><div style="font-size:9pt;margin-top:1mm;">assinatura do requerente</div></div>
  </div>

  <div class="rodape-pagina"><strong>- 5-H-2 -</strong></div>
</div>
</body>
</html>`
}

/* ══════════════════════════════════════════════════════════════════════
 * ANEXO 5-E — ATESTADO DE TREINAMENTO PARA ARRAIS-AMADOR (NORMAM-211/DPC)
 * ══════════════════════════════════════════════════════════════════════ */
function gerarAtestado5E(cliente, marina, docConfig) {
  const a = dadosAluno(cliente)
  const { dia, ano, mesExtenso } = dataHoje()
  const nomeEscola = marina?.nome || 'Escola Náutica'

  const linhasTeor = [
    'Apresentação da embarcação',
    'Apresentação das regras de governo',
    'Luzes e marcas',
    'Providências para saída/chegada e para manutenção preventiva da embarcação',
    'Funcionamento e utilização do transceptor de VHF',
    'Frequência/Chamada de socorro/Urgência',
    'Exemplos práticos de primeiros socorros a bordo',
    'Noções de combate a incêndio',
    'Pontos de ignição e de fulgor dos combustíveis (gasolina, etanol e diesel)',
    'Procedimentos para abastecimento (ventilação, uso do suspiro, etc.)',
    'Noções de sobrevivência e segurança',
    'Tipos de materiais de segurança e salvatagem',
  ]
  const linhasPrat = [
    'Preparar a embarcação para navegar',
    'Demonstração dos procedimentos para abastecimento (ventilação, uso do suspiro, etc.)',
    'Demonstração de luzes, marcas e sinais sonoros',
    'Demonstração das regras de governo',
    'Demonstração da ação do Leme / Hélice',
    'Execução de manobras de atração/desatracação/fundeio/suspender',
    'Apresentação da saída e aproximação segura da margem',
    'Execução da lista de verificação',
  ]

  const trRow = (tipo) => tipo.map((t) => `
    <tr>
      <td>${t}</td>
      <td style="min-width:18mm;"></td>
      <td style="min-width:14mm;"></td>
      <td style="min-width:30mm;"></td>
      <td style="min-width:22mm;"></td>
      <td style="min-width:22mm;"></td>
    </tr>`).join('')

  const tabelaEstilo = `
    <style>
      table.tr { width:100%; border-collapse:collapse; font-size:8.5pt; margin:3mm 0; }
      table.tr th, table.tr td { border:1px solid #000; padding:2px 4px; vertical-align:middle; }
      table.tr th { background:#e8e8e8; text-align:center; font-size:8pt; }
    </style>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Atestado de Treinamento — Anexo 5-E — NORMAM-211/DPC</title>
  ${estiloBase()}
  ${tabelaEstilo}
</head>
<body>
${botaoImprimir()}

<div class="pagina">
  <div class="topo-direito"><strong>NORMAM-211/DPC</strong></div>
  <div class="titulo-centro">ANEXO 5-E</div>
  <div class="titulo-centro">ATESTADO DE TREINAMENTO PARA ARRAIS-AMADOR</div>

  <div style="border:1px solid #000;padding:3mm 4mm;margin:4mm 0;font-size:9pt;font-weight:bold;">
    Campo de Preenchimento do Estabelecimento de Treinamento Náutico
  </div>
  <div style="font-size:9pt;font-weight:bold;margin-bottom:2mm;">
    PLANO DE TREINAMENTO TEÓRICO – ARRAIS-AMADOR &nbsp;|&nbsp; REALIZAÇÃO OBRIGATÓRIA NO AMBIENTE NÁUTICO (MARINA, BERÇO OU ATRACADO)
  </div>
  <table class="tr">
    <thead>
      <tr>
        <th style="width:35%">Tipo de Treinamento<br/>conforme alínea (a) da Seção II do anexo 5-A</th>
        <th>Data</th><th>Duração</th><th>Nome do Instrutor</th><th>Habilitação do Instrutor</th><th>Número da CHA ou doc. comprobatório</th>
      </tr>
    </thead>
    <tbody>
      ${trRow(linhasTeor)}
      <tr>
        <td colspan="2" style="font-weight:bold;">DURAÇÃO DO TREINAMENTO TEÓRICO (mínimo de 2h)</td>
        <td></td>
        <td colspan="3" style="font-size:7pt;text-align:center;vertical-align:bottom;padding-bottom:2px;">Assinatura do(s) Instrutor(es)</td>
      </tr>
    </tbody>
  </table>

  <div class="linha-texto" style="margin-top:4mm;font-size:10pt;">
    Atesto, para os devidos fins, que o(a) Sr.(a.) ${val(a.nome, '250px')}, CPF nº ${val(a.cpf, '120px')},
    cumpriu ______ horas de treinamento teórico e prático em embarcação de esporte e/ou recreio
    junto à ${val(nomeEscola, '200px')}
    ou tendo o(a) ${val(docConfig.instrutorNome || '', '200px')} como instrutor(a).
  </div>

  <div class="linha-texto" style="margin-top:4mm;font-size:10pt;">
    Nome ${val(docConfig.responsavelNome || '', '340px')}
  </div>
  <div class="linha-texto" style="font-size:10pt;">
    Identidade nº: ${val('', '110px')},&nbsp; Órgão emissor: ${val('', '80px')},&nbsp;
    Data de emissão: ${val('', '90px')},&nbsp; CPF: ${val(docConfig.responsavelCpf || '', '120px')},&nbsp; Nº da CHA/CIR: ${val('', '100px')}
  </div>

  <div style="margin-top:8mm;text-align:center;">
    <div style="display:inline-block;width:55%;border-bottom:1px solid #000;min-height:12mm;"></div>
    <div style="font-size:8pt;color:#555;margin-top:2mm;">assinatura do responsável</div>
  </div>

  <div style="border:1px solid #aaa;padding:3mm 4mm;margin-top:4mm;font-size:8.5pt;">
    <strong>OBS:</strong> A apresentação de informações inverídicas poderá acarretar no cancelamento da inscrição do candidato, sujeitando, ainda, o responsável do Estabelecimento de Treinamento Náutico, o Coordenador Técnico de Ensino e o Instrutor, às sanções administrativas, cíveis ou penais previstas em Lei.
  </div>

  <div class="rodape-pagina">- 5-E-1 -</div>
</div>

<div class="pagina page-break">
  <div class="topo-direito"><strong>NORMAM-211/DPC</strong></div>
  <div style="font-size:9pt;font-weight:bold;margin-bottom:2mm;">
    PLANO DE TREINAMENTO PRÁTICO – ARRAIS-AMADOR &nbsp;|&nbsp; REALIZAÇÃO OBRIGATÓRIA A BORDO EM NAVEGAÇÃO
  </div>
  <table class="tr">
    <thead>
      <tr>
        <th style="width:35%">Tipo de Treinamento conforme alínea (a) da Seção II do anexo 5-A</th>
        <th>Data</th><th>Duração</th><th>Nome do Instrutor</th><th>Habilitação do Instrutor</th><th>Número da CHA ou doc. comprobatório</th>
      </tr>
    </thead>
    <tbody>
      ${trRow(linhasPrat)}
      <tr>
        <td colspan="2" style="font-weight:bold;">DURAÇÃO DO TREINAMENTO PRÁTICO (mínimo de 4h)</td>
        <td></td>
        <td colspan="3" style="font-size:7pt;text-align:center;vertical-align:bottom;padding-bottom:2px;">Assinatura do(s) Instrutor(es)</td>
      </tr>
    </tbody>
  </table>

  <div style="border:1px solid #000;padding:3mm 4mm;margin:5mm 0;font-size:9pt;font-weight:bold;">
    Campo de Preenchimento do Aluno
  </div>
  <div class="linha-texto" style="font-size:10pt;">
    Data de Emissão: ${val(a.cidade || '', '90px')},&nbsp; ${dia} de ${mesExtenso} de ${ano}.
  </div>
  <div class="linha-texto" style="margin-top:4mm;font-size:10pt;line-height:1.7;">
    Atesto, para os devidos fins, que cumpri o treinamento náutico para Arrais-Amador, conforme plano de treinamento do presente atestado, tendo o instrutor concluído o programa e o período descrito.
  </div>
  <div class="linha-texto" style="font-size:10pt;">
    Nome: ${val(a.nome, '370px')} <span style="font-size:8.5pt;">(aluno)</span>
  </div>
  <div class="linha-texto" style="font-size:10pt;">
    Identidade nº: ${val(a.rg, '110px')},&nbsp; Órgão Emissor: ${val(a.orgao, '80px')}
  </div>
  <div class="linha-texto" style="font-size:10pt;">
    Data de Emissão: ${val(a.dataEmissaoRg, '100px')},&nbsp; CPF: ${val(a.cpf, '130px')}
  </div>

  <div class="linha-texto" style="margin-top:3mm;font-size:9pt;line-height:1.6;">
    Declaro ainda, estar ciente de que a falsidade da presente declaração por parte do responsável pelo estabelecimento de treinamento, pelo instrutor e por mim pode implicar na sanção penal prevista no Art. 299 do Código Penal, conforme transcrição abaixo:
  </div>
  <div class="linha-texto" style="font-size:8.5pt;font-style:italic;">
    "Art. 299 – Omitir, em documento público ou particular, declaração que nele deveria constar, ou nele inserir ou fazer inserir declaração falsa ou diversa da que deveria ser escrita, com o fim de prejudicar direito, criar obrigação ou alterar a verdade sobre fato juridicamente relevante."
  </div>
  <div class="linha-texto" style="font-size:8.5pt;font-style:italic;">
    "Pena: reclusão de 1 (um) a 5 (cinco) anos e multa, se o documento é público e reclusão de 1 (um) a 3 (três) anos, se o documento é particular."
  </div>

  <div style="page-break-inside:avoid;break-inside:avoid;overflow:hidden;margin-top:5mm;">
    <div style="border-bottom:1px solid #000;min-height:8mm;"></div>
    <div style="font-size:9pt;text-align:center;margin-top:1mm;">
      Assinatura do Aluno/Candidato — ${a.nome} — CPF: ${a.cpf}
    </div>
    <div style="border:1px solid #aaa;padding:3mm 4mm;margin-top:4mm;font-size:8.5pt;">
      <strong>OBS:</strong> 1. O Atestado de Treinamento de Arrais-Amador possui abrangência nacional e validade de 02 anos a partir da data de sua emissão.
      2. A inscrição para o exame de Arrais-Amador estará condicionada à apresentação deste atestado.
      3. Para o cômputo total das aulas práticas poderão ser aceitos mais de um atestado desde que o tempo de treinamento não seja inferior a uma hora.
      4. Este documento deverá ser impresso frente e verso e não poderá ser alterado ou rediagramado.
      5. Os atestados de treinamento náutico deverão ser emitidos em até 30 dias corridos a partir da data de realização do último treinamento náutico.
    </div>
  </div>

  <div class="rodape-pagina">- 5-E-3 -</div>
</div>
</body>
</html>`
}

/* ══════════════════════════════════════════════════════════════════════
 * ANEXO 2-G — DECLARAÇÃO DE RESIDÊNCIA (NORMAM-211/DPC) — Lei nº 7.115/1983
 * ══════════════════════════════════════════════════════════════════════ */
function gerarDeclaracao2G(cliente) {
  const a = dadosAluno(cliente)
  const { dia, mes, ano } = dataHoje()
  const enderecoCompleto = [a.rua, a.numero, a.complemento, a.bairro, [a.cidade, a.uf].filter(Boolean).join('/'), a.cep ? `CEP ${a.cep}` : null].filter(Boolean).join(', ')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Declaração de Residência — Anexo 2-G — NORMAM-211/DPC</title>
  ${estiloBase()}
</head>
<body>
${botaoImprimir()}
<div class="pagina">
  <div class="topo-direito"><strong>NORMAM-211/DPC</strong></div>
  <div class="titulo-centro">ANEXO 2-G</div>
  <div class="titulo-centro" style="margin-bottom:8mm;">DECLARAÇÃO DE RESIDÊNCIA</div>

  <div style="margin-bottom:8mm;">Sr. Capitão dos Portos/Delegado/Agente</div>

  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">Eu</span>${valFlex(a.nome)}
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">CPF</span>${valFlex(a.cpf, 1)}
    <span style="white-space:nowrap;">, nacionalidade</span>${valFlex(a.nacionalidade, 0.8)}
    <span style="white-space:nowrap;">, naturalidade</span>${valFlex(a.naturalidade, 0.8)}
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2.5mm;">
    <span style="white-space:nowrap;">Telefone (DDD e nº)</span>${valFlex(a.telefone, 1)}
    <span style="white-space:nowrap;">celular</span>${valFlex(a.telefone, 1)}
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:7mm;">
    <span style="white-space:nowrap;">e-mail</span>${valFlex(a.email, 1)}
  </div>

  <div class="linha-texto" style="margin-bottom:0;">
    Na falta de documentos para comprovação de residência, em conformidade com o disposto na Lei nº 7.115, de 29 de agosto de 1983, <strong>DECLARO</strong> para os devidos fins, sob as penas da Lei, ser residente e domiciliado no endereço
  </div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2mm;">${valFlex(enderecoCompleto)}</div>
  <div style="display:flex;align-items:baseline;gap:4px;margin-bottom:8mm;">${valFlex('')}<span>.</span></div>

  <div class="linha-texto" style="margin-bottom:4mm;">
    Declaro ainda, estar ciente de que a falsidade da presente declaração pode implicar na sanção penal prevista no Art. 299 do Código Penal, conforme transcrição abaixo:
  </div>
  <div class="linha-texto" style="margin-left:10mm;margin-right:10mm;margin-bottom:3mm;">
    "Art. 299 - Omitir, em documento público ou particular, declaração que nele deveria constar, ou nele inserir ou fazer inserir Declaração falsa ou diversa da que deveria ser escrita, com o fim de prejudicar direito, criar obrigação ou alterar a verdade sobre o fato juridicamente relevante"
  </div>
  <div class="linha-texto" style="margin-left:10mm;margin-right:10mm;margin-bottom:14mm;">
    "Pena: reclusão de 1 (um) a 5 (cinco) anos e multa, se o documento é público e reclusão de 1 (um) a 3 (três) anos, se o documento é particular".
  </div>

  <div style="text-align:right;margin-bottom:14mm;">${a.cidade}, ${dia}/${mes}/${ano}</div>

  <div style="width:65%;margin:0 auto;text-align:center;">
    <div style="border-bottom:1px solid #000;min-height:10mm;padding-bottom:1mm;margin-bottom:1.5mm;"></div>
    <div style="font-size:9pt;">Assinatura do Requerente</div>
  </div>

  <div class="rodape-pagina"><strong>- 2-G-1 -</strong></div>
</div>
</body>
</html>`
}

/* ══════════════════════════════════════════════════════════════════════
 * PROCURAÇÃO — Instrumento Particular de Mandato
 * Aluno (outorgante) autoriza representante(s) da escola na Capitania dos
 * Portos. Outorgado(s) = dados configurados pela própria escola (nunca a
 * equipe do rsnautica) — ver ConfiguracoesENautica.jsx "Documentos".
 * ══════════════════════════════════════════════════════════════════════ */
function gerarProcuracao(cliente, marina, docConfig) {
  const a = dadosAluno(cliente)
  const { dia, mes, ano } = dataHoje()
  const nomeEscola = marina?.nome || 'Escola Náutica'
  const enderecoEscola = marina?.endereco || ''

  const fRow = (items) => {
    const cells = items.map(({ label, valor, flex = 1 }) =>
      `<span style="white-space:nowrap;font-size:10pt;margin-right:3px;">${label}</span>` +
      `<span style="flex:${flex};border-bottom:1px solid #000;padding:0 3px;font-size:10pt;min-width:20px;">${valor || ''}</span>`
    ).join('<span style="display:inline-block;width:10px;"></span>')
    return `<div style="display:flex;align-items:flex-end;gap:3px;margin-bottom:4mm;">${cells}</div>`
  }

  // Outorgado(s): responsável técnico + instrutor cadastrados pela escola
  // (config_json.documentos) — nunca dados de terceiros/rsnautica.
  const outorgados = [
    docConfig.responsavelNome ? { nome: docConfig.responsavelNome, cpf: docConfig.responsavelCpf } : null,
    docConfig.instrutorNome ? { nome: docConfig.instrutorNome, cpf: docConfig.instrutorCpf } : null,
  ].filter(Boolean)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Procuração — ${a.nome}</title>
  ${estiloBase()}
  <style>
    .sec-hdr { font-weight:bold; font-size:11pt; text-transform:uppercase; border:1px solid #000; border-bottom:none; padding:2mm 5mm; background:#f5f5f5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sec-body { border:1px solid #000; padding:4mm 6mm 5mm; margin-bottom:5mm; font-size:10pt; }
    .outg { margin-bottom:3mm; font-size:10pt; line-height:1.5; }
  </style>
</head>
<body>
${botaoImprimir()}
<div class="pagina">
  <div style="text-align:center;font-size:15pt;font-weight:bold;margin-bottom:1.5mm;">PROCURAÇÃO</div>
  <div style="text-align:center;font-size:9.5pt;margin-bottom:7mm;">Instrumento Particular de Mandato</div>

  <div class="sec-hdr">OUTORGANTE</div>
  <div class="sec-body">
    ${fRow([{ label: 'Nome:', valor: a.nome, flex: 4 }])}
    ${fRow([{ label: 'CPF:', valor: a.cpf, flex: 1.2 }, { label: 'Endereço:', valor: a.rua, flex: 2.5 }, { label: 'Nº:', valor: a.numero, flex: 0.5 }])}
    ${fRow([{ label: 'Bairro:', valor: a.bairro, flex: 1.5 }, { label: 'CEP:', valor: a.cep, flex: 1 }, { label: 'Cidade/UF:', valor: (a.cidade ? a.cidade + (a.uf ? '/' + a.uf.trim() : '') : ''), flex: 1.5 }])}
    ${fRow([{ label: 'Telefone:', valor: a.telefone, flex: 1.5 }, { label: 'E-mail:', valor: a.email, flex: 2.5 }])}
  </div>

  <div class="sec-hdr">OUTORGADO(S)</div>
  <div class="sec-body">
    ${outorgados.length > 0 ? outorgados.map((o) => `
    <div class="outg">
      ${o.nome}${o.cpf ? `, CPF <span style="white-space:nowrap;">${o.cpf}</span>` : ''}, representante de ${nomeEscola}${enderecoEscola ? `, com sede em ${enderecoEscola}` : ''}.
    </div>`).join('') : `
    <div class="outg" style="color:#900;">
      Nenhum responsável técnico/instrutor configurado. Preencha em Configurações → Documentos antes de usar esta procuração.
    </div>`}
  </div>

  <div style="margin-bottom:5mm;font-size:10pt;line-height:1.7;text-align:justify;">
    Através do presente instrumento particular de mandato, o <strong>OUTORGANTE</strong> nomeia e constitui como seu(s) procurador(es), com amplos, gerais e ilimitados poderes, o(s) <strong>OUTORGADO(S)</strong>, para junto à Capitania dos Portos poder retirar, assinar e transferir documentos <strong>CHA, MTA, CPA, MSA, TIE e TIEM</strong>.
  </div>

  <div style="margin-bottom:10mm;font-size:10pt;">
    ${a.cidade || '_______________'}, ${dia} de ${mes} de ${ano}.
  </div>

  <div style="display:table;margin:0 auto;text-align:center;page-break-inside:avoid;break-inside:avoid;overflow:hidden;">
    <div style="width:200px;border-bottom:1px solid #000;min-height:14mm;margin-bottom:2mm;"></div>
    <div style="font-size:9.5pt;font-weight:600;">${a.nome}</div>
    <div style="font-size:9pt;">CPF: ${a.cpf}</div>
    <div style="font-size:9pt;margin-top:1mm;">Ass. OUTORGANTE</div>
  </div>
</div>
</body>
</html>`
}

/* ══════════════════════════════════════════════════════════════════════
 * LISTA DE ALUNOS PARA AULAS PRÁTICAS — Capitania dos Portos
 * Roteiro/lista de presença que a escola leva no dia da aula prática,
 * gerada a partir de um agendamento (TelaAgendaEscolaENautica.jsx) e dos
 * alunos marcados nele. Mesmo modelo do rsnautica (bônus, não fazia parte
 * dos 4 documentos por aluno) — mas lá "TRAMANDAÍ" e "RS Náutica" vêm
 * fixos no código porque a escola deles só atende uma cidade; aqui usamos
 * o nome da própria marina e o Município/Capitania configurados em
 * Configurações → Documentos (config_json.documentos), porque a RV
 * Invictus atende mais de uma escola.
 * ══════════════════════════════════════════════════════════════════════ */
function gerarListaPratica(agendamento, alunosComHabilitacao, marina, docConfig) {
  const { data, hora, local } = agendamento
  const dataFormatada = data ? new Date(`${data}T12:00`).toLocaleDateString('pt-BR') : '___/___/______'
  const nomeEscola = marina?.nome || 'Escola Náutica'
  const municipio = (docConfig.municipio || '').toUpperCase() || '_______________'
  const capitania = docConfig.capitania || 'Capitania dos Portos / Delegacia / Agência competente'

  const linhas = []
  let horaAtualARA = hora || '09:00'
  let horaAtualMTA = '13:00'

  const somarHoras = (h, minutos) => {
    const [hh, mm] = h.split(':').map(Number)
    const total = hh * 60 + mm + minutos
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  const localPadrao = local || nomeEscola

  alunosComHabilitacao.forEach((al) => {
    const hab = (al.habilitacao || '').toLowerCase()
    const temARA = hab === 'arrais' || hab === 'ambas'
    const temMTA = hab === 'motonauta' || hab === 'ambas'
    const base = { embarcacao: '', nome: al.nome || '', cpf: al.cpf_cnpj || '', tel: al.telefone || '', escola: nomeEscola, data: dataFormatada, local: localPadrao, municipio, instrutor: docConfig.instrutorNome || '' }

    if (temARA) {
      const inicio = horaAtualARA
      linhas.push({ ...base, cat: 'ARA', inicio, fim: somarHoras(inicio, 240) })
    }
    if (temMTA) {
      const inicio = horaAtualMTA
      linhas.push({ ...base, cat: 'MTA', inicio, fim: somarHoras(inicio, 60) })
      horaAtualMTA = somarHoras(horaAtualMTA, 60)
    }
    if (!temARA && !temMTA) {
      linhas.push({ ...base, cat: '', inicio: hora || '09:00', fim: '' })
    }
  })

  while (linhas.length < 6) {
    linhas.push({ embarcacao: '', nome: '', cpf: '', tel: '', cat: '', escola: nomeEscola, data: dataFormatada, local: localPadrao, municipio, instrutor: '', inicio: '', fim: '' })
  }

  const TH = `border:1px solid #000;padding:2px 2px;font-size:5.5pt;font-weight:bold;background:#e8e8e8;text-align:center;vertical-align:middle;overflow:hidden;max-width:0;word-break:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact;`
  const TD = `border:1px solid #000;padding:1px 3px;font-size:6pt;vertical-align:middle;overflow:hidden;max-width:0;white-space:nowrap;`

  const COLS = [
    { w: '7%', hdr: 'NOME DA<br>EMBARCAÇÃO' },
    { w: '17%', hdr: 'NOME / ASSINATURA<br>DO ALUNO' },
    { w: '9%', hdr: 'CPF' },
    { w: '8%', hdr: 'TEL.<br>CAND.' },
    { w: '3.5%', hdr: 'CAT.' },
    { w: '10%', hdr: 'ESCOLA<br>NÁUTICA' },
    { w: '6%', hdr: 'DATA' },
    { w: '9%', hdr: 'LOCAL' },
    { w: '7%', hdr: 'MUNICÍPIO' },
    { w: '8.5%', hdr: 'INSTRUTOR' },
    { w: '7%', hdr: 'ASS.<br>INSTRUTOR' },
    { w: '4%', hdr: 'INÍCIO' },
    { w: '4%', hdr: 'TÉRMINO' },
  ]

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Lista de Alunos — Aula Prática ${dataFormatada}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body { font-family:Arial,Helvetica,sans-serif; background:#fff; color:#000; }
    @page { size: A4 landscape; margin: 0; }
    .wrap { width:277mm; margin:0 auto; padding:8mm 10mm; }
    .btn { display:block; margin:8px auto 10px; padding:5px 16px; font-size:12px; cursor:pointer; background:#0D1B2A; color:#fff; border:none; border-radius:6px; }
    @media print { .btn { display:none; } .wrap { width:100%; padding:8mm 10mm; } }
  </style>
</head>
<body>
<button class="btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<div class="wrap">
  <div style="text-align:center;font-weight:bold;font-size:10pt;margin-bottom:1mm;">MARINHA DO BRASIL</div>
  <div style="text-align:center;font-weight:bold;font-size:9pt;margin-bottom:1mm;">${capitania.toUpperCase()}</div>
  <div style="text-align:center;font-weight:bold;font-size:8.5pt;margin-bottom:4mm;">LISTA DE ALUNOS PARA AULAS PRÁTICAS NA CATEGORIA DE ARRAIS-AMADOR E/OU MOTONAUTA — ${dataFormatada}</div>

  <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:3mm;">
    <colgroup><col style="width:55%"/><col/></colgroup>
    <tr>
      <td style="${TD}font-weight:bold;font-size:7pt;white-space:normal;">TREINAMENTO TEÓRICO ${hora || '07:00'} ÀS ${somarHoras(hora || '07:00', 60)}</td>
      <td style="${TD}font-weight:bold;font-size:7pt;white-space:normal;">REALIZADO DE FORMA COLETIVA</td>
    </tr>
  </table>

  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    <colgroup>${COLS.map((c) => `<col style="width:${c.w}"/>`).join('')}</colgroup>
    <thead>
      <tr style="height:30px;">${COLS.map((c) => `<th style="${TH}">${c.hdr}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${linhas.map((l) => `
      <tr style="height:36px;">
        <td style="${TD}text-align:center;">${l.embarcacao}</td>
        <td style="border:1px solid #000;padding:1px 3px;font-size:6pt;vertical-align:top;overflow:hidden;max-width:0;">
          <div style="font-size:6pt;padding-bottom:2px;white-space:nowrap;overflow:hidden;text-align:center;">${l.nome}</div>
          <div style="border-top:0.5px solid #aaa;margin-top:3px;min-height:8px;font-size:4pt;color:#aaa;text-align:center;letter-spacing:0.3px;">assinatura</div>
        </td>
        <td style="${TD}text-align:center;">${l.cpf}</td>
        <td style="${TD}text-align:center;">${l.tel}</td>
        <td style="${TD}text-align:center;font-weight:bold;">${l.cat}</td>
        <td style="${TD}text-align:center;">${l.escola}</td>
        <td style="${TD}text-align:center;">${l.data}</td>
        <td style="${TD}text-align:center;">${l.local}</td>
        <td style="${TD}text-align:center;">${l.municipio}</td>
        <td style="${TD}text-align:center;">${l.instrutor}</td>
        <td style="${TD}text-align:center;"></td>
        <td style="${TD}text-align:center;">${l.inicio}</td>
        <td style="${TD}text-align:center;">${l.fim}</td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>
</body>
</html>`
}

/** Abre a Lista de Alunos para Aulas Práticas (botão na Agenda, compromissos
 *  do tipo "Aula prática") — recebe o agendamento e a lista de clientes
 *  completos (com habilitacao anexada de cada matrícula aprovada).
 *
 *  `janelaPreAberta`, se vier, é uma aba já aberta (via `window.open('',
 *  '_blank')`) SÍNCRONO com o clique do usuário, antes das buscas no banco
 *  — abrir a aba só depois de um `await` (dados de marina/alunos) faz o
 *  navegador tratar como pop-up não solicitado e bloquear silenciosamente
 *  em boa parte dos casos, sem nenhum erro visível pro funcionário. Quem
 *  chama (TelaAgendaEscolaENautica.jsx) já abre a aba antes de buscar os
 *  dados, exatamente pra evitar isso — mesmo problema não existe em
 *  `abrirDocumento` porque lá os dados já estão carregados antes do clique. */
export function abrirListaPratica(agendamento, alunosComHabilitacao, marina, docConfig, janelaPreAberta) {
  const html = gerarListaPratica(agendamento, alunosComHabilitacao, marina, docConfig || {})
  if (!html) return
  if (janelaPreAberta) {
    janelaPreAberta.document.open()
    janelaPreAberta.document.write(html)
    janelaPreAberta.document.close()
    return
  }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const aba = window.open(url, '_blank')
  if (aba) aba.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
}

/* ─── API pública ────────────────────────────────────────────────────── */

export const MODELOS_DOCUMENTO = [
  { chave: 'requerimento', titulo: 'Requerimento de Habilitação (Anexo 5-H)' },
  { chave: 'atestado', titulo: 'Atestado de Treinamento (Anexo 5-E)' },
  { chave: 'declaracao', titulo: 'Declaração de Residência (Anexo 2-G)' },
  { chave: 'procuracao', titulo: 'Procuração' },
]

/** Gera o HTML do documento pedido a partir do cadastro do cliente/aluno. */
export function gerarHTMLDocumento(chave, cliente, marina, docConfig, labelHabilitacao) {
  const habilitacao = cliente?.__habilitacao
  if (chave === 'requerimento') return gerarRequerimento5H(cliente, marina, docConfig, labelHabilitacao, habilitacao)
  if (chave === 'atestado') return gerarAtestado5E(cliente, marina, docConfig)
  if (chave === 'declaracao') return gerarDeclaracao2G(cliente)
  if (chave === 'procuracao') return gerarProcuracao(cliente, marina, docConfig)
  return ''
}

/** Abre o documento pronto numa aba nova (botão "Documentos" da escola). */
export function abrirDocumento(modelo, cliente, marina, docConfig, labelHabilitacao) {
  const html = gerarHTMLDocumento(modelo.chave, cliente, marina, docConfig, labelHabilitacao)
  if (!html) return
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const aba = window.open(url, '_blank')
  if (aba) aba.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
}
