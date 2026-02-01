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
    const savedLang = localStorage.getItem('selectedLanguage') || 'en';
    this.currentLanguage = savedLang;
    
    console.log('Translation component loaded, saved language:', savedLang);
    
    // Initialize Google Translate
    this.initGoogleTranslate();
    
    // Apply saved language immediately using cookies
    if (savedLang && savedLang !== 'en') {
      console.log('Applying saved language via cookies:', savedLang);
      this.applyLanguageViaCookie(savedLang);
      
      // If page hasn't translated yet, reload it
      setTimeout(() => {
        const isTranslated = document.querySelector('.translated-ltr, .translated-rtl, body.translated-ltr, body.translated-rtl');
        if (!isTranslated && savedLang !== 'en') {
          console.log('Page not translated, reloading...');
          window.location.reload();
        }
      }, 2000);
    }
  }

  applyLanguageViaCookie(langCode: string): void {
    console.log('Setting Google Translate cookie for:', langCode);
    
    // Google Translate uses these specific cookie formats
    const cookieValue = `/en/${langCode}`;
    const domain = window.location.hostname;
    const expires = new Date();
    expires.setTime(expires.getTime() + (365 * 24 * 60 * 60 * 1000));
    
    // Set multiple cookie variations to ensure compatibility
    document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/`;
    document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/; domain=${domain}`;
    document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/; domain=.${domain}`;
    
    console.log('Cookies set:', document.cookie);
  }

  applySavedLanguage(langCode: string): void {
    this.applyLanguageViaCookie(langCode);
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
    console.log('changeLanguage called with:', langCode);
    console.log('Current language in localStorage:', localStorage.getItem('selectedLanguage'));
    
    // Update state and storage
    this.currentLanguage = langCode;
    localStorage.setItem('selectedLanguage', langCode);
    console.log('Updated localStorage selectedLanguage to:', langCode);

    // Clear all existing Google Translate cookies first
    const clearCookies = () => {
      const domain = window.location.hostname;
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}`;
      document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain}`;
    };

    clearCookies();
    console.log('Cleared existing cookies');

    // Set new language cookie
    if (langCode !== 'en') {
      const cookieValue = `/en/${langCode}`;
      const expires = new Date();
      expires.setTime(expires.getTime() + (365 * 24 * 60 * 60 * 1000));
      const domain = window.location.hostname;
      
      document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/`;
      document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/; domain=${domain}`;
      document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/; domain=.${domain}`;
      
      console.log('Set new cookies for language:', langCode);
      console.log('Cookie value:', cookieValue);
    } else {
      console.log('Resetting to English (clearing all cookies)');
    }
    
    console.log('Current cookies:', document.cookie);

    // Also try to trigger via select element
    const selectElement = document.querySelector('.goog-te-combo') as HTMLSelectElement;
    if (selectElement) {
      console.log('Found Google Translate select, setting value to:', langCode);
      selectElement.value = langCode;
      selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      console.log('Google Translate select element not found');
    }

    // Force reload to apply the translation
    console.log('Reloading page to apply translation...');
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }

  resetToEnglish(): void {
    console.log('Resetting to English');
    this.currentLanguage = 'en';
    localStorage.setItem('selectedLanguage', 'en');
    
    // Clear all Google Translate cookies
    const domain = window.location.hostname;
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${domain}`;
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${domain}`;
    
    console.log('Cookies cleared, reloading page');
    
    // Reload to show original English content
    window.location.reload();
  }
}