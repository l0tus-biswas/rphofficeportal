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
    
    // Only apply saved language if not already translated
    if (savedLang && savedLang !== 'en') {
      console.log('Checking if page needs translation for:', savedLang);
      
      // Check if page is already translated
      setTimeout(() => {
        const isTranslated = document.querySelector('.translated-ltr, .translated-rtl, body.translated-ltr, body.translated-rtl');
        const currentCookie = document.cookie.split('; ').find(row => row.startsWith('googtrans='));
        
        console.log('Is translated:', !!isTranslated);
        console.log('Current googtrans cookie:', currentCookie);
        
        // Only apply if not already translated and no cookie set
        if (!isTranslated && !currentCookie) {
          console.log('Page not translated, applying saved language via cookies:', savedLang);
          this.applyLanguageViaCookie(savedLang);
          
          // Give it more time to translate
          setTimeout(() => {
            const stillNotTranslated = !document.querySelector('.translated-ltr, .translated-rtl, body.translated-ltr, body.translated-rtl');
            if (stillNotTranslated && savedLang !== 'en') {
              console.log('Page still not translated after cookie set, reloading...');
              window.location.reload();
            }
          }, 2000);
        }
      }, 1000);
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

    let attempts = 0;
    const maxAttempts = 20;

    const checkAndInit = () => {
      attempts++;
      
      // Check if both google and TranslateElement are available
      if (typeof google !== 'undefined' && 
          google.translate && 
          typeof google.translate.TranslateElement === 'function') {
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
      } else if (attempts < maxAttempts) {
        console.log(`Google Translate not ready, attempt ${attempts}/${maxAttempts}`);
        setTimeout(checkAndInit, 500);
      } else {
        console.error('Google Translate failed to load after', maxAttempts, 'attempts');
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

    // Get domain variations for cookie clearing
    const hostname = window.location.hostname;
    const domains = [
      '', // no domain
      hostname,
      `.${hostname}`
    ];

    // Clear all existing Google Translate cookies thoroughly
    const expireDate = 'Thu, 01 Jan 1970 00:00:00 UTC';
    domains.forEach(domain => {
      const domainStr = domain ? `; domain=${domain}` : '';
      document.cookie = `googtrans=; expires=${expireDate}; path=/${domainStr}`;
      document.cookie = `googtrans=; expires=${expireDate}; path=/; SameSite=None; Secure${domainStr}`;
    });

    console.log('Cleared existing cookies');

    // Small delay to ensure cookies are cleared before setting new ones
    setTimeout(() => {
      // Set new language cookie
      if (langCode !== 'en') {
        const cookieValue = `/en/${langCode}`;
        const expires = new Date();
        expires.setTime(expires.getTime() + (365 * 24 * 60 * 60 * 1000));
        
        domains.forEach(domain => {
          const domainStr = domain ? `; domain=${domain}` : '';
          document.cookie = `googtrans=${cookieValue}; expires=${expires.toUTCString()}; path=/${domainStr}`;
        });
        
        console.log('Set new cookies for language:', langCode);
        console.log('Cookie value:', cookieValue);
      } else {
        console.log('Resetting to English (clearing all cookies)');
      }
      
      console.log('Current cookies:', document.cookie);

      // Try to trigger via select element without reload first
      const selectElement = document.querySelector('.goog-te-combo') as HTMLSelectElement;
      if (selectElement) {
        console.log('Found Google Translate select, setting value to:', langCode);
        selectElement.value = langCode;
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Wait a bit to see if translation happens automatically
        setTimeout(() => {
          const isTranslated = document.querySelector('.translated-ltr, .translated-rtl, body.translated-ltr, body.translated-rtl');
          if (!isTranslated && langCode !== 'en') {
            console.log('Translation did not occur automatically, reloading page...');
            window.location.reload();
          } else if (langCode === 'en') {
            // For English, always reload to clear translation
            console.log('Reloading to restore English...');
            window.location.reload();
          }
        }, 500);
      } else {
        console.log('Google Translate select element not found, reloading page...');
        // If select not found, reload immediately
        setTimeout(() => {
          window.location.reload();
        }, 200);
      }
    }, 50);
  }

  resetToEnglish(): void {
    console.log('Resetting to English');
    this.currentLanguage = 'en';
    localStorage.setItem('selectedLanguage', 'en');
    
    // Clear all Google Translate cookies with all domain variations
    const hostname = window.location.hostname;
    const domains = ['', hostname, `.${hostname}`];
    const expireDate = 'Thu, 01 Jan 1970 00:00:00 UTC';
    
    domains.forEach(domain => {
      const domainStr = domain ? `; domain=${domain}` : '';
      document.cookie = `googtrans=; expires=${expireDate}; path=/${domainStr}`;
      document.cookie = `googtrans=; expires=${expireDate}; path=/; SameSite=None; Secure${domainStr}`;
    });
    
    console.log('Cookies cleared, reloading page');
    
    // Reload to show original English content
    setTimeout(() => {
      window.location.reload();
    }, 200);
  }
}