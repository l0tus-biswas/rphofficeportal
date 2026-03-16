import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TrainingService } from '../../services/training.service';
import { environment } from '../../../environments/environment';

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
  types = ['all', 'video', 'youtube', 'loom', 'document', 'link', 'article', 'other'];

  // Video player modal
  activePlayer: any = null;
  playerUrl: SafeResourceUrl | null = null;

  constructor(
    private trainingService: TrainingService,
    private sanitizer: DomSanitizer
  ) {}

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

  openPlayer(material: any): void {
    this.activePlayer = material;
    this.playerUrl = this.resolveEmbedUrl(material.url);
  }

  closePlayer(): void {
    this.activePlayer = null;
    this.playerUrl = null;
  }

  resolveEmbedUrl(url: string): SafeResourceUrl {
    let embedUrl = url;
    // YouTube: watch or short URL
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) {
      embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1`;
    } else {
      // Loom share URL
      const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
      if (loomMatch) {
        embedUrl = `https://www.loom.com/embed/${loomMatch[1]}`;
      } else {
        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
          embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
        }
        // Any other URL: use as-is in the iframe
      }
    }
    return this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
  }

  isEmbeddable(material: any): boolean {
    const url: string = material.url || '';
    if (['video', 'youtube', 'loom'].includes(material.type)) return true;
    // Auto-detect video platforms in link type
    if (/youtube\.com|youtu\.be|loom\.com|vimeo\.com/.test(url)) return true;
    if (material.type === 'link') return true;
    return false;
  }

  getTypeIcon(type: string): string {
    const icons: any = {
      'video': 'bi-camera-video-fill',
      'youtube': 'bi-youtube',
      'loom': 'bi-play-circle-fill',
      'document': 'bi-file-earmark-text-fill',
      'link': 'bi-link-45deg',
      'article': 'bi-file-text-fill',
      'other': 'bi-file-earmark'
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
      'article': 'bg-success',
      'other': 'bg-secondary'
    };
    return classes[type] || 'bg-secondary';
  }

  /** Converts a server-relative path (e.g. /uploads/...) to a full absolute URL. */
  getFileUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${environment.baseUrl}${path}`;
  }
}
