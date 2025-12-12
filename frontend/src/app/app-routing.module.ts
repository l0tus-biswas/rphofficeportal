import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { ApplyComponent } from './components/apply/apply.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ProfileComponent } from './components/profile/profile.component';
import { RecruitsComponent } from './components/recruits/recruits.component';
import { DownlineComponent } from './components/downline/downline.component';
import { TrainingComponent } from './components/training/training.component';
import { UserManagementComponent } from './components/admin/user-management/user-management.component';
import { HierarchyComponent } from './components/admin/hierarchy/hierarchy.component';
import { TrainingManagementComponent } from './components/admin/training-management/training-management.component';
import { CouponManagementComponent } from './components/admin/coupon-management/coupon-management.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { OnboardingUploadComponent } from './components/onboarding/onboarding-upload/onboarding-upload.component';
import { OnboardingStatusComponent } from './components/onboarding/onboarding-status/onboarding-status.component';
import { AdminOnboardingListComponent } from './components/admin/onboarding-management/admin-onboarding-list/admin-onboarding-list.component';
import { AdminOnboardingDetailComponent } from './components/admin/onboarding-management/admin-onboarding-detail/admin-onboarding-detail.component';
import { SystemConfigComponent } from './components/admin/system-config/system-config.component';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'apply', component: ApplyComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'profile', 
    component: ProfileComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'recruits', 
    component: RecruitsComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'downline', 
    component: DownlineComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'training', 
    component: TrainingComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'dashboard/onboarding-upload', 
    component: OnboardingUploadComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'onboarding', 
    component: OnboardingStatusComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['agent', 'admin'] }
  },
  { 
    path: 'admin/users', 
    component: UserManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/hierarchy', 
    component: HierarchyComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/training', 
    component: TrainingManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/coupons', 
    component: CouponManagementComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/onboarding', 
    component: AdminOnboardingListComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/onboarding/:userId', 
    component: AdminOnboardingDetailComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { 
    path: 'admin/config', 
    component: SystemConfigComponent, 
    canActivate: [AuthGuard],
    data: { roles: ['admin'] }
  },
  { path: '**', redirectTo: '/dashboard' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
