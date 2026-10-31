import { Component, ElementRef, OnInit, effect, inject, signal, viewChild } from '@angular/core';
import { WelcomeService } from './welcome.service';
import { WELCOME_PAGES } from './welcome-content';

@Component({
  selector: 'app-welcome',
  standalone: true,
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css',
})
export class WelcomeComponent implements OnInit {
  readonly welcome = inject(WelcomeService);
  readonly pages = WELCOME_PAGES;
  readonly step = signal(0);
  readonly backwards = signal(false);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private previousFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.welcome.visible() && !dialog.open) {
        this.previousFocus = document.activeElement as HTMLElement | null;
        dialog.showModal();
      } else if (!this.welcome.visible() && dialog.open) {
        dialog.close();
        this.previousFocus?.focus();
      }
    });
  }

  ngOnInit(): void {
    void this.welcome.initialize();
  }

  move(offset: number): void {
    const next = this.step() + offset;
    if (next < 0 || next >= this.pages.length) return;
    this.backwards.set(offset < 0);
    this.step.set(next);
  }

  advance(): void {
    if (this.step() < this.pages.length - 1) this.move(1);
    else this.close();
  }

  close(event?: Event): void {
    event?.preventDefault();
    void this.welcome.dismiss();
  }
}
