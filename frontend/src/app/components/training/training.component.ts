import { Component, OnInit } from '@angular/core';
import { TrainingService } from '../../services/training.service';

@Component({
  selector: 'app-training',
  templateUrl: './training.component.html',
  styleUrls: ['./training.component.css']
})
export class TrainingComponent implements OnInit {
  materials: any[] = [];
  filteredMaterials: any[] = [];
  loading = false;
  error = '';
  
  selectedCategory = 'all';
  selectedType = 'all';
  searchTerm = '';
  
  categories: string[] = [];
  types = ['all', 'video', 'document', 'link', 'youtube', 'other'];

  constructor(private trainingService: TrainingService) { }

  ngOnInit(): void {
    this.loadMaterials();
  }

  loadMaterials(): void {
    this.loading = true;
    this.error = '';
    
    this.trainingService.getMaterials().subscribe({
      next: (response: any) => {
        this.materials = (response.materials || []).sort((a: any, b: any) => 
          (a.order || 0) - (b.order || 0)
        );
        this.extractCategories();
        this.applyFilters();
        this.loading = false;
      },
      error: (error: any) => {
        this.error = error.error?.message || 'Failed to load training materials';
        this.loading = false;
      }
    });
  }

  extractCategories(): void {
    const categorySet = new Set(this.materials.map(m => m.category).filter(c => c));
    this.categories = ['all', ...Array.from(categorySet)];
  }

  applyFilters(): void {
    this.filteredMaterials = this.materials.filter(material => {
      const matchesCategory = this.selectedCategory === 'all' || material.category === this.selectedCategory;
      const matchesType = this.selectedType === 'all' || material.type === this.selectedType;
      const matchesSearch = !this.searchTerm || 
        material.title?.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        material.description?.toLowerCase().includes(this.searchTerm.toLowerCase());
      
      return matchesCategory && matchesType && matchesSearch;
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  getTypeIcon(type: string): string {
    const icons: any = {
      'video': 'bi-camera-video-fill',
      'youtube': 'bi-youtube',
      'document': 'bi-file-earmark-text-fill',
      'link': 'bi-link-45deg',
      'other': 'bi-file-earmark'
    };
    return icons[type] || 'bi-file-earmark';
  }

  getTypeBadgeClass(type: string): string {
    const classes: any = {
      'video': 'bg-danger',
      'youtube': 'bg-danger',
      'document': 'bg-primary',
      'link': 'bg-info',
      'other': 'bg-secondary'
    };
    return classes[type] || 'bg-secondary';
  }
}
