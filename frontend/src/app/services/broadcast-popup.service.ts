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

  constructor() {}

  showBroadcastPopup(broadcast: Broadcast): void {
    this.showPopupSubject.next(broadcast);
  }

  hidePopup(): void {
    this.showPopupSubject.next(null);
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
