import { Injectable } from '@angular/core';

declare const google: any;

export interface AppLanguage {
  code: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly languages: AppLanguage[] = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish (Español)' }
  ];

  currentLanguage: string = localStorage.getItem('selectedLanguage') || 'en';

  private initialized = false;
  private initAttempts = 0;

  /** Creates the Google Translate widget once for the whole app and applies any saved language. */
  init(): void {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const tryInit = () => {
      if (typeof google !== 'undefined' &&
          google.translate &&
          typeof google.translate.TranslateElement === 'function') {
        let container = document.getElementById('google_translate_element_hidden');
        if (!container) {
          container = document.createElement('div');
          container.id = 'google_translate_element_hidden';
          container.style.display = 'none';
          document.body.appendChild(container);
        }

        new google.translate.TranslateElement(
          {
            pageLanguage: 'en',
            includedLanguages: this.languages.map(l => l.code).join(','),
            autoDisplay: false
          },
          'google_translate_element_hidden'
        );

        this.applyLanguage(this.currentLanguage);
      } else if (this.initAttempts < 40) {
        this.initAttempts += 1;
        setTimeout(tryInit, 250);
      }
    };

    tryInit();
  }

  changeLanguage(lang: string): void {
    this.currentLanguage = lang;
    if (lang === 'en') {
      localStorage.removeItem('selectedLanguage');
    } else {
      localStorage.setItem('selectedLanguage', lang);
    }

    this.applyLanguage(lang);
  }

  isLanguageActive(lang: string): boolean {
    return this.currentLanguage === lang;
  }

  getCurrentLanguageName(): string {
    return this.languages.find(l => l.code === this.currentLanguage)?.name || 'English';
  }

  /** Drives the Google Translate widget's own select — retries since the widget renders it asynchronously. */
  private applyLanguage(lang: string, attempt = 0): void {
    const selectElement = document.querySelector('.goog-te-combo') as HTMLSelectElement | null;

    if (selectElement) {
      selectElement.value = lang;
      selectElement.dispatchEvent(new Event('change'));
    } else if (attempt < 40) {
      setTimeout(() => this.applyLanguage(lang, attempt + 1), 250);
    }
  }
}
