import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CouponService {
  private apiUrl = `${environment.apiUrl}/admin/coupons`;

  constructor(private http: HttpClient) {}

  getCoupons(params?: any): Observable<any> {
    let httpParams = new HttpParams();
    
    if (params) {
      Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
          httpParams = httpParams.set(key, params[key].toString());
        }
      });
    }

    return this.http.get(this.apiUrl, { params: httpParams });
  }

  getCoupon(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  createCoupon(couponData: any): Observable<any> {
    return this.http.post(this.apiUrl, couponData);
  }

  updateCoupon(id: string, couponData: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, couponData);
  }

  deleteCoupon(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  toggleCouponStatus(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/toggle`, {});
  }

  verifyCoupon(code: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/verify/${code}`);
  }
}
