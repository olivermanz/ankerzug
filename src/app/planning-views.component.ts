import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MacroCycle, MesoCycle, Session, PHASES, POLICIES } from './models';
import { validDate } from './planning';
import {
  calendarDates,
  calendarWeeks,
  emptySessionFilters,
  filterSessions,
  plannedPhaseSummary,
  SESSION_STATUS_LABELS,
  shiftCalendar,
} from './planning-views';
import { DateFieldComponent } from './shared/date-field.component';

@Component({
  selector: 'app-planning-views',
  standalone: true,
  imports: [FormsModule, DateFieldComponent],
  templateUrl: './planning-views.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './planning-views.component.css',
})
export class PlanningViewsComponent implements OnChanges {
  @Input({ required: true }) cycle!: MacroCycle;
  @Input() view: 'calendar' | 'detail' = 'calendar';
  @Input() phaseId = '';
  @Output() openSession = new EventEmitter<Session>();
  @Output() openPhase = new EventEmitter<MesoCycle>();
  mode: 'month' | 'week' = 'month';
  anchor = '';
  readonly statuses = SESSION_STATUS_LABELS;
  readonly phases = PHASES;
  readonly policies = POLICIES;
  readonly weekdays = [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
    'Sonntag',
  ];
  readonly summary = plannedPhaseSummary;
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cycle']) this.anchor = this.cycle.startDate;
  }
  dates(): string[] {
    return calendarDates(this.anchor, this.mode);
  }
  shift(step: number): void {
    this.anchor = shiftCalendar(this.anchor, this.mode, step);
  }
  date(value: string): string {
    return new Date(value + 'T12:00:00Z').toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  heading(): string {
    if (!validDate(this.anchor)) return 'Datum wählen';
    return this.mode === 'month'
      ? new Date(this.anchor + 'T12:00:00Z').toLocaleDateString('de-DE', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : `${this.date(this.dates()[0])} – ${this.date(this.dates()[6])}`;
  }
  sessions(date: string): Session[] {
    return filterSessions(this.cycle, { ...emptySessionFilters(), from: date, until: date });
  }
  periods(date: string) {
    return this.cycle.periods.filter((p) => p.startDate <= date && p.endDate >= date);
  }
  competitions(date: string) {
    return this.cycle.competitions.filter((c) => c.date === date);
  }
  weeks() {
    return calendarWeeks(this.cycle, this.anchor, this.mode);
  }
  phase(id: string | null) {
    return this.cycle.mesocycles.find((p) => p.id === id);
  }
  inCycle(date: string): boolean {
    return date >= this.cycle.startDate && date <= this.cycle.endDate;
  }
}
