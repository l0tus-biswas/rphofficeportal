import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { TrainingMaterial } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class TrainingService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  private getHeaders() {
    return { headers: this.authService.getAuthHeaders() };
  }

  getMaterials(filters?: any): Observable<any> {
    let params = new HttpParams();
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params = params.set(key, filters[key]);
        }
      });
    }
    return this.http.get(`${this.apiUrl}/training/materials`, { 
      ...this.getHeaders(), 
      params 
    });
  }

  getMaterialById(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/training/materials/${id}`, this.getHeaders());
  }

  getCategories(): Observable<any> {
    return this.http.get(`${this.apiUrl}/training/categories`, this.getHeaders());
  }

  createMaterial(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/training/materials`, data, this.getHeaders());
  }

  updateMaterial(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/training/materials/${id}`, data, this.getHeaders());
  }

  deleteMaterial(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/training/materials/${id}`, this.getHeaders());
  }
}
