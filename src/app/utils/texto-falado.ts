// Texto que vai só para a voz (speechSynthesis), nunca para a tela. A voz do iPhone lê "R$ 5,48"
// símbolo por símbolo ("erre, cifrão, cinco, vírgula...") e soletra abreviações em maiúsculas
// ("500ML"); a do Android interpreta sozinha. Escrevendo tudo por extenso, as duas falam igual.

// "5 reais e 48 centavos", "1 real", "99 centavos". Números em algarismos: toda voz lê "48" certo.
export function precoFalado(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const parteReais = `${reais} ${reais === 1 ? 'real' : 'reais'}`;
  const parteCentavos = `${resto} ${resto === 1 ? 'centavo' : 'centavos'}`;
  if (resto === 0) {
    return parteReais;
  }
  return reais === 0 ? parteCentavos : `${parteReais} e ${parteCentavos}`;
}

// Unidades grudadas no número ("500ML", "1KG", "48UN"). Singular só para 1.
const UNIDADES: Record<string, [string, string]> = {
  KG: ['quilo', 'quilos'],
  G: ['grama', 'gramas'],
  MG: ['miligrama', 'miligramas'],
  ML: ['mililitro', 'mililitros'],
  L: ['litro', 'litros'],
  M: ['metro', 'metros'],
  UN: ['unidade', 'unidades'],
  W: ['watt', 'watts'],
  FL: ['folha', 'folhas'],
};

// As descrições do PRICETAB vêm em maiúsculas e sem acento, e a voz do iPhone lê "PO" como "pô" e
// "OLEO" como "olêo". Regras gerais (-CAO → -ção, -AO → -ão) mais as palavras comuns que elas não
// cobrem. É o melhor possível sem um dicionário inteiro: palavra desconhecida vai só em minúsculas.
const PALAVRAS: Record<string, string> = {
  PO: 'pó', ACO: 'aço', LENCO: 'lenço', ALCOOL: 'álcool', CHA: 'chá', FILE: 'filé', LIQUIDO: 'líquido',
  SANITARIA: 'sanitária', SANITARIO: 'sanitário', LAMPADA: 'lâmpada', LINGUICA: 'linguiça', SUINO: 'suíno',
  PEDACOS: 'pedaços', MOIDA: 'moída', ACEM: 'acém', ACUCAR: 'açúcar', CAFE: 'café', MACA: 'maçã', AGUA: 'água',
  OLEO: 'óleo', GUARANA: 'guaraná', ACAI: 'açaí', CACHACA: 'cachaça', SODICA: 'sódica', PLASTICO: 'plástico',
  HIGIENICO: 'higiênico', ORGANICA: 'orgânica', ORGANICO: 'orgânico', AUTOMATICO: 'automático',
  ENERGETICO: 'energético', ESFEROGRAFICA: 'esferográfica', MASTIGAVEL: 'mastigável', TILAPIA: 'tilápia',
  ITAMBE: 'itambé', FUBA: 'fubá', SINHA: 'sinhá', MACO: 'maço', ADOANTE: 'adoçante', ADOCANTE: 'adoçante',
  ANTISEPTICO: 'antisséptico', DERMOCOSMETICO: 'dermocosmético', POCOS: 'poços', GAS: 'gás', PAES: 'pães',
  FRANCES: 'francês', CAES: 'cães', FLOCAO: 'flocão', LITR: 'litro', DR: 'doutor', AA: 'duplo A', AAA: 'triplo A',
  // Siglas que em minúsculas a voz leria como palavra.
  UHT: 'UHT', EMS: 'EMS',
  // "AO" sozinho é a preposição ("ao leite"), não "ão".
  AO: 'ao',
};

function palavraFalada(palavra: string): string {
  const maiuscula = palavra.toUpperCase();
  if (PALAVRAS[maiuscula]) {
    return PALAVRAS[maiuscula];
  }
  if (/^[A-Z]+CAO$/.test(maiuscula)) {
    return maiuscula.slice(0, -3).toLowerCase() + 'ção';
  }
  if (/^[A-Z]+AO$/.test(maiuscula)) {
    return maiuscula.slice(0, -2).toLowerCase() + 'ão';
  }
  return palavra.toLowerCase();
}

// porQuilo: a fala do preço já termina em "o quilo", então o "KG" do fim da descrição ("CARNE MOIDA
// ... KG") sai, para não falar "quilo" duas vezes. Sem isso ele vira "quilo".
export function descricaoFalada(descricao: string, porQuilo = false): string {
  // Descrição cortada pela loja (PRICETAB de 16 posições, termina com "…"): a última palavra pode
  // estar pela metade ("CONDICIONADOR ELSEVE 20…" era 200 ml) — não é falada (multi-loja, regra 22e).
  if (descricao.endsWith('…')) {
    descricao = descricao.slice(0, -1).trim().replace(/\s+\S+$/, '');
  }
  return (porQuilo ? descricao.replace(/\s+KG\s*$/i, '') : descricao)
    // Marca "3M" (não "3 metros").
    .replace(/\b3M\b(?!\w)/g, 'três eme')
    // "45MMX45M" (fita adesiva): largura por comprimento.
    .replace(/\b(\d+)MMX(\d+)M\b/gi, '$1 milímetros por $2 metros')
    .replace(/\b(\d+(?:[.,]\d+)?)\s?(KG|MG|ML|UN|FL|G|L|M|W)\b/gi, (_, numero: string, unidade: string) => {
      const [singular, plural] = UNIDADES[unidade.toUpperCase()];
      return `${numero} ${numero === '1' ? singular : plural}`;
    })
    // "C/50" = "com 50".
    .replace(/\bC\/\s?(\d)/gi, 'com $1')
    .replace(/\bKG\b/gi, 'quilo')
    .split(/(\s+)/)
    .map(palavraFalada)
    .join('');
}
