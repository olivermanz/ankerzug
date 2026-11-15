import { afterNextRender, Directive, ElementRef, inject, Injector } from '@angular/core';

@Directive({
  selector: '[appLibraryView]',
  exportAs: 'libraryView',
  host: { class: 'library-view' },
})
export class LibraryViewDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private trigger?: HTMLButtonElement;
  private scroll = 0;

  open(trigger: HTMLButtonElement): void {
    this.updateMotion();
    this.trigger = trigger;
    this.scroll = window.scrollY;
    // Keep the departing overview aligned with the part the user was viewing.
    this.element.style.setProperty('--overview-top', `${-this.scroll}px`);
    afterNextRender(
      () => {
        this.element
          .querySelector<HTMLElement>('section:not([inert]) [data-library-editor-title]')
          ?.focus({
            preventScroll: true,
          });
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
      { injector: this.injector },
    );
  }

  back(): void {
    this.updateMotion();
    // Angular keeps the leaving editor in the DOM until its animation finishes.
    this.element
      .querySelector('section:not([inert]) [data-library-editor-title]')
      ?.closest('section')
      ?.setAttribute('inert', '');

    // The editor can also be scrolled when the user cancels a draft.
    this.element.style.setProperty('--editor-top', `${this.scroll - window.scrollY}px`);
    afterNextRender(
      () => {
        this.trigger?.focus({ preventScroll: true });
        window.scrollTo({ top: this.scroll, behavior: 'instant' });
      },
      { injector: this.injector },
    );
  }

  private updateMotion(): void {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.element.classList.toggle('library-motion', !reduced);
  }
}
