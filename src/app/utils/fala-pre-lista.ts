// Pré-lista por voz: o cliente fala UM item por vez ("três pacotes de café", "arroz 5 quilos",
// "meia dúzia de banana") e o app separa o produto da quantidade e da medida. Medida de peso,
// volume, dúzia ou fardo não vira quantidade (5 kg de arroz não são 5 pacotes): vira o lembrete
// da linha ("5 kg") e a quantidade fica 1. Embalagem contada (pacote, caixa, lata) é quantidade.
// Depois, itensDaFala() acha os itens genéricos da pré-lista pelo nome, pelas falas
// (pre_lista_fala: "refri", "pasta de dente") e pelos termos de descrição, e marcaDaFala() separa
// a marca falada ("arroz codil"), que entra no lembrete junto com a medida ("Codil - 5 kg").

export interface FalaInterpretada {
  // O que sobrou da frase sem quantidade e medida, como foi falado (vai para a busca da loja).
  produto: string;
  quantidade: number;
  lembrete: string | null;
}

export interface ItemFalavel {
  id: number;
  nome: string;
  falas?: string[];
  termos?: string[];
  marcas?: string[];
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40,
  cinquenta: 50, cem: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quinhentos: 500, quinhentas: 500, meio: 0.5, meia: 0.5,
};

// Medida que vira lembrete: [singular, plural] como aparece na tela.
const MEDIDAS: Record<string, [string, string]> = {
  quilo: ['kg', 'kg'], quilos: ['kg', 'kg'], kilo: ['kg', 'kg'], kilos: ['kg', 'kg'], kg: ['kg', 'kg'],
  grama: ['g', 'g'], gramas: ['g', 'g'], g: ['g', 'g'],
  litro: ['L', 'L'], litros: ['L', 'L'], l: ['L', 'L'],
  ml: ['ml', 'ml'], mililitro: ['ml', 'ml'], mililitros: ['ml', 'ml'],
  duzia: ['dúzia', 'dúzias'], duzias: ['dúzia', 'dúzias'],
  fardo: ['fardo', 'fardos'], fardos: ['fardo', 'fardos'],
};

// Embalagem contada: o número é a quantidade e a palavra sai da frase.
const EMBALAGENS = new Set([
  'pacote', 'pacotes', 'caixa', 'caixas', 'caixinha', 'caixinhas', 'lata', 'latas', 'latinha',
  'latinhas', 'garrafa', 'garrafas', 'pote', 'potes', 'vidro', 'vidros', 'saco', 'sacos',
  'unidade', 'unidades', 'frasco', 'frascos', 'tubo', 'tubos', 'rolo', 'rolos', 'bandeja',
  'bandejas', 'maco', 'macos', 'cartela', 'cartelas', 'barra', 'barras',
]);

const LIGACOES = new Set(['de', 'do', 'da', 'dos', 'das']);

const QUANTIDADE_MAXIMA = 99;

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function valorDoNumero(palavra: string): number | null {
  const limpa = semAcento(palavra);
  if (/^\d+([.,]\d+)?$/.test(limpa)) {
    return Number(limpa.replace(',', '.'));
  }
  return NUMEROS[limpa] ?? null;
}

function formatarNumero(valor: number): string {
  return String(valor).replace('.', ',');
}

export function interpretarFala(texto: string): FalaInterpretada {
  // "coca-cola" e "2kg" viram palavras separadas; pontuação do reconhecimento sai.
  const palavras = texto
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/[-–,.;:!?]+(?!\d)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Número conta como quantidade no começo, no fim ou antes de medida/embalagem. No meio da frase
  // é nome de produto ("café três corações").
  for (let i = 0; i < palavras.length; i++) {
    let valor = valorDoNumero(palavras[i]);
    if (valor === null) {
      continue;
    }
    let fim = i + 1;
    // "meia dúzia", "meio quilo": o "meia" sozinho vale 0,5 da medida que vem a seguir.
    const unidade = semAcento(palavras[fim] ?? '');
    const medida = MEDIDAS[unidade];
    const embalagem = EMBALAGENS.has(unidade);
    const noFim = fim === palavras.length;
    if (!medida && !embalagem && !(i === 0 && valor >= 1) && !noFim) {
      continue;
    }
    if (valor === 0.5 && !medida) {
      continue;
    }
    if (medida || embalagem) {
      fim++;
    }
    // "1 quilo e meio".
    if (medida && semAcento(palavras[fim] ?? '') === 'e' && ['meio', 'meia'].includes(semAcento(palavras[fim + 1] ?? ''))) {
      valor += 0.5;
      fim += 2;
    }
    // "três pacotes de café": o "de" depois da medida/embalagem é ligação, não produto.
    if ((medida || embalagem) && LIGACOES.has(semAcento(palavras[fim] ?? ''))) {
      fim++;
    }
    const resto = [...palavras.slice(0, i), ...palavras.slice(fim)];
    // "café de 3": a ligação que ficou pendurada no fim também sai.
    while (resto.length > 1 && LIGACOES.has(semAcento(resto[resto.length - 1]))) {
      resto.pop();
    }
    const produto = resto.join(' ').trim();
    if (!produto) {
      break;
    }
    if (medida) {
      const [singular, plural] = medida;
      const lembrete = valor === 0.5 && singular === 'dúzia'
        ? 'meia dúzia'
        : `${formatarNumero(valor)} ${valor > 1 ? plural : singular}`;
      return { produto, quantidade: 1, lembrete };
    }
    if (Number.isInteger(valor) && valor >= 1) {
      return { produto, quantidade: Math.min(QUANTIDADE_MAXIMA, valor), lembrete: null };
    }
    break;
  }
  return { produto: palavras.join(' ').trim(), quantidade: 1, lembrete: null };
}

// Plural simples nos dois lados da comparação: "bananas" = "banana", "pães" = "pao",
// "limões" = "limao". Palavras curtas ("gas", "aa") ficam como estão.
function singular(palavra: string): string {
  if (palavra.length <= 3) {
    return palavra;
  }
  if (/(oes|aes)$/.test(palavra)) {
    return palavra.slice(0, -3) + 'ao';
  }
  if (/ns$/.test(palavra)) {
    return palavra.slice(0, -2) + 'm';
  }
  if (/(res|zes)$/.test(palavra)) {
    return palavra.slice(0, -2);
  }
  return palavra.endsWith('s') ? palavra.slice(0, -1) : palavra;
}

// Apóstrofo some sem separar a palavra ("Hellmann's" = "hellmanns").
const APOSTROFO = /['’]/g;

function palavrasComparaveis(texto: string): string[] {
  return semAcento(texto)
    .replace(APOSTROFO, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular);
}

function comecaCom(texto: string[], inicio: string[]): boolean {
  return inicio.length > 0 && inicio.length <= texto.length && inicio.every((palavra, i) => texto[i] === palavra);
}

function contem(texto: string[], trecho: string[]): boolean {
  for (let i = 0; i + trecho.length <= texto.length; i++) {
    if (trecho.every((palavra, j) => texto[i + j] === palavra)) {
      return true;
    }
  }
  return false;
}

const PESO_ORIGEM = { fala: 3, termo: 2, nome: 1 };

// Nota de um item para a fala: frase IGUAL a um jeito de dizer o item > frase que COMEÇA por ele
// ("café pilão" começa por "café"; o mais longo vence: "sabão em pó omo" -> Sabão em pó) > nome
// do item que começa pela frase ("leite" -> Leite condensado) > nome que contém a frase ("frango"
// -> Peito de frango). Empate: fala > termo > nome.
function nota(frase: string[], item: ItemFalavel): number {
  let melhor = 0;
  const candidatos: [string, keyof typeof PESO_ORIGEM][] = [
    [item.nome, 'nome'],
    ...[...(item.falas ?? []), ...(item.marcas ?? [])].map(texto => [texto, 'fala'] as [string, 'fala']),
    ...(item.termos ?? []).map(texto => [texto, 'termo'] as [string, 'termo']),
  ];
  for (const [texto, origem] of candidatos) {
    const palavras = palavrasComparaveis(texto);
    let valor = 0;
    if (palavras.length === frase.length && comecaCom(frase, palavras)) {
      valor = 1000;
    } else if (comecaCom(frase, palavras)) {
      valor = 500 + palavras.length * 10;
    } else if (origem === 'nome' && comecaCom(palavras, frase)) {
      valor = 300;
    } else if (origem === 'nome' && contem(palavras, frase)) {
      valor = 200;
    }
    if (valor > 0) {
      melhor = Math.max(melhor, valor + PESO_ORIGEM[origem]);
    }
  }
  return melhor;
}

// Itens genéricos para o que o cliente falou, do mais provável para o menos. Frase que é
// exatamente um item ("leite", "frango") traz também as variações (Leite condensado, Peito de
// frango); frase com algo a mais ("café pilão") traz só o item que ela começa.
export function itensDaFala<T extends ItemFalavel>(produto: string, itens: readonly T[], limite = 6): T[] {
  const frase = palavrasComparaveis(produto);
  if (frase.length === 0) {
    return [];
  }
  const notas = itens
    .map(item => ({ item, nota: nota(frase, item) }))
    .filter(({ nota }) => nota > 0)
    .sort((a, b) => b.nota - a.nota || a.item.nome.localeCompare(b.item.nome));
  if (notas.length === 0) {
    return [];
  }
  const melhor = notas[0].nota;
  const corte = melhor >= 1000 ? 200 : melhor >= 500 ? melhor : 200;
  return notas.filter(({ nota }) => nota >= corte).slice(0, limite).map(({ item }) => item);
}

// A pré-lista não tem marcas (só itens genéricos, como nas outras visões): o que o cliente falou
// além do item vira lembrete. "arroz codil" -> item Arroz, marca "Codil"; "café três corações" ->
// "Três Corações". Frase que começa por uma marca do item ("coca-cola zero" -> Refrigerante) é
// toda marca. Frase igual ao item (ou que só é parte do nome dele) não tem marca.
export function marcaDaFala(produto: string, item: ItemFalavel): string | null {
  const frase = palavrasComparaveis(produto);
  const maiorComeco = (textos: string[]) => textos
    .map(palavrasComparaveis)
    .filter(palavras => comecaCom(frase, palavras))
    .reduce((maior, palavras) => Math.max(maior, palavras.length), 0);
  // Palavras do começo que dizem o item; 0 com marca no começo = a frase toda é marca.
  const reconhecidas = maiorComeco([item.nome, ...(item.falas ?? []), ...(item.termos ?? [])]);
  if (reconhecidas === 0 && maiorComeco(item.marcas ?? []) === 0) {
    return null;
  }
  // Mesmas palavras de palavrasComparaveis(), mas como foram faladas (com acento).
  const faladas = produto.replace(APOSTROFO, '').replace(/\(.*?\)/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  let resto = faladas.slice(reconhecidas);
  while (resto.length > 0 && LIGACOES.has(semAcento(resto[0]))) {
    resto.shift();
  }
  if (resto.length === 0) {
    // Termo que já traz a marca ("ração pedigree" é termo de Ração para cães): a marca vem dele.
    const marca = (item.marcas ?? []).map(palavrasComparaveis).find(palavras => contem(frase, palavras));
    if (!marca) {
      return null;
    }
    const inicio = frase.findIndex((_, i) => marca.every((palavra, j) => frase[i + j] === palavra));
    resto = faladas.slice(inicio, inicio + marca.length);
  }
  return resto
    .map(palavra => LIGACOES.has(semAcento(palavra)) ? palavra.toLowerCase() : palavra[0].toUpperCase() + palavra.slice(1))
    .join(' ');
}

// Lembrete da linha: marca e medida juntas ("Codil - 5 kg"), ou só uma delas.
export function lembreteDaFala(fala: FalaInterpretada, item: ItemFalavel): string | null {
  const partes = [marcaDaFala(fala.produto, item), fala.lembrete].filter((parte): parte is string => !!parte);
  return partes.length > 0 ? partes.join(' - ') : null;
}
