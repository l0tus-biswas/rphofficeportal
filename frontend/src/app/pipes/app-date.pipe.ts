import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TimezoneService } from '../services/timezone.service';

@Pipe({
  name: 'appDate'
})
export class AppDatePipe implements PipeTransform {
  private datePipe = new DatePipe('en-US');

  constructor(private timezoneService: TimezoneService) {}

  transform(value: any, format: string = 'mediumDate', locale?: string): string | null {
    if (!value) return null;
    const tz = this.timezoneService.getTimezone();
    return this.datePipe.transform(value, format, tz, locale || 'en-US');
  }
}
