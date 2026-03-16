import { Component, OnInit } from '@angular/core';
import { OnboardingHubService, OnboardingDocType } from '../../../services/onboarding-hub.service';

@Component({
  selector: 'app-onboarding-doc-types',
  templateUrl: './onboarding-doc-types.component.html',
  styleUrls: ['./onboarding-doc-types.component.css']
})
export class OnboardingDocTypesComponent implements OnInit {
  docTypes: OnboardingDocType[] = [];
  loading = true;
  error = '';
  success = '';

  showForm = false;
  editMode = false;
  editingId = '';
  saving = false;

  form: Partial<OnboardingDocType> = this.blankForm();

  constructor(private onboardingHubService: OnboardingHubService) {}

  ngOnInit(): void { this.loadDocTypes(); }

  blankForm(): Partial<OnboardingDocType> {
    return {
      name: '',
      description: '',
      required: false,
      agentCanUpload: true,
      agentCanDelete: true,
      isReadOnlyLink: false,
      sortOrder: 0,
      isActive: true
    };
  }

  loadDocTypes(): void {
    this.loading = true;
    this.onboardingHubService.getAllDocTypes().subscribe({
      next: (types) => { this.docTypes = types; this.loading = false; },
      error: () => { this.error = 'Failed to load document types'; this.loading = false; }
    });
  }

  openNew(): void {
    this.editMode = false;
    this.editingId = '';
    this.form = this.blankForm();
    this.showForm = true;
    this.error = '';
  }

  openEdit(dt: OnboardingDocType): void {
    this.editMode = true;
    this.editingId = dt._id || '';
    this.form = { ...dt };
    this.showForm = true;
    this.error = '';
  }

  closeForm(): void {
    this.showForm = false;
    this.editingId = '';
  }

  save(): void {
    if (!this.form.name?.trim()) { this.error = 'Name is required'; return; }
    this.saving = true;
    this.error = '';

    const obs = this.editMode
      ? this.onboardingHubService.updateDocType(this.editingId, this.form)
      : this.onboardingHubService.createDocType(this.form);

    obs.subscribe({
      next: () => {
        this.success = `Document type ${this.editMode ? 'updated' : 'created'} successfully`;
        this.closeForm();
        this.loadDocTypes();
        this.saving = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Save failed';
        this.saving = false;
      }
    });
  }

  toggleActive(dt: OnboardingDocType): void {
    if (!dt._id) return;
    const newState = !dt.isActive;
    this.onboardingHubService.updateDocType(dt._id, { isActive: newState }).subscribe({
      next: () => {
        this.success = `Document type ${newState ? 'activated' : 'deactivated'}`;
        this.loadDocTypes();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => { this.error = 'Failed to update document type'; }
    });
  }

  deleteDocType(dt: OnboardingDocType): void {
    if (!dt._id) return;
    if (!confirm(`Permanently delete "${dt.name}"? This cannot be undone.`)) return;
    this.onboardingHubService.deleteDocType(dt._id).subscribe({
      next: () => {
        this.success = `"${dt.name}" deleted`;
        this.loadDocTypes();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err) => { this.error = err.error?.message || 'Delete failed'; }
    });
  }
}
