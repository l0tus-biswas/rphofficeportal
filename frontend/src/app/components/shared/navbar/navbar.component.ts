import { Component } from '@angular/core';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  constructor(public authService: AuthService) { }

  logout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }

  get currentUser() {
    return this.authService.getCurrentUser();
  }
}
