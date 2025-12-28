import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private apiUrl = `${environment.apiUrl}/user`;

  constructor(private http: HttpClient) { }

  getPaymentHistory(page: number = 1, limit: number = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}/payments?page=${page}&limit=${limit}`);
  }

  getSubscription(): Observable<any> {
    return this.http.get(`${this.apiUrl}/subscription`);
  }
}
