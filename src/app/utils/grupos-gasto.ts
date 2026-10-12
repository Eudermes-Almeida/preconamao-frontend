// Gráfico de gastos do carrinho: os 19 setores do mapa da loja (layout_posicao.nome_setor, sem o
// "1/2/3") agrupados em 6 fatias, mais "Outros" para produto sem setor — sem ela a soma do gráfico
// não bateria com o Valor Total. As cores seguem o grupo (nunca a posição no ranking) e foram
// conferidas para daltonismo na ordem da rosca (inclusive a volta do 6º para o 1º, com "Outros" no meio).
export interface GrupoGasto {
  id: string;
  nome: string;
  cor: string;
  setores: string[];
}

export const GRUPOS_GASTO: GrupoGasto[] = [
  { id: 'frescos', nome: 'Açougue, Pescados, Hortifrúti e Padaria', cor: '#2a78d6',
    setores: ['AÇOUGUE', 'PESCADOS', 'HORTIFRÚTI', 'PADARIA'] },
  { id: 'frios', nome: 'Frios, Laticínios e Congelados', cor: '#eb6834',
    setores: ['FRIOS E LATICÍNIOS', 'CONGELADOS E RESFRIADOS'] },
  { id: 'mercearia', nome: 'Mercearia', cor: '#1baf7a',
    setores: ['MERCEARIA'] },
  { id: 'bebidas', nome: 'Bebidas e Bomboniere', cor: '#eda100',
    setores: ['BEBIDAS ALCOÓLICAS', 'BEBIDAS NÃO ALCOÓLICAS', 'BOMBONIERE'] },
  { id: 'higiene', nome: 'Higiene, Beleza e Farmácia', cor: '#e87ba4',
    setores: ['HIGIENE E BELEZA', 'PERFUMARIA', 'FARMÁCIA/DROGARIA', 'BEM ESTAR', 'INFANTIL'] },
  { id: 'limpeza', nome: 'Limpeza, Bazar e Pet', cor: '#008300',
    setores: ['LIMPEZA', 'BAZAR', 'ECOLOGIA', 'PET SHOP'] },
];

export const GRUPO_OUTROS: GrupoGasto = { id: 'outros', nome: 'Outros (sem setor no mapa)', cor: '#8a8f98', setores: [] };

// "MERCEARIA 2" -> "MERCEARIA"; o número só separa os corredores do mesmo setor.
export function setorSemNumero(nomeSetor: string | null | undefined): string | undefined {
  const setor = nomeSetor?.trim().replace(/\s+\d+$/, '').toUpperCase();
  return setor || undefined;
}

export function grupoDoSetor(setor: string | null | undefined): GrupoGasto {
  const nome = setorSemNumero(setor);
  return (nome && GRUPOS_GASTO.find(grupo => grupo.setores.includes(nome))) || GRUPO_OUTROS;
}
