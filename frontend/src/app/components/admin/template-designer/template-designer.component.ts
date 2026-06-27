import { Component, Input, Output, EventEmitter } from '@angular/core';
import { BusinessCardsService } from '../../../services/business-cards.service';

/**
 * Visual drag-position designer for card templates. Edits the SAME JSON shape
 * the server renderer consumes, so designs render identically at print time.
 * The parent owns persistence (templatesChange -> updateConfig).
 */
@Component({
  selector: 'app-template-designer',
  templateUrl: './template-designer.component.html',
  styleUrls: ['./template-designer.component.css']
})
export class TemplateDesignerComponent {
  @Input() templates: any[] = [];
  @Output() templatesChange = new EventEmitter<any[]>();

  tplIndex = 0;
  sideIndex = 0;
  selectedKey: string | null = null;
  displayWidth = 480;
  bgUploading = false;
  bgError = '';
  previewValues: { [k: string]: string } = {};   // stable empty map for the canvas

  readonly FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman',
    'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact'];
  readonly WEIGHTS = [300, 400, 500, 600, 700, 800];
  readonly ALIGNS = ['left', 'center', 'right'];

  constructor(private svc: BusinessCardsService) {}

  // ── Selection getters ──
  get template(): any { return this.templates[this.tplIndex] || null; }
  get side(): any { return this.template?.sides?.[this.sideIndex] || null; }
  get selectedField(): any {
    if (!this.side || !this.selectedKey || this.selectedKey === 'photo') return null;
    return (this.side.fields || []).find((f: any) => f.key === this.selectedKey) || null;
  }
  get pw(): number { return this.template?.printFile?.widthPx || 750; }
  get ph(): number { return this.template?.printFile?.heightPx || 1200; }

  private emit(): void { this.templatesChange.emit(this.templates); }

  // ── Template CRUD ──
  selectTemplate(i: number): void { this.tplIndex = i; this.sideIndex = 0; this.selectedKey = null; }

  addTemplate(): void {
    const id = 'card-' + Date.now().toString(36);
    // Default to the landscape RHP layout: photo on the left, four contact
    // fields aligned to the icon strip on the right; static back.
    this.templates.push({
      id, name: 'New Card', syncProductId: 0,
      variants: [{ label: '50 pieces', syncVariantId: 0, price: 0 }],
      orientation: 'landscape',
      printFile: { widthPx: 1050, heightPx: 600, dpi: 300 },
      sides: [this.rhpFrontSide(), this.rhpBackSide()]
    });
    this.tplIndex = this.templates.length - 1;
    this.sideIndex = 0; this.selectedKey = null;
    this.emit();
  }

  /** Landscape front: left photo + name/title/email/phone beside the icon strip. */
  private rhpFrontSide(): any {
    return {
      placement: 'default', label: 'Front', backgroundImage: '', fonts: [],
      photo: { x: 40, y: 40, w: 380, h: 520, fit: 'cover', shape: 'rect', borderRadius: 8 },
      fields: [
        { key: 'name',  label: 'Full Name', required: true,  x: 545, y: 70,  w: 470, align: 'left', family: 'Arial', weight: 700, size: 46, color: '#ffffff' },
        { key: 'title', label: 'Title',     required: false, x: 545, y: 210, w: 470, align: 'left', family: 'Arial', weight: 400, size: 40, color: '#e5e7eb' },
        { key: 'email', label: 'Email',     required: true,  x: 545, y: 345, w: 470, align: 'left', family: 'Arial', weight: 400, size: 34, color: '#ffffff' },
        { key: 'phone', label: 'Phone',     required: true,  x: 545, y: 478, w: 470, align: 'left', family: 'Arial', weight: 400, size: 38, color: '#ffffff' }
      ]
    };
  }

  /** Landscape back: fully static design (RHP solutions art), no fields. */
  private rhpBackSide(): any {
    return { placement: 'back', label: 'Back', backgroundImage: '', fonts: [], photo: null, fields: [] };
  }

  get orientation(): string {
    if (!this.template) return 'landscape';
    return this.template.orientation || (this.pw >= this.ph ? 'landscape' : 'portrait');
  }

  setOrientation(o: 'portrait' | 'landscape'): void {
    if (!this.template) return;
    const pf = this.template.printFile;
    const w = pf.widthPx, h = pf.heightPx;
    this.template.orientation = o;
    if (o === 'landscape' && w < h) { pf.widthPx = h; pf.heightPx = w; }
    if (o === 'portrait' && w > h) { pf.widthPx = h; pf.heightPx = w; }
    this.emit();
  }

  duplicateTemplate(i: number): void {
    const copy = JSON.parse(JSON.stringify(this.templates[i]));
    copy.id = (copy.id || 'card') + '-copy-' + Date.now().toString(36);
    copy.name = (copy.name || 'Card') + ' (copy)';
    this.templates.splice(i + 1, 0, copy);
    this.tplIndex = i + 1;
    this.emit();
  }

  deleteTemplate(i: number): void {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    this.templates.splice(i, 1);
    this.tplIndex = Math.max(0, Math.min(this.tplIndex, this.templates.length - 1));
    this.sideIndex = 0; this.selectedKey = null;
    this.emit();
  }

  // ── Variant CRUD ──
  addVariant(): void {
    this.template.variants = this.template.variants || [];
    this.template.variants.push({ label: '', syncVariantId: 0, price: 0 });
    this.emit();
  }
  removeVariant(i: number): void { this.template.variants.splice(i, 1); this.emit(); }

  // ── Side CRUD ──
  selectSide(i: number): void { this.sideIndex = i; this.selectedKey = null; }

  addSide(): void {
    const used = (this.template.sides || []).map((s: any) => s.placement);
    const placement = used.includes('default') ? 'back' : 'default';
    const label = placement === 'default' ? 'Front' : 'Back';
    this.template.sides.push(this.defaultSide(placement, label));
    this.sideIndex = this.template.sides.length - 1;
    this.emit();
  }

  removeSide(i: number): void {
    if (this.template.sides.length <= 1) return;
    this.template.sides.splice(i, 1);
    this.sideIndex = 0; this.selectedKey = null;
    this.emit();
  }

  private defaultSide(placement: string, label: string): any {
    return { placement, label, backgroundImage: '', fonts: [], photo: null, fields: [] };
  }

  // ── Background upload ──
  onBgSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    this.bgError = ''; this.bgUploading = true;
    this.svc.uploadTemplateAsset(file).subscribe({
      next: (res) => { this.side.backgroundImage = res.url; this.bgUploading = false; this.emit(); },
      error: (err) => { this.bgError = err?.error?.message || 'Upload failed.'; this.bgUploading = false; }
    });
  }
  clearBg(): void { this.side.backgroundImage = ''; this.emit(); }

  // ── Photo frame ──
  togglePhoto(): void {
    if (this.side.photo) { this.side.photo = null; if (this.selectedKey === 'photo') this.selectedKey = null; }
    else {
      const w = 300;
      this.side.photo = { x: Math.round((this.pw - w) / 2), y: 120, w, h: 300, fit: 'cover', shape: 'circle' };
      this.selectedKey = 'photo';
    }
    this.emit();
  }

  // ── Field CRUD ──
  addField(): void {
    const n = (this.side.fields || []).length + 1;
    const key = 'field' + n + '_' + Date.now().toString(36).slice(-3);
    this.side.fields = this.side.fields || [];
    this.side.fields.push({
      key, label: 'New Field', required: false,
      x: 75, y: 300, w: this.pw - 150, align: 'center',
      family: 'Arial', weight: 400, size: 32, color: '#333333'
    });
    this.selectedKey = key;
    this.emit();
  }

  removeField(key: string): void {
    this.side.fields = (this.side.fields || []).filter((f: any) => f.key !== key);
    if (this.selectedKey === key) this.selectedKey = null;
    this.emit();
  }

  // ── Background layer (position/resize) ──
  ensureBgRect(): any {
    if (!this.side.bgRect) this.side.bgRect = { x: 0, y: 0, w: this.pw, h: this.ph };
    if (!this.side.bgFit) this.side.bgFit = 'fill';
    return this.side.bgRect;
  }
  selectBgLayer(): void { this.ensureBgRect(); this.onSelect('bg'); }
  resetBg(): void { this.side.bgRect = { x: 0, y: 0, w: this.pw, h: this.ph }; this.emit(); }

  // ── Canvas events ──
  onSelect(key: string | null): void { this.selectedKey = key; }

  private targetFor(key: string): any {
    if (key === 'photo') return this.side.photo;
    if (key === 'bg') return this.ensureBgRect();
    return (this.side.fields || []).find((f: any) => f.key === key);
  }

  onMove(e: { key: string; x: number; y: number }): void {
    const item = this.targetFor(e.key);
    if (item) { item.x = e.x; item.y = e.y; this.emit(); }
  }

  onResizeItem(e: { key: string; w: number; h: number }): void {
    const item = this.targetFor(e.key);
    if (item) { item.w = e.w; item.h = e.h; this.emit(); }
  }

  // Any inline field/style edit funnels through here to bubble persistence.
  changed(): void { this.emit(); }

  trackByIndex(i: number): number { return i; }
}
