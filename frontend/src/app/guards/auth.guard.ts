import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) { }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    if (this.authService.isLoggedIn()) {
      // Check role-based access
      const requiredRoles = route.data['roles'] as Array<string>;
      
      if (requiredRoles) {
        const user = this.authService.getCurrentUser();
        if (user && requiredRoles.includes(user.role)) {
          return true;
        } else {
          this.router.navigate(['/dashboard']);
          return false;
        }
      }
      
      return true;
    }

    this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
}
