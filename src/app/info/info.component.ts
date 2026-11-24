import { Component, input, resource, signal, viewChild } from '@angular/core';
import { LibraryViewDirective } from '../shared/library-view.directive';

interface LicenseDocument {
  title: string;
  url: string;
}

@Component({
  selector: 'app-info',
  imports: [LibraryViewDirective],
  templateUrl: './info.component.html',
  styleUrl: './info.component.css',
})
export class InfoComponent {
  readonly version = input.required<string>();
  protected readonly documents = {
    project: {
      title: 'Vollständige Projektlizenz',
      url: '/licenses/ankerzug/LICENSE',
    },
    thirdParty: {
      title: 'Vollständige Drittanbieter-Hinweise',
      url: '/licenses/THIRD_PARTY_NOTICES.md',
    },
  };
  private readonly view = viewChild.required(LibraryViewDirective);
  protected readonly selected = signal<LicenseDocument | undefined>(undefined);
  protected readonly license = resource({
    params: this.selected,
    loader: async ({ params, abortSignal }) => {
      const response = await fetch(params.url, {
        signal: abortSignal,
        headers: { Accept: 'text/plain' },
      });
      if (!response.ok) {
        throw new Error('Lizenztext konnte nicht geladen werden.');
      }
      const text = await response.text();
      // Tauri can label the extensionless LICENSE as HTML and return index.html for missing assets.
      if (/^\s*<!doctype html\b/i.test(text)) {
        throw new Error('Lizenztext konnte nicht geladen werden.');
      }
      return text;
    },
  });

  protected open(document: LicenseDocument, trigger: HTMLButtonElement): void {
    this.view().open(trigger);
    this.selected.set(document);
  }

  protected back(): void {
    this.view().back();
    this.selected.set(undefined);
  }
}
