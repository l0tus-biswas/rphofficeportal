import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { TrainingService } from '../../../services/training.service';

@Component({
  selector: 'app-training-management',
  templateUrl: './training-management.component.html',
  styleUrls: ['./training-management.component.css']
})
export class TrainingManagementComponent implements OnInit {
  materials: any[] = [];
  filteredMaterials: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  showCreateModal = false;
  showEditModal = false;
  trainingForm!: FormGroup;
  selectedMaterial: any = null;
  
  typeFilter = 'all';
  searchTerm = '';
  
  categories = [
    'Getting Started',
    'Basic Training',
    'Advanced Training',
    'Sales & Marketing',
    'Product Knowledge',
    'Leadership',
    'Compliance',
    'Technology',
    'General'
  ];

  constructor(
    private formBuilder: FormBuilder,
    private trainingService: TrainingService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadMaterials();
  }

  initForm(): void {
    this.trainingForm = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required]],
      type: ['video', [Validators.required]],
      url: ['', [Validators.required]],
      duration: [''],
      category: ['General']
    });
  }

  loadMaterials(): void {
    this.loading = true;
    this.error = '';
    
    this.trainingService.getMaterials().subscribe({
      next: (response: any) => {
        this.materials = (response.materials || []).sort((a: any, b: any) => 
          (a.order || 0) - (b.order || 0)
        );
        this.filteredMaterials = [...this.materials];
        this.loading = false;
        this.applyFilters();
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load training materials';
        this.loading = false;
      }
    });
  }

  applyFilters(): void {
    this.filteredMaterials = this.materials.filter(material => {
      const matchesType = this.typeFilter === 'all' || material.type === this.typeFilter;
      const matchesSearch = !this.searchTerm || 
        material.title?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        material.description?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        material.category?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      return matchesType && matchesSearch;
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  openCreateModal(): void {
    this.trainingForm.reset({ type: 'video', category: 'General' });
    this.selectedMaterial = null;
    this.showCreateModal = true;
  }

  openEditModal(material: any): void {
    this.selectedMaterial = material;
    this.trainingForm.patchValue(material);
    this.showEditModal = true;
  }

  closeModals(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.selectedMaterial = null;
    this.trainingForm.reset();
  }

  createMaterial(): void {
    if (this.trainingForm.invalid) {
      return;
    }

    this.loading = true;
    const materialData = {
      ...this.trainingForm.value,
      order: this.materials.length // Set order to end of list
    };
    
    this.trainingService.createMaterial(materialData).subscribe({
      next: (response) => {
        this.success = 'Training material created successfully!';
        this.loadMaterials();
        this.closeModals();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to create material';
        this.loading = false;
      }
    });
  }

  updateMaterial(): void {
    if (this.trainingForm.invalid || !this.selectedMaterial) {
      return;
    }

    this.loading = true;
    this.trainingService.updateMaterial(this.selectedMaterial._id, this.trainingForm.value).subscribe({
      next: (response) => {
        this.success = 'Training material updated successfully!';
        this.loadMaterials();
        this.closeModals();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to update material';
        this.loading = false;
      }
    });
  }

  deleteMaterial(material: any): void {
    if (!confirm(`Are you sure you want to delete "${material.title}"?`)) {
      return;
    }

    this.loading = true;
    this.trainingService.deleteMaterial(material._id).subscribe({
      next: (response) => {
        this.success = 'Training material deleted successfully!';
        this.loadMaterials();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to delete material';
        this.loading = false;
      }
    });
  }

  getTypeIcon(type: string): string {
    const icons: any = {
      'video': 'bi-camera-video-fill',
      'document': 'bi-file-earmark-text-fill',
      'link': 'bi-link-45deg',
      'article': 'bi-file-text-fill'
    };
    return icons[type] || 'bi-file-earmark';
  }

  getTypeBadgeClass(type: string): string {
    const classes: any = {
      'video': 'bg-danger',
      'document': 'bg-primary',
      'link': 'bg-info',
      'article': 'bg-success'
    };
    return classes[type] || 'bg-secondary';
  }

  drop(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) {
      console.log('Same position, no update needed');
      return;
    }
    
    console.log(`Moving item from ${event.previousIndex} to ${event.currentIndex}`);
    
    // Reorder the array
    moveItemInArray(this.filteredMaterials, event.previousIndex, event.currentIndex);
    
    // Update order for all materials based on new positions
    const updates: Promise<any>[] = [];
    this.filteredMaterials.forEach((material, index) => {
      material.order = index;
      updates.push(
        this.trainingService.updateMaterial(material._id, { order: index }).toPromise()
      );
    });

    // Save all updates
    Promise.all(updates).then(() => {
      console.log('Materials reordered successfully');
      this.success = 'Materials reordered successfully!';
      setTimeout(() => this.success = '', 3000);
    }).catch((error: any) => {
      console.error('Failed to update material order:', error);
      this.error = 'Failed to update material order. Please try again.';
      setTimeout(() => this.error = '', 5000);
      this.loadMaterials(); // Reload to revert changes
    });
  }

  get f() { return this.trainingForm.controls; }
}
