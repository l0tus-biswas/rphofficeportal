import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { TrainingService } from '../../../services/training.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-training-folder-node',
  templateUrl: './training-folder-node.component.html'
})
export class TrainingFolderNodeComponent {
  @Input() folder: any;
  @Input() folders: any[] = [];
  @Input() depth = 0;

  @Output() addSubfolder = new EventEmitter<string>();
  @Output() editFolder = new EventEmitter<any>();
  @Output() removeFolder = new EventEmitter<any>();

  constructor(private trainingService: TrainingService) { }

  get subfolders(): any[] {
    return this.folders.filter((f: any) => {
      const pid = f.parent?._id || f.parent;
      return pid === this.folder._id;
    });
  }

  dropSubfolder(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const subs = this.subfolders;
    moveItemInArray(subs, event.previousIndex, event.currentIndex);
    subs.forEach((f: any, index: number) => {
      f.order = index;
      this.trainingService.updateFolder(f._id, { order: index }).subscribe();
    });
  }

  getThumbnailUrl(thumbPath: string): string {
    if (!thumbPath) return '';
    return `${environment.baseUrl}${thumbPath}`;
  }
}
