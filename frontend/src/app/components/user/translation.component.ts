import { Component } from '@angular/core';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-translation',
  templateUrl: './translation.component.html',
  styleUrls: ['./translation.component.css']
})
export class TranslationComponent {
  constructor(public translationService: TranslationService) {}

  changeLanguage(langCode: string): void {
    this.translationService.changeLanguage(langCode);
  }

  resetToEnglish(): void {
    this.translationService.changeLanguage('en');
  }
}
