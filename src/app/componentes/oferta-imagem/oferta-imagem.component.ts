import { Component, Input } from '@angular/core';
import { ProdutoDTO } from '../../services/produto-api.service';

// Imagem de oferta com o preço ATUAL desenhado por cima. As imagens em assets/publicidade/ são
// geradas sem o preço (skill gerar-ofertas, opção --sem-preco): se o preço mudar no PRICETAB, o
// anúncio muda junto. O selo copia o do gerador (amarelo, "R$" pequeno, centavos sobrescritos) e
// escala com a largura da imagem (unidades cqw).
@Component({
  selector: 'app-oferta-imagem',
  standalone: true,
  templateUrl: './oferta-imagem.component.html',
  styleUrl: './oferta-imagem.component.css'
})
export class OfertaImagemComponent {

  @Input({ required: true }) imagem!: string;
  @Input() alt = 'Oferta';
  // undefined enquanto o preço carrega (a imagem aparece sem selo).
  @Input() produto?: ProdutoDTO | null;
  @Input() carregamentoPreguicoso = false;

  get reais(): string {
    return Math.floor((this.produto?.precoCentavos ?? 0) / 100).toLocaleString('pt-BR');
  }

  get centavos(): string {
    return ',' + String((this.produto?.precoCentavos ?? 0) % 100).padStart(2, '0');
  }

  // Sem garantia de preço atualizado (agente da loja sem sinal): não mostra valor nenhum.
  get precoConfiavel(): boolean {
    return this.produto?.precoConfiavel !== false;
  }
}
