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
  selectedPdfFiles: File[] = [];
  pdfUploading = false;
  selectedMaterialThumbnailFile: File | null = null;
  materialThumbnailPreview: string | null = null;
  
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
  selectedThumbnailFile: File | null = null;
  thumbnailPreview: string | null = null;
  thumbnailUploading = false;

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
      url: [''],
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

  isDescendantOf(folder: any, ancestorId: string): boolean {
    const visited = new Set<string>();
    let current: any = folder;
    while (current) {
      const parentId: string | undefined = current.parent?._id || current.parent;
      if (!parentId || visited.has(parentId)) return false;
      if (parentId === ancestorId) return true;
      visited.add(parentId);
      current = this.folders.find((f: any) => f._id === parentId);
    }
    return false;
  }

  isValidParentOption(folder: any): boolean {
    if (!this.selectedFolder) return true;
    if (folder._id === this.selectedFolder._id) return false;
    return !this.isDescendantOf(folder, this.selectedFolder._id);
  }

  getFolderPath(folder: any): string {
    if (!folder) return '';
    const names: string[] = [];
    const visited = new Set<string>();
    let current: any = folder;
    while (current) {
      names.unshift(current.name);
      const parentId: string | undefined = current.parent?._id || current.parent;
      if (!parentId || visited.has(parentId)) break;
      visited.add(parentId);
      current = this.folders.find((f: any) => f._id === parentId);
    }
    return names.join(' / ');
  }

  openFolderModal(parentId?: string): void {
    this.folderForm.reset({ parent: parentId || '' });
    this.selectedFolder = null;
    this.selectedThumbnailFile = null;
    this.thumbnailPreview = null;
    this.showFolderModal = true;
  }

  openEditFolderModal(folder: any): void {
    this.selectedFolder = folder;
    this.folderForm.patchValue({
      name: folder.name,
      description: folder.description || '',
      parent: folder.parent?._id || folder.parent || ''
    });
    this.selectedThumbnailFile = null;
    this.thumbnailPreview = folder.thumbnail ? this.getThumbnailUrl(folder.thumbnail) : null;
    this.showEditFolderModal = true;
  }

  closeFolderModals(): void {
    this.showFolderModal = false;
    this.showEditFolderModal = false;
    this.selectedFolder = null;
    this.folderForm.reset();
    this.selectedThumbnailFile = null;
    this.thumbnailPreview = null;
  }

  createFolder(): void {
    if (this.folderForm.invalid) return;
    this.loading = true;
    const data = { ...this.folderForm.value, order: this.folders.length };
    if (!data.parent) delete data.parent;
    this.trainingService.createFolder(data).subscribe({
      next: (res: any) => {
        const newFolder = res.folder;
        // Upload thumbnail if selected
        if (this.selectedThumbnailFile && newFolder?._id) {
          this.trainingService.uploadFolderThumbnail(newFolder._id, this.selectedThumbnailFile).subscribe({
            next: () => {
              this.success = 'Folder created with thumbnail!';
              this.finishFolderCreate();
            },
            error: () => {
              this.success = 'Folder created (thumbnail upload failed).';
              this.finishFolderCreate();
            }
          });
        } else {
          this.success = 'Folder created successfully!';
          this.finishFolderCreate();
        }
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to create folder';
        this.loading = false;
      }
    });
  }

  private finishFolderCreate(): void {
    this.loadFolders();
    this.closeFolderModals();
    this.loading = false;
    setTimeout(() => this.success = '', 3000);
  }

  updateFolder(): void {
    if (this.folderForm.invalid || !this.selectedFolder) return;
    this.loading = true;
    const data = { ...this.folderForm.value };
    if (!data.parent) data.parent = null;
    this.trainingService.updateFolder(this.selectedFolder._id, data).subscribe({
      next: () => {
        // Upload new thumbnail if selected
        if (this.selectedThumbnailFile) {
          this.trainingService.uploadFolderThumbnail(this.selectedFolder._id, this.selectedThumbnailFile).subscribe({
            next: () => {
              this.success = 'Folder updated with new thumbnail!';
              this.finishFolderUpdate();
            },
            error: () => {
              this.success = 'Folder updated (thumbnail upload failed).';
              this.finishFolderUpdate();
            }
          });
        } else {
          this.success = 'Folder updated successfully!';
          this.finishFolderUpdate();
        }
      },
      error: (err: any) => {
        this.error = err.error?.message || 'Failed to update folder';
        this.loading = false;
      }
    });
  }

  private finishFolderUpdate(): void {
    this.loadFolders();
    this.closeFolderModals();
    this.loading = false;
    setTimeout(() => this.success = '', 3000);
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

  // ========== FOLDER THUMBNAIL ==========

  onThumbnailSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (!file.type.startsWith('image/')) {
        this.error = 'Only image files are allowed.';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.error = 'Image must be under 5MB.';
        return;
      }
      this.selectedThumbnailFile = file;
      // Create preview URL
      const reader = new FileReader();
      reader.onload = () => this.thumbnailPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  removeThumbnail(folder: any): void {
    if (!confirm('Remove the thumbnail image from this folder?')) return;
    this.thumbnailUploading = true;
    this.trainingService.removeFolderThumbnail(folder._id).subscribe({
      next: () => {
        this.success = 'Thumbnail removed.';
        this.thumbnailUploading = false;
        this.thumbnailPreview = null;
        this.loadFolders();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => {
        this.error = 'Failed to remove thumbnail.';
        this.thumbnailUploading = false;
      }
    });
  }

  getThumbnailUrl(thumbPath: string): string {
    if (!thumbPath) return '';
    return `${environment.baseUrl}${thumbPath}`;
  }

  // ========== MATERIALS ==========

  loadMaterials(): void {
    this.loading = true;
    this.error = '';
    
    this.trainingService.getMaterials({ limit: 1000 }).subscribe({
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
    // FormGroup.reset() sets any control NOT included in the passed value back to
    // null (not its original FormBuilder default) — every optional field must be
    // listed explicitly here, or it gets submitted as null and fails Joi's string
    // validation on the backend (which allows '' but not null).
    this.trainingForm.reset({ title: '', description: '', type: 'video', url: '', duration: '', category: 'General', folder: '' });
    this.selectedMaterial = null;
    this.selectedPdfFiles = [];
    this.selectedMaterialThumbnailFile = null;
    this.materialThumbnailPreview = null;
    this.showCreateModal = true;
  }

  openEditModal(material: any): void {
    this.selectedMaterial = material;
    // Explicit fallbacks (not a `...material` spread) so a field the material
    // never set (e.g. duration) doesn't leave behind whatever null/stale value
    // was in the control from a previous reset(), which would fail validation
    // on save even though the user never touched that field.
    this.trainingForm.patchValue({
      title: material.title || '',
      description: material.description || '',
      type: material.type || 'video',
      url: material.url || '',
      duration: material.duration || '',
      category: material.category || 'General',
      folder: material.folder?._id || material.folder || ''
    });
    this.selectedPdfFiles = [];
    this.selectedMaterialThumbnailFile = null;
    this.materialThumbnailPreview = material.thumbnail ? this.getThumbnailUrl(material.thumbnail) : null;
    this.showEditModal = true;
  }

  closeModals(): void {
    this.showCreateModal = false;
    this.showEditModal = false;
    this.selectedMaterial = null;
    this.selectedPdfFiles = [];
    this.selectedMaterialThumbnailFile = null;
    this.materialThumbnailPreview = null;
    this.trainingForm.reset();
  }

  // A native <input type="file"> replaces its FileList on every selection
  // rather than adding to it, so reopening the picker to attach more PDFs
  // would otherwise silently drop everything picked earlier. Accumulate
  // across selections instead, and reset the input so re-adding a file
  // that was removed from the list still fires a change event.
  onPdfFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files ? Array.from(input.files) : [];
    const isDuplicate = (a: File, b: File) =>
      a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
    const newFiles = picked.filter(f => !this.selectedPdfFiles.some(existing => isDuplicate(existing, f)));
    this.selectedPdfFiles = [...this.selectedPdfFiles, ...newFiles];
    input.value = '';
  }

  removeSelectedPdfFile(index: number): void {
    this.selectedPdfFiles.splice(index, 1);
  }

  private uploadPdfIfSelected(materialId: string, callback: () => void): void {
    if (this.selectedPdfFiles.length === 0) {
      callback();
      return;
    }
    this.pdfUploading = true;
    this.trainingService.uploadPdf(materialId, this.selectedPdfFiles).subscribe({
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

  removePdfAttachment(material: any, attachment: any): void {
    if (!confirm(`Remove "${attachment.fileName}" from "${material.title}"?`)) return;
    this.trainingService.removePdfAttachment(material._id, attachment._id).subscribe({
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

  /** Removes the legacy single pdfAttachment field (materials created before multi-attachment support). */
  removeLegacyPdf(material: any): void {
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

  // ========== MATERIAL THUMBNAIL ==========

  onMaterialThumbnailSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      if (!file.type.startsWith('image/')) {
        this.error = 'Only image files are allowed.';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.error = 'Image must be under 5MB.';
        return;
      }
      this.selectedMaterialThumbnailFile = file;
      const reader = new FileReader();
      reader.onload = () => this.materialThumbnailPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  removeMaterialThumbnail(material: any): void {
    if (!confirm('Remove the thumbnail image from this material?')) return;
    this.trainingService.removeMaterialThumbnail(material._id).subscribe({
      next: () => {
        this.success = 'Thumbnail removed.';
        this.materialThumbnailPreview = null;
        this.loadMaterials();
        setTimeout(() => this.success = '', 3000);
      },
      error: () => {
        this.error = 'Failed to remove thumbnail.';
      }
    });
  }

  private uploadMaterialThumbnailIfSelected(materialId: string, callback: () => void): void {
    if (!this.selectedMaterialThumbnailFile) {
      callback();
      return;
    }
    this.trainingService.uploadMaterialThumbnail(materialId, this.selectedMaterialThumbnailFile).subscribe({
      next: () => callback(),
      error: (err: any) => {
        this.error = err.error?.message || 'Material saved but thumbnail upload failed';
        callback();
      }
    });
  }

  createMaterial(): void {
    if (this.trainingForm.invalid) {
      return;
    }
    if (!this.trainingForm.value.url && this.selectedPdfFiles.length === 0) {
      this.error = 'Provide a URL or attach a PDF file for this material.';
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
          this.uploadMaterialThumbnailIfSelected(newId, () => {
            this.success = 'Training material created successfully!';
            this.loadMaterials();
            this.closeModals();
            this.loading = false;
            setTimeout(() => this.success = '', 3000);
          });
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
    const hasExistingPdf = this.getAllPdfAttachments(this.selectedMaterial).length > 0;
    if (!this.trainingForm.value.url && this.selectedPdfFiles.length === 0 && !hasExistingPdf) {
      this.error = 'Provide a URL or attach a PDF file for this material.';
      return;
    }

    this.loading = true;
    const updateData = { ...this.trainingForm.value };
    if (!updateData.folder) updateData.folder = null;
    this.trainingService.updateMaterial(this.selectedMaterial._id, updateData).subscribe({
      next: () => {
        this.uploadPdfIfSelected(this.selectedMaterial._id, () => {
          this.uploadMaterialThumbnailIfSelected(this.selectedMaterial._id, () => {
            this.success = 'Training material updated successfully!';
            this.loadMaterials();
            this.closeModals();
            this.loading = false;
            setTimeout(() => this.success = '', 3000);
          });
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

  get f() { return this.trainingForm.controls; }
  get cf() { return this.categoryForm.controls; }
  get ff() { return this.folderForm.controls; }

  /** Combines the legacy single pdfAttachment (if any) with the pdfAttachments array for display. */
  getAllPdfAttachments(material: any): any[] {
    const list = [...(material?.pdfAttachments || [])];
    if (material?.pdfAttachment?.filePath) list.unshift(material.pdfAttachment);
    return list;
  }

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

  // training-pdfs are protected (unlike thumbnails) — a raw <a href> can't
  // send the Authorization header, so fetch via HttpClient and open as a blob.
  viewPdfAttachment(attachment: any): void {
    const filePath = attachment?.filePath;
    if (!filePath) return;
    const win = window.open('', '_blank');
    this.trainingService.downloadFileBlob(this.getFileUrl(filePath)).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (win && !win.closed) win.location.href = url;
        setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      },
      error: () => {
        if (win && !win.closed) win.close();
        this.error = 'Failed to open PDF attachment';
      }
    });
  }

  /** Returns the best thumbnail URL for a material: uploaded thumbnail > YouTube auto-thumbnail > null */
  getMaterialThumbnail(material: any): string | null {
    if (material.thumbnail) {
      return this.getFileUrl(material.thumbnail);
    }
    const url: string = material.url || '';
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) {
      return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
    }
    return null;
  }
}
