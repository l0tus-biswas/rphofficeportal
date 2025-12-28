import { Component, OnInit } from '@angular/core';

declare var google: any;

interface Language {
  code: string;
  name: string;
}

@Component({
  selector: 'app-translation',
  templateUrl: './translation.component.html',
  styleUrls: ['./translation.component.css']
})
export class TranslationComponent implements OnInit {
  currentLanguage: string = 'en';
  
  languages: Language[] = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish (Español)' }
  ];

  ngOnInit(): void {
    // Get saved language
    this.currentLanguage = localStorage.getItem('selectedLanguage') || 'en';
    
    // Initialize Google Translate if not already done
    this.initGoogleTranslate();
  }

  getCurrentLanguageName(): string {
    const lang = this.languages.find(l => l.code === this.currentLanguage);
    return lang ? lang.name : 'English';
  }

  initGoogleTranslate(): void {
    // Check if Google Translate is already initialized
    const existingElement = document.querySelector('.goog-te-combo');
    if (existingElement) {
      console.log('Google Translate already initialized');
      return;
    }

    const checkAndInit = () => {
      if (typeof google !== 'undefined' && google.translate) {
        try {
          // Create a hidden element for Google Translate
          const div = document.createElement('div');
          div.id = 'google_translate_element_hidden';
          div.style.display = 'none';
          document.body.appendChild(div);

          new google.translate.TranslateElement(
            {
              pageLanguage: 'en',
              includedLanguages: this.languages.map(l => l.code).join(','),
              autoDisplay: false
            },
            'google_translate_element_hidden'
          );
          
          console.log('Google Translate initialized successfully');
        } catch (error) {
          console.error('Error initializing Google Translate:', error);
        }
      } else {
        setTimeout(checkAndInit, 500);
      }
    };

    checkAndInit();
  }

  changeLanguage(langCode: string): void {
    this.currentLanguage = langCode;
    localStorage.setItem('selectedLanguage', langCode);

    // Trigger Google Translate
    const checkAndTranslate = (attempts = 0) => {
      const selectElement = document.querySelector('.goog-te-combo') as HTMLSelectElement;
      
      if (selectElement) {
        selectElement.value = langCode;
        selectElement.dispatchEvent(new Event('change'));
        
        // Show success message
        alert(`Language changed to ${this.languages.find(l => l.code === langCode)?.name}`);
      } else if (attempts < 20) {
        setTimeout(() => checkAndTranslate(attempts + 1), 200);
      } else {
        console.error('Could not find Google Translate element');
        // Fallback: reload the page to apply translation
        window.location.reload();
      }
    };

    checkAndTranslate();
  }

  resetToEnglish(): void {
    this.changeLanguage('en');
    localStorage.removeItem('selectedLanguage');
    
    // Reload to show original content
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }
}
