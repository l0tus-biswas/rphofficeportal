import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';

// Components
import { LoginComponent } from './components/login/login.component';
import { ApplyComponent } from './components/apply/apply.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { ProfileComponent } from './components/profile/profile.component';
import { RecruitsComponent } from './components/recruits/recruits.component';
import { DownlineComponent } from './components/downline/downline.component';
import { TrainingComponent } from './components/training/training.component';
import { NavbarComponent } from './components/shared/navbar/navbar.component';
import { SidebarComponent } from './components/shared/sidebar/sidebar.component';
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

// Pipes
import { SafePipe } from './pipes/safe.pipe';

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    ApplyComponent,
    DashboardComponent,
    ProfileComponent,
    RecruitsComponent,
    DownlineComponent,
    TrainingComponent,
    NavbarComponent,
    SidebarComponent,
    UserManagementComponent,
    HierarchyComponent,
    TrainingManagementComponent,
    CouponManagementComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    OnboardingUploadComponent,
    OnboardingStatusComponent,
    AdminOnboardingListComponent,
    AdminOnboardingDetailComponent,
    SystemConfigComponent,
    SafePipe
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    DragDropModule,
    ReactiveFormsModule
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
