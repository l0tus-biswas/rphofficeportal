import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { TrainingService } from '../../../services/training.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-training-management',
  templateUrl: './training-management.component.html',
  styleUrls: ['./training-management.component.css']
})
export class TrainingManagementComponent implements OnInit {
  // === Materials ===
  materials: any[] = [];
  filteredMaterials: any[] = [];
  loading = false;
  error = '';
  success = '';
  
  showCreateModal = false;
  showEditModal = false;
  trainingForm!: FormGroup;
  selectedMaterial: any = null;
  selectedPdfFile: File | null = null;
  pdfUploading = false;
  
  typeFilter = 'all';
  searchTerm = '';
  folderFilter = 'all';

  // === Categories (dynamic from API) ===
  categories: any[] = [];
  showCategoryModal = false;
  showEditCategoryModal = false;
  categoryForm!: FormGroup;
  selectedCategory: any = null;

  // === Folders ===
  folders: any[] = [];
  rootFolders: any[] = [];
  showFolderModal = false;
  showEditFolderModal = false;
  folderForm!: FormGroup;
  selectedFolder: any = null;

  // === Active Tab ===
  activeTab: 'materials' | 'categories' | 'folders' = 'materials';

  constructor(
    private formBuilder: FormBuilder,
    private trainingService: TrainingService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.initCategoryForm();
    this.initFolderForm();
    this.loadAll();
  }

  loadAll(): void {
    this.loadCategories();
    this.loadFolders();
    this.loadMaterials();
  }

  // ========== FORMS ==========

  initForm(): void {
    this.trainingForm = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required]],
      type: ['video', [Validators.required]],
      url: ['', [Validators.required]],
      duration: [''],
      category: ['General'],
      folder: ['']
    });

    // Auto-detect content type when URL changes
    this.trainingForm.get('url')?.valueChanges.subscribe((url: string) => {
      if (url) {
        const detected = this.detectContentType(url);
        if (detected) {
          this.trainingForm.get('type')?.setValue(detected, { emitEvent: false });
        }
      }
    });
  }

  initCategoryForm(): void {
    this.categoryForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: ['']
    });
  }

  initFolderForm(): void {
    this.folderForm = this.formBuilder.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      parent: ['']
    });
  }

  detectContentType(url: string): string | null {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (/(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed\/)/.test(lower)) return 'youtube';
    if (/loom\.com\/share\//.test(lower)) return 'loom';
    if (/vimeo\.com\/\d+/.test(lower)) return 'video';
    if (/\.pdf(\?.*)?$/.test(lower)) return 'document';
    if (/\.(docx?|xlsx?|pptx?|txt|csv)(\?.*)?$/.test(lower)) return 'document';
    if (/medium\.com|blog\.|wordpress\.com|substack\.com/.test(lower)) return 'article';
    return 'link';
  }

  // ========== CATEGORIES ==========

  loadCategories(): void {
    this.trainingService.getCategories().subscribe({
      next: (response: any) => {
        this.categories = response.categories || [];
      },
      error: () => {}
    });
  }

  getCategoryNames(): string[] {
    return this.categories.map((c: any) => c.name || c);
  }

  openCategoryModal(): void {
    this.categoryForm.reset();
    this.selectedCategory = null;
    this.showCategoryModal = true;
  }

  openEditCategoryModal(category: any): void {
    this.selectedCategory = category;
    this.categoryForm.patchValue({
      name: category.name,
      description: category.description || ''
    });
    this.showEditCategoryModal = true;
  }

  closeCategoryModals(): void {
    this.showCategoryModal = false;
    this.showEditCategoryModal = false;
    this.selectedCategory = null;
    this.categoryForm.reset();
  }

  createCategory(): void {
    if (this.categoryForm.invalid) return;
    this.loading = true;
    const data = { ...this.categoryForm.value, order: this.categories.length };
    this.trainingService.createCategory(data).subscribe({
      next: () => {
        this.success = 'Category created successfully!';
        this.loadCategories();
        this.closeCategoryModals();
        this.loading = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to create category';
        this.loading = false;
      }
    });
  }

  updateCategory(): void {
    if (this.categoryForm.invalid || !this.selectedCategory) return;
    this.loading = true;
    this.trainingService.updateCategory(this.selectedCategory._id, this.categoryForm.value).subscribe({
      next: () => {
        this.success = 'Category updated successfully!';
        this.loadCategories();
        this.loadMaterials();
        this.closeCategoryModals();
        this.loading = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to update category';
        this.loading = false;
      }
    });
  }

  deleteCategory(category: any): void {
    if (!confirm(`Delete category "${category.name}"? Materials in this category will be moved to "General".`)) return;
    this.trainingService.deleteCategory(category._id).subscribe({
      next: () => {
        this.success = 'Category deleted';
        this.loadCategories();
        this.loadMaterials();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete category';
      }
    });
  }

  // ========== FOLDERS ==========

  loadFolders(): void {
    this.trainingService.getFolders().subscribe({
      next: (response: any) => {
        this.folders = response.folders || [];
        this.rootFolders = this.folders.filter((f: any) => !f.parent);
      },
      error: () => {}
    });
  }

  getSubfolders(parentId: string): any[] {
    return this.folders.filter((f: any) => {
      const pid = f.parent?._id || f.parent;
      return pid === parentId;
    });
  }

  getFolderPath(folder: any): string {
    if (!folder) return '';
    const parentName = folder.parent?.name || '';
    return parentName ? `${parentName} / ${folder.name}` : folder.name;
  }

  openFolderModal(parentId?: string): void {
    this.folderForm.reset({ parent: parentId || '' });
    this.selectedFolder = null;
    this.showFolderModal = true;
  }

  openEditFolderModal(folder: any): void {
    this.selectedFolder = folder;
    this.folderForm.patchValue({
      name: folder.name,
      description: folder.description || '',
      parent: folder.parent?._id || folder.parent || ''
    });
    this.showEditFolderModal = true;
  }

  closeFolderModals(): void {
    this.showFolderModal = false;
    this.showEditFolderModal = false;
    this.selectedFolder = null;
    this.folderForm.reset();
  }

  createFolder(): void {
    if (this.folderForm.invalid) return;
    this.loading = true;
    const data = { ...this.folderForm.value, order: this.folders.length };
    if (!data.parent) delete data.parent;
    this.trainingService.createFolder(data).subscribe({
      next: () => {
        this.success = 'Folder created successfully!';
        this.loadFolders();
        this.closeFolderModals();
        this.loading = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to create folder';
        this.loading = false;
      }
    });
  }

  updateFolder(): void {
    if (this.folderForm.invalid || !this.selectedFolder) return;
    this.loading = true;
    const data = { ...this.folderForm.value };
    if (!data.parent) data.parent = null;
    this.trainingService.updateFolder(this.selectedFolder._id, data).subscribe({
      next: () => {
        this.success = 'Folder updated successfully!';
        this.loadFolders();
        this.closeFolderModals();
        this.loading = false;
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to update folder';
        this.loading = false;
      }
    });
  }

  deleteFolder(folder: any): void {
    if (!confirm(`Delete folder "${folder.name}"? Contents will be moved to its parent folder.`)) return;
    this.trainingService.deleteFolder(folder._id).subscribe({
      next: () => {
        this.success = 'Folder deleted';
        this.loadFolders();
        this.loadMaterials();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to delete folder';
      }
    });
  }

  // ========== MATERIALS ==========

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
      const matchesFolder = this.folderFilter === 'all' ||
        (this.folderFilter === 'none' && !material.folder) ||
        (material.folder?._id === this.folderFilter || material.folder === this.folderFilter);
      
      return matchesType && matchesSearch && matchesFolder;
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  openCreateModal(): void {
    this.trainingForm.reset({ type: 'video', category: 'General', folder: '' });
    this.selectedMaterial = null;
    this.showCreateModal = true;
  }

  openEditModal(material: any): void {
    this.selectedMaterial = material;
    this.trainingForm.patchValue({
      ...material,
      folder: material.folder?._id || material.folder || ''
    });
    this.showEditModal = true;
  }

  closeModals(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.selectedMaterial = null;
    this.selectedPdfFile = null;
    this.trainingForm.reset();
  }

  onPdfFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedPdfFile = input.files && input.files.length > 0 ? input.files[0] : null;
  }

  private uploadPdfIfSelected(materialId: string, callback: () => void): void {
    if (!this.selectedPdfFile) {
      callback();
      return;
    }
    this.pdfUploading = true;
    this.trainingService.uploadPdf(materialId, this.selectedPdfFile).subscribe({
      next: () => {
        this.pdfUploading = false;
        callback();
      },
      error: (err: any) => {
        this.pdfUploading = false;
        this.error = err.error?.message || 'Material saved but PDF upload failed';
        callback();
      }
    });
  }

  removePdf(material: any): void {
    if (!confirm(`Remove the PDF attachment from "${material.title}"?`)) return;
    this.trainingService.removePdf(material._id).subscribe({
      next: () => {
        this.success = 'PDF attachment removed';
        this.loadMaterials();
        setTimeout(() => this.success = '', 3000);
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to remove PDF';
      }
    });
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
    // Clean folder field
    if (!materialData.folder) delete materialData.folder;
    
    this.trainingService.createMaterial(materialData).subscribe({
      next: (response: any) => {
        const newId = response.material?._id || response._id;
        this.uploadPdfIfSelected(newId, () => {
          this.success = 'Training material created successfully!';
          this.loadMaterials();
          this.closeModals();
          this.loading = false;
          setTimeout(() => this.success = '', 3000);
        });
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
    const updateData = { ...this.trainingForm.value };
    if (!updateData.folder) updateData.folder = null;
    this.trainingService.updateMaterial(this.selectedMaterial._id, updateData).subscribe({
      next: () => {
        this.uploadPdfIfSelected(this.selectedMaterial._id, () => {
          this.success = 'Training material updated successfully!';
          this.loadMaterials();
          this.closeModals();
          this.loading = false;
          setTimeout(() => this.success = '', 3000);
        });
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
      'youtube': 'bi-youtube',
      'loom': 'bi-play-circle-fill',
      'document': 'bi-file-earmark-text-fill',
      'link': 'bi-link-45deg',
      'article': 'bi-file-text-fill'
    };
    return icons[type] || 'bi-file-earmark';
  }

  getTypeBadgeClass(type: string): string {
    const classes: any = {
      'video': 'bg-danger',
      'youtube': 'bg-danger',
      'loom': 'bg-danger',
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

  dropCategory(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.categories, event.previousIndex, event.currentIndex);
    const updates: Promise<any>[] = [];
    this.categories.forEach((cat, index) => {
      cat.order = index;
      updates.push(this.trainingService.updateCategory(cat._id, { order: index }).toPromise());
    });
    Promise.all(updates).then(() => {
      this.success = 'Categories reordered successfully!';
      setTimeout(() => this.success = '', 3000);
    }).catch(() => {
      this.error = 'Failed to reorder categories.';
      setTimeout(() => this.error = '', 5000);
      this.loadCategories();
    });
  }

  dropFolder(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.rootFolders, event.previousIndex, event.currentIndex);
    const updates: Promise<any>[] = [];
    this.rootFolders.forEach((folder: any, index: number) => {
      folder.order = index;
      updates.push(this.trainingService.updateFolder(folder._id, { order: index }).toPromise());
    });
    Promise.all(updates).then(() => {
      this.success = 'Folders reordered successfully!';
      setTimeout(() => this.success = '', 3000);
      this.loadFolders();
    }).catch(() => {
      this.error = 'Failed to reorder folders.';
      setTimeout(() => this.error = '', 5000);
      this.loadFolders();
    });
  }

  dropSubfolder(event: CdkDragDrop<any[]>, parentId: string): void {
    if (event.previousIndex === event.currentIndex) return;
    const subs = this.getSubfolders(parentId);
    moveItemInArray(subs, event.previousIndex, event.currentIndex);
    const updates: Promise<any>[] = [];
    subs.forEach((folder, index) => {
      folder.order = index;
      updates.push(this.trainingService.updateFolder(folder._id, { order: index }).toPromise());
    });
    Promise.all(updates).then(() => {
      this.success = 'Subfolders reordered successfully!';
      setTimeout(() => this.success = '', 3000);
    }).catch(() => {
      this.error = 'Failed to reorder subfolders.';
      setTimeout(() => this.error = '', 5000);
      this.loadFolders();
    });
  }

  get f() { return this.trainingForm.controls; }
  get cf() { return this.categoryForm.controls; }
  get ff() { return this.folderForm.controls; }

  getMaterialFolderName(material: any): string {
    if (!material.folder) return 'No folder';
    return material.folder?.name || 'Unknown folder';
  }

  /** Converts a server-relative path (e.g. /uploads/...) to a full absolute URL. */
  getFileUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.baseUrl}${path}`;
  }
}
