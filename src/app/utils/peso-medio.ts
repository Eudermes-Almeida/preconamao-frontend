import type { Pesagem } from '../services/carrinho.service';

// Peso médio por unidade dos produtos vendidos por kg que o cliente costuma contar ("6 bananas",
// "10 pães franceses"): é o que faz a opção "Quantidade" do pesável virar gramas (≈ estimado).
// Valores de referência de varejo; o caixa sempre pesa. Produto fora da tabela (carnes, queijos,
// frios, a granel) não tem a opção "Quantidade": só "Peso" e "Pesar no caixa".

export interface PesoMedio {
  gramas: number;
  // Como a unidade é chamada na tela ("unidade", "cacho", "cabeça").
  unidade: string;
}

interface RegraPesoMedio {
  // Início da descrição (sem acento, maiúsculas), em palavras inteiras: o nome do produto vem
  // primeiro no PRICETAB, e assim "PAOZINHO MILHO" não vira espiga nem "ROSCA ABOBORA" vira abóbora.
  termos: string;
  gramas: number;
  unidade?: string;
}

// Ordem importa: a primeira regra que casa vence, então o mais específico vem antes
// ("BANANA MACA" antes de "MACA", "PAO QUEIJO RECHEADO" antes de "PAO QUEIJO").
const REGRAS: RegraPesoMedio[] = [
  // Frutas
  { termos: 'BANANA MACA', gramas: 90 },
  { termos: 'BANANA DA TERRA', gramas: 250 },
  { termos: 'BANANA PRATA', gramas: 100 },
  { termos: 'BANANA', gramas: 130 },
  { termos: 'MACA', gramas: 150 },
  { termos: 'LARANJA BAHIA', gramas: 250 },
  { termos: 'LARANJA', gramas: 200 },
  { termos: 'LIMAO SICILIANO', gramas: 150 },
  { termos: 'LIMAO', gramas: 100 },
  { termos: 'MEXERICA', gramas: 150 },
  { termos: 'TANGERINA', gramas: 150 },
  { termos: 'MAMAO FORMOSA', gramas: 1500 },
  { termos: 'MAMAO', gramas: 450 },
  { termos: 'MANGA', gramas: 450 },
  { termos: 'MELANCIA', gramas: 8000 },
  { termos: 'MELAO', gramas: 1500 },
  { termos: 'ABACATE AVOCADO', gramas: 200 },
  { termos: 'AVOCADO', gramas: 200 },
  { termos: 'ABACATE', gramas: 400 },
  { termos: 'ABACAXI', gramas: 1500 },
  { termos: 'KIWI', gramas: 80 },
  { termos: 'PERA', gramas: 180 },
  { termos: 'PESSEGO', gramas: 150 },
  { termos: 'NECTARINA', gramas: 130 },
  { termos: 'AMEIXA', gramas: 70 },
  { termos: 'GOIABA', gramas: 200 },
  { termos: 'MARACUJA', gramas: 150 },
  { termos: 'PITAIA', gramas: 350 },
  { termos: 'ROMA', gramas: 300 },
  { termos: 'CAQUI', gramas: 180 },
  { termos: 'COCO SECO', gramas: 500 },
  { termos: 'GRAVIOLA', gramas: 1000 },
  { termos: 'UVA', gramas: 500, unidade: 'cacho' },
  // Legumes e verduras
  { termos: 'TOMATE SWEET GRAPE', gramas: 10 },
  { termos: 'TOMATE CEREJA', gramas: 10 },
  { termos: 'TOMATE', gramas: 150 },
  { termos: 'CEBOLA', gramas: 150 },
  { termos: 'BATATA DOCE', gramas: 250 },
  { termos: 'BATATA MIUDA', gramas: 60 },
  { termos: 'BATATA', gramas: 150 },
  { termos: 'CENOURA', gramas: 120 },
  { termos: 'BETERRABA', gramas: 150 },
  { termos: 'CHUCHU', gramas: 300 },
  { termos: 'BERINJELA', gramas: 300 },
  { termos: 'PIMENTAO', gramas: 180 },
  { termos: 'PEPINO', gramas: 250 },
  { termos: 'ABOBRINHA', gramas: 300 },
  { termos: 'ABOBORA ITALIANA', gramas: 300 },
  { termos: 'ABOBORA', gramas: 2000 },
  { termos: 'REPOLHO', gramas: 1500 },
  { termos: 'MANDIOCA', gramas: 500 },
  { termos: 'ALHO', gramas: 50, unidade: 'cabeça' },
  { termos: 'GENGIBRE', gramas: 100, unidade: 'pedaço' },
  { termos: 'JILO', gramas: 40 },
  { termos: 'QUIABO', gramas: 15 },
  { termos: 'CARAZINHO', gramas: 100 },
  { termos: 'INHAME', gramas: 100 },
  { termos: 'MILHO', gramas: 300, unidade: 'espiga' },
  // Padaria
  { termos: 'PAO FRANCES', gramas: 50 },
  { termos: 'PAO QUEIJO RECHEADO', gramas: 80 },
  { termos: 'PAO QUEIJO', gramas: 20 },
  { termos: 'PAO DE QUEIJO', gramas: 20 },
  { termos: 'PAO BATATA', gramas: 90 },
  { termos: 'PAO HAMBURGUER', gramas: 60 },
  { termos: 'PAO HOT DOG', gramas: 50 },
  { termos: 'PAO LEITE', gramas: 50 },
  { termos: 'PAO DOCE', gramas: 80 },
  { termos: 'PAO SIRIO', gramas: 80 },
  { termos: 'PAO MINEIRO', gramas: 40 },
  { termos: 'PAO FOFINHO', gramas: 50 },
  { termos: 'PAOZINHO', gramas: 40 },
  { termos: 'BROINHA', gramas: 30 },
  { termos: 'SONHO', gramas: 80 },
  { termos: 'CROISSANT', gramas: 70 },
  { termos: 'CIABATTA', gramas: 100 },
  { termos: 'SALGADINHO', gramas: 25 },
];

// Não são contados por unidade, mesmo com a palavra da fruta/pão na descrição.
const EXCECOES = ['CHIPS', 'PASSA', 'PASSAS', 'SEM CAROCO', 'DESIDRATADA', 'DESIDRATADO', 'POLPA', 'RALADO', 'RALADA', 'FARINHA'];

// Só as palavras (sem acento, maiúsculas), com espaço nas pontas para casar palavra inteira.
function normalizar(texto: string): string {
  return ' ' + texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
}

export function pesoMedioDe(descricao: string): PesoMedio | null {
  const texto = normalizar(descricao);
  if (EXCECOES.some(excecao => texto.includes(` ${excecao} `))) {
    return null;
  }
  const regra = REGRAS.find(r => texto.startsWith(` ${r.termos} `));
  return regra ? { gramas: regra.gramas, unidade: regra.unidade ?? 'unidade' } : null;
}

// "720 g" / "1,25 kg".
export function formatarGramas(gramas: number): string {
  return gramas >= 1000
    ? `${(gramas / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`
    : `${gramas} g`;
}

// Linha do carrinho / "Já no carrinho": "6 un. (≈ 720 g)", "≈ 500 g", "a pesar no caixa".
export function resumoPesagem(pesagem: Pesagem): string {
  if (pesagem.modo === 'CAIXA') {
    return 'a pesar no caixa';
  }
  const peso = `≈ ${formatarGramas(pesagem.gramas ?? 0)}`;
  return pesagem.modo === 'QUANTIDADE' ? `${pesagem.unidades} un. (${peso})` : peso;
}
