import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DateFieldComponent } from './date-field.component';

@Component({
  standalone: true,
  imports: [DateFieldComponent, ReactiveFormsModule],
  template: '<app-date-field label="Wettkampftag" [formControl]="date" />',
})
class HostComponent {
  date = new FormControl('2026-12-06');
}

describe('date field input and calendar', () => {
  let fixture: ComponentFixture<HostComponent>;
  let date: FormControl<string | null>;
  const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }
  async function enter(value: string): Promise<void> {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await render();
  }
  async function open(): Promise<void> {
    fixture.nativeElement.querySelector('.calendar-toggle').click();
    await render();
  }
  function day(value: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(`[data-date="${value}"]`);
  }
  async function key(element: HTMLElement, value: string): Promise<void> {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
    await render();
  }
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    date = fixture.componentInstance.date;
    await render();
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('formats ISO values in German and accepts typed or pasted dates without timezone conversion', async () => {
    expect(input().value).toBe('06.12.2026');
    await enter('29.2.2024');
    expect(date.value).toBe('2024-02-29');
    expect(date.valid).toBe(true);
    input().dispatchEvent(new Event('blur'));
    await render();
    expect(input().value).toBe('29.02.2024');
    expect(date.touched).toBe(true);
    await enter('2026-09-28');
    expect(date.value).toBe('2026-09-28');
    date.setValue('2026-10-25');
    await render();
    expect(input().value).toBe('25.10.2026');
  });
  it('keeps unfinished and impossible input invalid, including optional fields', async () => {
    for (const value of ['12.', '29.02.2026', '31.04.2026', '01.13.2026', '01.01.0000']) {
      await enter(value);
      expect(date.value).toBe(value);
      expect(date.hasError('date')).toBe(true);
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(fixture.nativeElement.textContent).toContain('gültiges Datum');
    }
    await enter('');
    expect(date.value).toBe('');
    expect(date.valid).toBe(true);
    date.addValidators(Validators.required);
    date.updateValueAndValidity();
    expect(date.hasError('required')).toBe(true);
  });
  it('opens at the selected month, focuses the selected date and emits the chosen ISO value', async () => {
    await open();
    expect(fixture.nativeElement.querySelector('[role=dialog]').textContent).toContain(
      'Dezember 2026',
    );
    expect(document.activeElement).toBe(day('2026-12-06'));
    day('2026-12-15').click();
    await render();
    expect(date.value).toBe('2026-12-15');
    expect(input().value).toBe('15.12.2026');
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(input());
  });
  it('supports arrow navigation across month boundaries and Escape without changing the date', async () => {
    date.setValue('2024-02-29');
    await render();
    await open();
    await key(day('2024-02-29'), 'ArrowRight');
    expect(document.activeElement).toBe(day('2024-03-01'));
    expect(date.value).toBe('2024-02-29');
    await key(day('2024-03-01'), 'Escape');
    expect(date.value).toBe('2024-02-29');
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(input());
  });
  it('clamps PageUp at a shorter month and uses Monday to Sunday week navigation', async () => {
    date.setValue('2024-03-31');
    await render();
    await open();
    await key(day('2024-03-31'), 'PageUp');
    expect(document.activeElement).toBe(day('2024-02-29'));
    await key(day('2024-02-29'), 'Home');
    expect(document.activeElement).toBe(day('2024-02-26'));
    await key(day('2024-02-26'), 'End');
    expect(document.activeElement).toBe(day('2024-03-03'));
  });
  it('clears optional dates and closes on outside interaction without committing a calendar suggestion', async () => {
    await open();
    fixture.nativeElement.querySelector('.calendar-footer button:nth-child(2)').click();
    await render();
    expect(date.value).toBe('');
    expect(date.valid).toBe(true);
    date.setValue('2026-12-06');
    await render();
    await open();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await render();
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
    expect(date.value).toBe('2026-12-06');
  });
  it('honors disabled form controls', async () => {
    date.disable();
    await render();
    expect(input().disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.calendar-toggle').disabled).toBe(true);
    await open();
    expect(fixture.nativeElement.querySelector('[role=dialog]')).toBeNull();
  });
  it('keeps the supported year boundaries navigable without exposing invalid dates', async () => {
    for (const value of ['0001-01-01', '9999-12-31']) {
      date.setValue(value);
      await render();
      await open();
      expect(day(value)).toBeTruthy();
      const disabledNavigation = fixture.nativeElement.querySelectorAll(
        '.calendar-heading button:disabled',
      );
      expect(disabledNavigation.length).toBe(1);
      await key(day(value), 'Escape');
    }
  });
});
