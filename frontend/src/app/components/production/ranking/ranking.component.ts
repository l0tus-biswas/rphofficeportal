import { Component, OnInit } from '@angular/core';
import { ProductionService, RankingEntry } from '../../../services/production.service';

@Component({
  selector: 'app-ranking',
  templateUrl: './ranking.component.html',
  styleUrls: ['./ranking.component.css']
})
export class RankingComponent implements OnInit {
  ranking: RankingEntry[] = [];
  rankingSortBy = 'premium';
  rankingWindow = 0;
  rankingLoading = false;

  constructor(private productionService: ProductionService) {}

  ngOnInit(): void {
    this.loadRanking();
  }

  loadRanking(): void {
    this.rankingLoading = true;
    this.productionService.getRanking(this.rankingSortBy, this.rankingWindow).subscribe({
      next: (data) => { this.ranking = data.ranking; this.rankingLoading = false; },
      error: () => { this.rankingLoading = false; }
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
}
