import { Component, OnInit } from '@angular/core';
import { CarrierService, Carrier } from '../../../services/carrier.service';

@Component({
  selector: 'app-carriers',
  templateUrl: './carriers.component.html',
  styleUrls: ['./carriers.component.css']
})
export class CarriersComponent implements OnInit {
  carriers: Carrier[] = [];
  loading = true;
  error = '';
  success = '';
  
  // Form
  showForm = false;
  editMode = false;
  currentCarrier: Partial<Carrier> = {};

  constructor(private carrierService: CarrierService) {}

  ngOnInit(): void {
    this.loadCarriers();
  }

  loadCarriers(): void {
    this.loading = true;
    this.error = '';
    
    this.carrierService.getAllCarriers(false).subscribe({
      next: (carriers) => {
        this.carriers = carriers;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading carriers:', error);
        this.error = 'Failed to load carriers';
        this.loading = false;
      }
    });
  }

  openNewForm(): void {
    this.showForm = true;
    this.editMode = false;
    this.currentCarrier = { name: '', isActive: true, notes: '' };
  }

  editCarrier(carrier: Carrier): void {
    this.showForm = true;
    this.editMode = true;
    this.currentCarrier = { 
      _id: carrier._id,
      name: carrier.name, 
      isActive: carrier.isActive,
      notes: carrier.notes 
    };
  }

  cancelForm(): void {
    this.showForm = false;
    this.editMode = false;
    this.currentCarrier = {};
  }

  saveCarrier(): void {
    if (!this.currentCarrier.name) {
      this.error = 'Carrier name is required';
      return;
    }
    
    if (this.editMode && this.currentCarrier._id) {
      // Update existing carrier
      this.carrierService.updateCarrier(this.currentCarrier._id, this.currentCarrier).subscribe({
        next: () => {
          this.success = 'Carrier updated successfully';
          this.cancelForm();
          this.loadCarriers();
          setTimeout(() => this.success = '', 3000);
        },
        error: (error) => {
          console.error('Error updating carrier:', error);
          this.error = error.error?.message || 'Failed to update carrier';
        }
      });
    } else {
      // Create new carrier
      this.carrierService.createCarrier(this.currentCarrier).subscribe({
        next: () => {
          this.success = 'Carrier added successfully';
          this.cancelForm();
          this.loadCarriers();
          setTimeout(() => this.success = '', 3000);
        },
        error: (error) => {
          console.error('Error creating carrier:', error);
          this.error = error.error?.message || 'Failed to create carrier';
        }
      });
    }
  }

  deleteCarrier(id: string | undefined): void {
    if (!id) {
      this.error = 'Invalid carrier ID';
      return;
    }
    
    if (!confirm('Are you sure you want to delete this carrier? This will mark it as inactive.')) {
      return;
    }
    
    this.carrierService.deleteCarrier(id).subscribe({
      next: () => {
        this.success = 'Carrier deleted successfully';
        this.loadCarriers();
        setTimeout(() => this.success = '', 3000);
      },
      error: (error) => {
        console.error('Error deleting carrier:', error);
        this.error = error.error?.message || 'Failed to delete carrier';
      }
    });
  }
}
