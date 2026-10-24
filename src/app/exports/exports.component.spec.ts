import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import source from '../../../fixtures/workspace-v2.json';
import { SaveInput, Snapshot, Workspace } from '../models';
import { DataAccessService } from '../data-access.service';
import { ExportsComponent } from './exports.component';
import { macroCyclePackage, templatePackage } from './exchange';

describe('export/import rendered acceptance', () => {
  let fixture: ComponentFixture<ExportsComponent>, stored: Snapshot;
  let access: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    readTemplatePackage: ReturnType<typeof vi.fn>;
    readMacroCyclePackage: ReturnType<typeof vi.fn>;
    exportPlanFile: ReturnType<typeof vi.fn>;
  };
  async function render() {
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function click(name: string) {
    await render();
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.trim() === name);
    expect(button, name).toBeDefined();
    button!.click();
    await vi.waitFor(() => expect(fixture.componentInstance.busy()).toBe(false));
    await render();
  }
  beforeEach(async () => {
    stored = { revision: 3, workspace: structuredClone(source.workspace) as Workspace };
    access = {
      load: vi.fn().mockImplementation(async () => structuredClone(stored)),
      save: vi.fn().mockImplementation(async (input: SaveInput) => {
        if (input.expectedRevision !== stored.revision)
          throw { code: 'conflict', message: 'Stale revision' };
        stored = { revision: stored.revision + 1, workspace: structuredClone(input.workspace) };
        return structuredClone(stored);
      }),
      readMacroCyclePackage: vi
        .fn()
        .mockResolvedValue(
          macroCyclePackage(stored.workspace.cycles[0], stored.workspace.templates),
        ),
      readTemplatePackage: vi.fn().mockResolvedValue(templatePackage(stored.workspace.templates)),
      exportPlanFile: vi.fn().mockResolvedValue('Saved plan'),
    };
    TestBed.configureTestingModule({
      imports: [ExportsComponent],
      providers: [{ provide: DataAccessService, useValue: access }],
    });
    fixture = TestBed.createComponent(ExportsComponent);
    await fixture.componentInstance.planner.load();
    fixture.componentRef.setInput('cycle', fixture.componentInstance.planner.workspace().cycles[0]);
    await render();
  });
  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });
  it('previews collisions, cancels without writing and imports a separate durable copy', async () => {
    const original = structuredClone(stored.workspace.cycles[0]);
    await click('Makrozyklus-Paket importieren');
    expect(fixture.nativeElement.textContent).toContain('Importvorschau');
    expect(
      fixture.componentInstance.collisionCount(fixture.componentInstance.preview()!),
    ).toBeGreaterThan(0);
    expect(access.save).not.toHaveBeenCalled();
    await click('Import abbrechen');
    expect(access.save).not.toHaveBeenCalled();
    await click('Makrozyklus-Paket importieren');
    await click('Als separate Kopie importieren');
    expect(access.save).toHaveBeenCalledTimes(1);
    expect(stored.workspace.cycles).toHaveLength(2);
    expect(stored.workspace.cycles[0]).toEqual(original);
    const copy = stored.workspace.cycles[1];
    expect(copy.id).not.toBe(original.id);
    expect(copy.weeks).toEqual(original.weeks);
    expect(copy.goals[0].reference).toBe(copy.sessions[0].id);
    await fixture.componentInstance.planner.load();
    expect(fixture.componentInstance.planner.workspace().cycles).toEqual(stored.workspace.cycles);
  });
  it('preserves a failed import for retry without importing a second copy', async () => {
    await click('Makrozyklus-Paket importieren');
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await click('Als separate Kopie importieren');
    expect(fixture.nativeElement.textContent).toContain('Disk full');
    expect(stored.workspace.cycles).toHaveLength(1);
    expect(fixture.componentInstance.planner.workspace().cycles).toHaveLength(2);
    expect(fixture.componentInstance.preview()).toBeNull();
    await fixture.componentInstance.planner.flush();
    expect(stored.workspace.cycles).toHaveLength(2);
  });
  it('reports native cancellation/errors and rejects previews after edits', async () => {
    access.readMacroCyclePackage.mockResolvedValueOnce(null);
    await click('Makrozyklus-Paket importieren');
    expect(fixture.nativeElement.textContent).toContain('Import abgebrochen');
    access.readMacroCyclePackage.mockRejectedValueOnce({
      code: 'invalidInput',
      message: 'Ungültiges Paket',
    });
    await click('Makrozyklus-Paket importieren');
    expect(fixture.nativeElement.textContent).toContain('Ungültiges Paket');
    await click('Makrozyklus-Paket importieren');
    const planner = fixture.componentInstance.planner;
    planner.workspace().cycles[0].name += ' edited';
    planner.changed();
    await click('Als separate Kopie importieren');
    expect(fixture.nativeElement.textContent).toContain('geändert');
    expect(stored.workspace.cycles).toHaveLength(1);
  });
  it('saves edits before every export, transports actual bytes and surfaces cancellation/failure', async () => {
    const component = fixture.componentInstance,
      planner = component.planner;
    planner.workspace().cycles[0].name = 'Export Grüße';
    planner.changed();
    for (const [format, label] of component.formats) {
      await click(label + ' exportieren');
      expect(access.exportPlanFile.mock.calls.at(-1)![0]).toBe(format);
      expect(access.exportPlanFile.mock.calls.at(-1)![2].length).toBeGreaterThan(0);
      expect(fixture.nativeElement.textContent).toContain(
        format === 'pdf' ? 'PDF im Viewer geöffnet.' : 'Export gespeichert',
      );
    }
    expect(stored.workspace.cycles[0].name).toBe('Export Grüße');
    access.exportPlanFile.mockResolvedValueOnce(null);
    await click('CSV exportieren');
    expect(fixture.nativeElement.textContent).toContain('Export abgebrochen');
    access.exportPlanFile.mockRejectedValueOnce({
      code: 'storage',
      message: 'No write permission',
    });
    await click('Markdown exportieren');
    expect(fixture.nativeElement.textContent).toContain('No write permission');
    access.exportPlanFile.mockClear();
    planner.workspace().cycles[0].name += ' pending';
    planner.changed();
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await click('Kalender (ICS) exportieren');
    expect(access.exportPlanFile).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Disk full');
  });
  it('exports single/all templates and imports independent copies without selecting a macrocycle', async () => {
    fixture.componentRef.setInput('cycle', null);
    const original = structuredClone(stored.workspace);
    await click('Vorlage exportieren');
    const [format, filename, bytes] = access.exportPlanFile.mock.calls.at(-1)!;
    expect(format).toBe('templates');
    expect(filename).toMatch(/\.vorlagen\.json$/);
    expect(JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)))).toEqual(
      templatePackage(original.templates),
    );
    await click('Alle Vorlagen exportieren');
    await click('Vorlagen-Paket importieren');
    expect(fixture.nativeElement.textContent).toContain('Vorlagen-Importvorschau');
    await click('Vorlagen-Import abbrechen');
    expect(access.save).not.toHaveBeenCalled();
    await click('Vorlagen-Paket importieren');
    await click('Vorlagen als separate Kopien importieren');
    expect(stored.workspace.cycles).toEqual(original.cycles);
    expect(stored.workspace.templates).toHaveLength(2);
    expect(stored.workspace.templates[0]).toEqual(original.templates[0]);
    expect(stored.workspace.templates[1].contents[0].id).not.toBe(
      original.templates[0].contents[0].id,
    );
    await fixture.componentInstance.planner.load();
    expect(fixture.componentInstance.planner.workspace().templates).toEqual(
      stored.workspace.templates,
    );
  });
  it('retains failed template imports for retry without appending another copy', async () => {
    await click('Vorlagen-Paket importieren');
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await click('Vorlagen als separate Kopien importieren');
    expect(fixture.nativeElement.textContent).toContain('Disk full');
    expect(stored.workspace.templates).toHaveLength(1);
    expect(fixture.componentInstance.templatePreview()).toBeNull();
    await fixture.componentInstance.planner.flush();
    expect(stored.workspace.templates).toHaveLength(2);
  });
  it('handles native template cancellation/errors, stale previews and export save failures', async () => {
    access.readTemplatePackage.mockResolvedValueOnce(null);
    await click('Vorlagen-Paket importieren');
    expect(fixture.nativeElement.textContent).toContain('Vorlagen-Import abgebrochen');
    access.readTemplatePackage.mockRejectedValueOnce({
      code: 'invalidInput',
      message: 'Ungültiges Vorlagen-Paket',
    });
    await click('Vorlagen-Paket importieren');
    expect(fixture.nativeElement.textContent).toContain('Ungültiges Vorlagen-Paket');
    await click('Vorlagen-Paket importieren');
    const planner = fixture.componentInstance.planner;
    planner.workspace().templates[0].name += ' changed';
    planner.changed();
    await click('Vorlagen als separate Kopien importieren');
    expect(fixture.nativeElement.textContent).toContain('geändert');
    expect(stored.workspace.templates).toHaveLength(1);
    planner.workspace().templates[0].name += ' pending';
    planner.changed();
    access.save.mockRejectedValueOnce({ code: 'storage', message: 'Disk full' });
    await click('Alle Vorlagen exportieren');
    expect(access.exportPlanFile).not.toHaveBeenCalled();
  });
  it('prints a rendered detached plan and excludes compatibility measurements/goals', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await click('Druckansicht öffnen');
    const article = fixture.nativeElement.querySelector('.print-plan');
    expect(article.textContent).toContain(stored.workspace.cycles[0].name);
    expect(article.textContent).not.toContain(stored.workspace.cycles[0].goals[0].description);
    await click('Trainingsplan drucken');
    await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });
});
