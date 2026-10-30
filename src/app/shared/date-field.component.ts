import {
  Component,
  ElementRef,
  forwardRef,
  HostListener,
  Input,
  signal,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { dateAt, dayNumber, validDate } from '../planning';

/** Presentation adapter: German input/display, unchanged ISO date-only form contract. */
@Component({
  selector: 'app-date-field',
  standalone: true,
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.css',
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateFieldComponent), multi: true },
  ],
})
export class DateFieldComponent implements ControlValueAccessor, Validator {
  private static nextId = 0;
  @Input() label = 'Datum';
  @Input() required: boolean | '' = false;
  readonly inputId = `date-field-${++DateFieldComponent.nextId}`;
  readonly popupId = `${this.inputId}-calendar`;
  readonly weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  readonly text = signal('');
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly invalid = signal(false);
  readonly selected = signal('');
  readonly focused = signal('');
  readonly month = signal('');
  @ViewChild('textInput') private input?: ElementRef<HTMLInputElement>;
  @ViewChild('calendar') private calendar?: ElementRef<HTMLElement>;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  constructor(private readonly host: ElementRef<HTMLElement>) {}

  writeValue(value: string | null): void {
    const date = value ?? '';
    this.selected.set(validDate(date) ? date : '');
    this.text.set(this.display(date));
    this.invalid.set(!!date && !validDate(date));
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
    if (disabled) this.open.set(false);
  }
  validate(control: AbstractControl): ValidationErrors | null {
    return !control.value || validDate(control.value) ? null : { date: true };
  }

  enter(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.text.set(text);
    const value = this.parse(text);
    this.invalid.set(!!text.trim() && !validDate(value));
    this.selected.set(validDate(value) ? value : '');
    // Forward unfinished/invalid text as invalid input, so autosave cannot clear an optional date.
    this.onChange(value);
  }
  blur(): void {
    this.onTouched();
    if (this.selected()) this.text.set(this.display(this.selected()));
  }
  toggle(): void {
    if (this.disabled()) return;
    if (this.open()) {
      this.close();
      return;
    }
    const date = this.selected() || this.today();
    this.focused.set(date);
    this.month.set(date.slice(0, 7));
    this.open.set(true);
    this.focusDay();
  }
  choose(date: string): void {
    this.selected.set(date);
    this.text.set(this.display(date));
    this.invalid.set(false);
    this.onChange(date);
    this.onTouched();
    this.close();
  }
  clear(): void {
    this.text.set('');
    this.selected.set('');
    this.invalid.set(false);
    this.onChange('');
    this.onTouched();
    this.close();
  }
  close(): void {
    this.open.set(false);
    this.input?.nativeElement.focus();
  }
  today(): string {
    const now = new Date();
    return `${now.getFullYear().toString().padStart(4, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  }
  monthLabel(): string {
    return new Date(`${this.month()}-01T12:00:00Z`).toLocaleDateString('de-DE', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  dayLabel(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  weeks(): Array<Array<string | null>> {
    if (!this.month()) return [];
    const start = dayNumber(`${this.month()}-01`);
    const weekday = (new Date(start * 86400000).getUTCDay() + 6) % 7;
    return Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 7 }, (_, column) => {
        const day = dateAt(start - weekday + row * 7 + column);
        return validDate(day) && day.slice(0, 7) === this.month() ? day : null;
      }),
    );
  }
  moveMonth(direction: number, focus = false): void {
    const date = this.shiftMonth(this.focused(), direction);
    if (!date) return;
    this.focused.set(date);
    this.month.set(date.slice(0, 7));
    if (focus) this.focusDay();
  }
  canMove(direction: number): boolean {
    return !!this.shiftMonth(this.focused(), direction);
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    let offset: number;
    switch (event.key) {
      case 'ArrowLeft':
        offset = -1;
        break;
      case 'ArrowRight':
        offset = 1;
        break;
      case 'ArrowUp':
        offset = -7;
        break;
      case 'ArrowDown':
        offset = 7;
        break;
      case 'Home':
        offset = -((new Date(`${this.focused()}T12:00:00Z`).getUTCDay() + 6) % 7);
        break;
      case 'End':
        offset = 6 - ((new Date(`${this.focused()}T12:00:00Z`).getUTCDay() + 6) % 7);
        break;
      case 'PageUp':
        event.preventDefault();
        this.moveMonth(-1, true);
        return;
      case 'PageDown':
        event.preventDefault();
        this.moveMonth(1, true);
        return;
      default:
        return;
    }
    event.preventDefault();
    const date = dateAt(dayNumber(this.focused()) + offset);
    if (!validDate(date)) return;
    this.focused.set(date);
    this.month.set(date.slice(0, 7));
    this.focusDay();
  }
  @HostListener('document:pointerdown', ['$event']) outside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
      this.onTouched();
    }
  }
  @HostListener('focusout', ['$event']) leave(event: FocusEvent): void {
    if (event.relatedTarget && !this.host.nativeElement.contains(event.relatedTarget as Node)) {
      this.open.set(false);
      this.onTouched();
    }
  }
  private focusDay(): void {
    setTimeout(() => {
      if (this.open())
        this.calendar?.nativeElement
          .querySelector<HTMLButtonElement>(`[data-date="${this.focused()}"]`)
          ?.focus();
    });
  }
  private display(date: string): string {
    return validDate(date) ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}` : date;
  }
  private parse(text: string): string {
    const trimmed = text.trim();
    if (validDate(trimmed) || !trimmed) return trimmed;
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed);
    if (!match) return trimmed;
    const date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return validDate(date) ? date : trimmed;
  }
  private shiftMonth(date: string, offset: number): string | null {
    if (!validDate(date)) return null;
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    const index = year * 12 + month - 1 + offset;
    const targetYear = Math.floor(index / 12);
    const targetMonth = (index % 12) + 1;
    if (targetYear < 1 || targetYear > 9999) return null;
    const prefix = `${targetYear.toString().padStart(4, '0')}-${targetMonth.toString().padStart(2, '0')}`;
    for (let targetDay = day; targetDay > 0; targetDay--) {
      const target = `${prefix}-${targetDay.toString().padStart(2, '0')}`;
      if (validDate(target)) return target;
    }
    return null;
  }
}
