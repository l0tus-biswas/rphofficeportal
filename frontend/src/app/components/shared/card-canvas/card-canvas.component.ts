import { Component, Input, Output, EventEmitter, ElementRef, NgZone, AfterViewInit, OnDestroy } from '@angular/core';
import { environment } from '../../../../environments/environment';

/**
 * Renders ONE side of a card template at scale, as an in-browser mirror of the
 * server-side print renderer (backend/services/cardRenderer.js). Children use
 * exact print-file pixels; a CSS transform scales the whole stage so positions,
 * font sizes and the photo frame match the final print PNG.
 *
 * Reused by the admin designer (editable drag/select) and the agent live
 * preview (read-only).
 */
@Component({
  selector: 'app-card-canvas',
  templateUrl: './card-canvas.component.html',
  styleUrls: ['./card-canvas.component.css']
})
export class CardCanvasComponent implements AfterViewInit, OnDestroy {
  @Input() side: any = null;                          // { placement,label,backgroundImage,photo,fields[] }
  @Input() printFile: any = { widthPx: 750, heightPx: 1200 };
  @Input() values: { [key: string]: string } = {};
  @Input() photoDataUrl = '';                         // headshot (data URL or resolved URL)
  @Input() displayWidth = 360;                        // rendered CSS width in px
  @Input() editable = false;                          // drag + select handles
  @Input() selectedKey: string | null = null;         // 'photo' or a field key
  @Input() autoFit = false;                           // size to the host's container width
  @Input() maxWidth = 0;                              // cap for autoFit (0 = printFile width)

  @Output() selectKey = new EventEmitter<string | null>();
  @Output() moveItem = new EventEmitter<{ key: string; x: number; y: number }>();
  @Output() resizeItem = new EventEmitter<{ key: string; w: number; h: number }>();

  private ro: ResizeObserver | null = null;

  constructor(private host: ElementRef, private zone: NgZone) {}

  ngAfterViewInit(): void {
    if (!this.autoFit) return;
    const parent = this.host.nativeElement?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const avail = parent.clientWidth;
      const cap = this.maxWidth || this.pw;
      const w = Math.max(120, Math.min(cap, avail));
      if (Math.abs(w - this.displayWidth) > 1) {
        this.zone.run(() => { this.displayWidth = w; });
      }
    };
    this.ro = new ResizeObserver(() => measure());
    this.ro.observe(parent);
    // Defer the initial measure out of the current change-detection cycle to
    // avoid ExpressionChangedAfterItHasBeenChecked (NG0100).
    setTimeout(() => measure(), 0);
  }

  ngOnDestroy(): void {
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
  }

  private drag: {
    key: string; mode: 'move' | 'resize';
    startX: number; startY: number; origX: number; origY: number; origW: number; origH: number;
  } | null = null;

  get pw(): number { return this.printFile?.widthPx || 750; }
  get ph(): number { return this.printFile?.heightPx || 1200; }
  get scale(): number { return this.displayWidth / this.pw; }
  get displayHeight(): number { return this.ph * this.scale; }

  /** Resolve a "/uploads/..." path to the backend origin so <img>/bg can load it. */
  assetUrl(p: string): string {
    if (!p) return '';
    if (/^(https?:|data:)/i.test(p)) return p;
    const origin = (environment.apiUrl || '').replace(/\/api\/?$/, '');
    return p.startsWith('/') ? origin + p : origin + '/' + p;
  }

  get bgUrl(): string { return this.assetUrl(this.side?.backgroundImage); }
  get bgFit(): string { return this.side?.bgFit || 'fill'; }
  // Background placement rect; defaults to full bleed when not set.
  get bgRect(): { x: number; y: number; w: number; h: number } {
    return this.side?.bgRect || { x: 0, y: 0, w: this.pw, h: this.ph };
  }
  bgRectStyle(): { [k: string]: string } {
    const r = this.bgRect;
    return {
      position: 'absolute',
      left: (r.x || 0) + 'px', top: (r.y || 0) + 'px',
      width: (r.w || 0) + 'px', height: (r.h || 0) + 'px',
      overflow: 'hidden'
    };
  }

  fieldText(f: any): string {
    const v = (this.values?.[f.key] ?? '').toString();
    if (v.trim() !== '') return v;
    return this.editable ? (f.label || f.key || '') : '';
  }

  fieldStyle(f: any): { [k: string]: string } {
    return {
      position: 'absolute',
      left: (f.x || 0) + 'px',
      top: (f.y || 0) + 'px',
      width: f.w ? f.w + 'px' : 'auto',
      'text-align': f.align || 'left',
      'font-family': `'${f.family || 'Arial'}', Arial, sans-serif`,
      'font-weight': String(f.weight || 400),
      'font-style': f.style || 'normal',
      'font-size': (f.size || 24) + 'px',
      color: f.color || '#000',
      'line-height': String(f.lineHeight || 1.15),
      'text-transform': f.transform || 'none',
      'letter-spacing': (f.letterSpacing ? f.letterSpacing + 'px' : 'normal'),
      'white-space': 'pre-wrap'
    };
  }

  photoStyle(): { [k: string]: string } {
    const p = this.side?.photo;
    if (!p) return {};
    const radius = p.shape === 'circle' ? '50%' : `${p.borderRadius || 0}px`;
    return {
      position: 'absolute',
      left: (p.x || 0) + 'px', top: (p.y || 0) + 'px',
      width: (p.w || 0) + 'px', height: (p.h || 0) + 'px',
      'border-radius': radius, overflow: 'hidden'
    };
  }

  // ── Drag / resize (editable mode only) ──

  private itemFor(key: string): any {
    if (key === 'photo') return this.side?.photo;
    if (key === 'bg') return this.bgRect;   // defaults to full bleed
    return (this.side?.fields || []).find((f: any) => f.key === key);
  }

  startMove(ev: PointerEvent, key: string): void {
    if (!this.editable) return;
    ev.preventDefault(); ev.stopPropagation();
    this.selectKey.emit(key);
    const item = this.itemFor(key);
    if (!item) return;
    this.drag = {
      key, mode: 'move', startX: ev.clientX, startY: ev.clientY,
      origX: item.x || 0, origY: item.y || 0, origW: item.w || 0, origH: item.h || 0
    };
    this.attachDocListeners();
  }

  startResize(ev: PointerEvent, key: string): void {
    if (!this.editable) return;
    ev.preventDefault(); ev.stopPropagation();
    this.selectKey.emit(key);
    const item = this.itemFor(key);
    if (!item) return;
    this.drag = {
      key, mode: 'resize', startX: ev.clientX, startY: ev.clientY,
      origX: item.x || 0, origY: item.y || 0, origW: item.w || 0, origH: item.h || 0
    };
    this.attachDocListeners();
  }

  private onMove = (ev: PointerEvent): void => {
    if (!this.drag) return;
    const dx = (ev.clientX - this.drag.startX) / this.scale;
    const dy = (ev.clientY - this.drag.startY) / this.scale;
    if (this.drag.mode === 'move') {
      const x = Math.round(this.clamp(this.drag.origX + dx, 0, this.pw));
      const y = Math.round(this.clamp(this.drag.origY + dy, 0, this.ph));
      this.moveItem.emit({ key: this.drag.key, x, y });
    } else {
      const w = Math.round(this.clamp(this.drag.origW + dx, 20, this.pw * 2));
      const h = Math.round(this.clamp(this.drag.origH + dy, 20, this.ph * 2));
      this.resizeItem.emit({ key: this.drag.key, w, h });
    }
  };

  private onUp = (): void => {
    this.drag = null;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
  };

  private attachDocListeners(): void {
    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp);
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}
