import { Component, Input } from '@angular/core';
import { LocalizacaoDTO } from '../../services/produto-api.service';

// Grade fixa da loja piloto (ver layout_loja.png e scripts/010_layout_loja.sql, no repo
// de modelagem): 5 ruas x 3 quarteirões, mais 3 balcões (Padaria/Açougue/Farmácia) no
// topo. Não é um layout genérico — é específico desta loja; outra loja piloto exigiria
// outra grade (fora de escopo agora, MVP é só esta unidade).
@Component({
  selector: 'app-mapa-loja',
  standalone: true,
  templateUrl: './mapa-loja.component.html',
  styleUrl: './mapa-loja.component.css'
})
export class MapaLojaComponent {

  @Input() localizacao?: LocalizacaoDTO;

  // Versão maior, usada em tela cheia (modo "Localizador de produto"); a mini versão
  // inline não usa isto (fica no tamanho padrão, discreto).
  @Input() grande = false;

  readonly ruas = [1, 2, 3, 4, 5];
  readonly quarteiroes = ['A', 'B', 'C'];

  // Verdadeiro só para a metade (esquerda ou direita) do quarteirão que corresponde à
  // localização atual — é essa metade que pisca.
  metadeAtiva(rua: number, quarteirao: string, lado: 'ESQUERDA' | 'DIREITA'): boolean {
    return this.localizacao?.lado === lado
        && this.localizacao?.rua === rua
        && this.localizacao?.quarteirao === quarteirao;
  }

  // Os balcões (Padaria/Açougue/Farmácia) usam lado CENTRO e são identificados pelo
  // início do nome, já que "Farmácia/Drogaria" é o nome completo salvo no banco.
  cabecalhoAtivo(prefixoNome: string): boolean {
    return this.localizacao?.lado === 'CENTRO'
        && !!this.localizacao?.nomeSetor?.toUpperCase().startsWith(prefixoNome);
  }
}
