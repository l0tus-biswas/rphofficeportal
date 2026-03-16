import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface VistaprintConfig {
  englishUrl: string;
  spanishUrl: string;
  affiliateId: string;
  englishPreview: string;
  spanishPreview: string;
}

@Injectable({
  providedIn: 'root'
})
export class BusinessCardsService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /** Get current Vistaprint config (authenticated) */
  getConfig(): Observable<{ config: VistaprintConfig }> {
    return this.http.get<{ config: VistaprintConfig }>(`${this.apiUrl}/business-cards/config`);
  }

  /** Admin: update URLs and affiliate ID */
  updateConfig(body: { englishUrl: string; spanishUrl: string; affiliateId: string }): Observable<{ message: string; config: VistaprintConfig }> {
    return this.http.post<{ message: string; config: VistaprintConfig }>(`${this.apiUrl}/business-cards/admin/config`, body);
  }

  /** Admin: upload preview image for a template */
  uploadPreview(formData: FormData): Observable<{ message: string; language: string; path: string }> {
    return this.http.post<{ message: string; language: string; path: string }>(`${this.apiUrl}/business-cards/admin/upload-preview`, formData);
  }
}
