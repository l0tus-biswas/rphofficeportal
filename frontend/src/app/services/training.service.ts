import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
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

  // ===== CATEGORY CRUD (Admin) =====

  createCategory(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/training/categories`, data, this.getHeaders());
  }

  updateCategory(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/training/categories/${id}`, data, this.getHeaders());
  }

  deleteCategory(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/training/categories/${id}`, this.getHeaders());
  }

  // ===== FOLDER CRUD =====

  getFolders(): Observable<any> {
    return this.http.get(`${this.apiUrl}/training/folders`, this.getHeaders());
  }

  getFolderContents(folderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/training/folders/${folderId}/contents`, this.getHeaders());
  }

  createFolder(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/training/folders`, data, this.getHeaders());
  }

  updateFolder(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/training/folders/${id}`, data, this.getHeaders());
  }

  deleteFolder(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/training/folders/${id}`, this.getHeaders());
  }

  // ===== MATERIALS =====

  createMaterial(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/training/materials`, data, this.getHeaders());
  }

  updateMaterial(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/training/materials/${id}`, data, this.getHeaders());
  }

  deleteMaterial(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/training/materials/${id}`, this.getHeaders());
  }

  uploadPdf(id: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('pdf', file);
    // Only pass Authorization — do NOT set Content-Type so the browser sets multipart/form-data boundary
    const authHeader = new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
    return this.http.post(
      `${this.apiUrl}/training/materials/${id}/pdf`,
      formData,
      { headers: authHeader }
    );
  }

  removePdf(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/training/materials/${id}/pdf`, this.getHeaders());
  }
}
