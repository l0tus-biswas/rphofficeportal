import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Broadcast } from './broadcast.service';

@Injectable({
  providedIn: 'root'
})
export class BroadcastPopupService {
  private showPopupSubject = new BehaviorSubject<Broadcast | null>(null);
  public showPopup$ = this.showPopupSubject.asObservable();

  private dismissedBroadcastsSubject = new BehaviorSubject<Set<string>>(new Set());
  private dismissedBroadcasts$ = this.dismissedBroadcastsSubject.asObservable();

  // Queue of unread broadcasts to display one-by-one
  private popupQueue: Broadcast[] = [];
  private isShowingPopup = false;

  constructor() {}

  /**
   * Enqueue a single broadcast for popup display.
   * If no popup is currently showing, it shows immediately.
   */
  showBroadcastPopup(broadcast: Broadcast): void {
    // Avoid duplicates in queue
    if (this.popupQueue.some(b => b._id === broadcast._id)) return;
    if (this.showPopupSubject.value?._id === broadcast._id) return;

    this.popupQueue.push(broadcast);
    if (!this.isShowingPopup) {
      this.showNext();
    }
  }

  /**
   * Enqueue multiple broadcasts for sequential popup display.
   * Broadcasts are shown one-by-one in the order provided.
   */
  showBroadcastQueue(broadcasts: Broadcast[]): void {
    for (const b of broadcasts) {
      if (!this.popupQueue.some(q => q._id === b._id) && this.showPopupSubject.value?._id !== b._id) {
        this.popupQueue.push(b);
      }
    }
    if (!this.isShowingPopup && this.popupQueue.length > 0) {
      this.showNext();
    }
  }

  /**
   * Show the next broadcast in the queue.
   */
  private showNext(): void {
    const next = this.popupQueue.shift();
    if (next) {
      this.isShowingPopup = true;
      this.showPopupSubject.next(next);
    } else {
      this.isShowingPopup = false;
      this.showPopupSubject.next(null);
    }
  }

  hidePopup(): void {
    this.isShowingPopup = false;
    // Show the next one in queue after a brief delay for smooth UX
    if (this.popupQueue.length > 0) {
      setTimeout(() => this.showNext(), 400);
    } else {
      this.showPopupSubject.next(null);
    }
  }

  /** Returns the number of remaining broadcasts in the queue (including current). */
  get queueLength(): number {
    return this.popupQueue.length + (this.isShowingPopup ? 1 : 0);
  }

  dismissBroadcast(broadcastId: string): void {
    const dismissed = new Set(this.dismissedBroadcastsSubject.value);
    dismissed.add(broadcastId);
    this.dismissedBroadcastsSubject.next(dismissed);
  }

  isDismissed(broadcastId: string): boolean {
    return this.dismissedBroadcastsSubject.value.has(broadcastId);
  }

  resetDismissed(): void {
    this.dismissedBroadcastsSubject.next(new Set());
  }
}
