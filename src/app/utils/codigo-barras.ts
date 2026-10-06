// Código canônico (multi-loja, regra 17): mesma regra do servidor (CodigoBarras.canonico) — sem os
// zeros da frente e completado até 13 dígitos; 14 dígitos sem zero na frente (caixa) fica igual.
// Usado ao receber listas da Família e ao conferir o carrinho com a resposta do servidor (o
// servidor devolve sempre o canônico; listas e carrinhos antigos podem ter "07891991010153").
export function codigoCanonico(codigo: string): string {
  const limpo = codigo.trim();
  if (!/^\d+$/.test(limpo)) {
    return limpo;
  }
  const semZeros = limpo.replace(/^0+/, '');
  return semZeros.length > 13 ? semZeros : semZeros.padStart(13, '0');
}
