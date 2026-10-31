import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataAccessService } from '../data-access.service';
import { WelcomeComponent } from './welcome.component';
import { WELCOME_PAGES } from './welcome-content';

describe('welcome wizard interactions', () => {
  let fixture: ComponentFixture<WelcomeComponent>;
  const access = {
    loadWelcomeModalVersion: vi.fn(),
    acknowledgeWelcomeModal: vi.fn(),
  };
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const root = (): HTMLElement => fixture.nativeElement;
  async function click(label: string): Promise<void> {
    const button = Array.from(root().querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === label,
    )!;
    button.click();
    await render();
  }
  beforeEach(async () => {
    vi.resetAllMocks();
    // jsdom has no native dialog implementation. Native focus trapping is covered by exploration.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    });
    access.loadWelcomeModalVersion.mockResolvedValue(null);
    access.acknowledgeWelcomeModal.mockResolvedValue(1);
    TestBed.configureTestingModule({
      imports: [WelcomeComponent],
      providers: [{ provide: DataAccessService, useValue: access }],
    });
    fixture = TestBed.createComponent(WelcomeComponent);
    await render();
  });
  afterEach(() => {
    fixture?.destroy();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    vi.restoreAllMocks();
  });

  it('navigates six short pages in both directions and saves only on completion', async () => {
    expect(WELCOME_PAGES).toHaveLength(6);
    for (const page of WELCOME_PAGES) expect(page.text.length).toBeLessThanOrEqual(300);
    expect(root().querySelector('dialog')!.open).toBe(true);
    expect(root().querySelector<HTMLButtonElement>('footer button')!.disabled).toBe(true);
    await click('Weiter');
    expect(root().querySelector('h1')!.textContent).toBe(WELCOME_PAGES[1].title);
    await click('Zurück');
    expect(root().querySelector('h1')!.textContent).toBe(WELCOME_PAGES[0].title);
    for (let i = 1; i < 6; i++) {
      await click('Weiter');
      expect(root().querySelector('h1')!.textContent).toBe(WELCOME_PAGES[i].title);
      expect(root().querySelector('.position')!.textContent).toBe(`${i + 1} von 6`);
    }
    expect(access.acknowledgeWelcomeModal).not.toHaveBeenCalled();
    await click('Los geht’s');
    expect(root().querySelector('dialog')!.open).toBe(false);
    expect(access.acknowledgeWelcomeModal).toHaveBeenCalledWith(1);
  });
  it('retains keyboard focus on the forward button when its action changes to completion', async () => {
    const forward = root().querySelector<HTMLButtonElement>('footer .primary')!;
    forward.focus();
    expect(document.activeElement).toBe(forward);
    for (let i = 1; i < WELCOME_PAGES.length; i++) {
      forward.click();
      await render();
      expect(root().querySelector('footer .primary')).toBe(forward);
      expect(document.activeElement).toBe(forward);
    }
    expect(forward.textContent?.trim()).toBe('Los geht’s');
    expect(access.acknowledgeWelcomeModal).not.toHaveBeenCalled();
    forward.click();
    await render();
    expect(root().querySelector('dialog')!.open).toBe(false);
    expect(access.acknowledgeWelcomeModal).toHaveBeenCalledWith(1);
  });

  it('ignores backdrop clicks and acknowledges Escape on any page', async () => {
    await click('Weiter');
    const dialog = root().querySelector('dialog')!;
    dialog.click();
    expect(dialog.open).toBe(true);
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    await render();
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(false);
    expect(access.acknowledgeWelcomeModal).toHaveBeenCalledWith(1);
  });
  it('keeps save failure feedback and retry usable outside the closed dialog', async () => {
    access.acknowledgeWelcomeModal.mockRejectedValueOnce(new Error('disk full'));
    root().querySelector<HTMLButtonElement>('[aria-label="Willkommenshinweis schließen"]')!.click();
    await render();
    expect(root().querySelector('dialog')!.open).toBe(false);
    expect(root().querySelector('[role="alert"]')!.textContent).toContain('nicht gespeichert');
    await click('Erneut versuchen');
    expect(root().querySelector('[role="alert"]')).toBeNull();
    expect(access.acknowledgeWelcomeModal).toHaveBeenCalledTimes(2);
  });
});
