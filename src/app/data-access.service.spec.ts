import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../fixtures/workspace-v2.json';
import { Workspace } from './models';
import { DataAccessService, TAURI_INVOKER } from './data-access.service';

const mocks = { invoke: vi.fn() };

describe('typed IPC commands', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    TestBed.configureTestingModule({
      providers: [{ provide: TAURI_INVOKER, useValue: mocks.invoke }],
    });
  });

  function access(): DataAccessService {
    return TestBed.inject(DataAccessService);
  }

  it('loads and acknowledges the independent welcome version through typed commands', async () => {
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await access().loadWelcomeModalVersion()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('load_welcome_modal_version', undefined);
    mocks.invoke.mockResolvedValueOnce(3);
    expect(await access().acknowledgeWelcomeModal(2)).toBe(3);
    expect(mocks.invoke).toHaveBeenLastCalledWith('acknowledge_welcome_modal', { version: 2 });
    mocks.invoke.mockRejectedValueOnce('Speicherfehler');
    await expect(access().acknowledgeWelcomeModal(2)).rejects.toEqual({
      code: 'storage',
      message: 'Speicherfehler',
    });
  });

  it('uses scoped native game dialogs and the game export contract', async () => {
    const dataAccess = access();
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await dataAccess.readGamePackage()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('read_game_package', undefined);
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await dataAccess.pickGamePdfs()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('pick_game_pdfs', undefined);
    await dataAccess.exportPlanFile('games', 'spiele.json', [65]);
    expect(mocks.invoke).toHaveBeenLastCalledWith('export_plan_file', {
      format: 'games',
      filename: 'spiele.json',
      bytes: [65],
    });
  });
  it('saves the calling viewer document only on request, without accepting paths or bytes', async () => {
    const dataAccess = access();
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await dataAccess.savePdfViewer()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('save_pdf_viewer', undefined);
  });
  it('creates backups through the native dialog without accepting paths or bytes', async () => {
    const dataAccess = access();
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await dataAccess.backup()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('create_backup', undefined);
    mocks.invoke.mockResolvedValueOnce('/chosen/ankerzug.json');
    expect(await dataAccess.backup()).toBe('/chosen/ankerzug.json');
    expect(mocks.invoke).toHaveBeenLastCalledWith('create_backup', undefined);
  });
  it('reads only the calling viewer document without passing paths or window identifiers', async () => {
    const dataAccess = access();
    const pdf = { filename: 'Training.pdf', bytes: [37, 80, 68, 70] };
    mocks.invoke.mockResolvedValueOnce(pdf);
    expect(await dataAccess.readPdfViewer()).toEqual(pdf);
    expect(mocks.invoke).toHaveBeenLastCalledWith('read_pdf_viewer', undefined);
  });
  it('prints only the calling viewer document without passing paths or window identifiers', async () => {
    const dataAccess = access();
    mocks.invoke.mockResolvedValueOnce(undefined);
    await expect(dataAccess.printPdfViewer()).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenLastCalledWith('print_pdf_viewer', undefined);
  });
  it('sends matching input and camelCase argument names', async () => {
    const dataAccess = access();
    const input = { expectedRevision: 4, workspace: { cycles: [], templates: [] } };
    mocks.invoke.mockResolvedValue({ revision: 5, workspace: input.workspace });
    await dataAccess.save(input);
    expect(mocks.invoke).toHaveBeenLastCalledWith('save_workspace', { input });
    await dataAccess.restore('{"formatVersion":1}', 5);
    expect(mocks.invoke).toHaveBeenLastCalledWith('restore_backup', {
      contents: '{"formatVersion":1}',
      expectedRevision: 5,
    });
  });
  it('opens PDF bytes without accepting a filesystem path', async () => {
    const dataAccess = access();
    const bytes = [37, 80, 68, 70, 45];
    mocks.invoke.mockResolvedValueOnce(undefined);
    expect(await dataAccess.exportSessionPdf('Training.pdf', bytes)).toBeUndefined();
    expect(mocks.invoke).toHaveBeenLastCalledWith('export_session_pdf', {
      filename: 'Training.pdf',
      bytes,
    });
    mocks.invoke.mockRejectedValueOnce({ code: 'storage', message: 'Kein Schreibzugriff' });
    await expect(dataAccess.exportSessionPdf('Training.pdf', bytes)).rejects.toMatchObject({
      message: 'Kein Schreibzugriff',
    });
  });
  it('retrieves stored game attachment bytes only by attachment IDs', async () => {
    const dataAccess = access();
    const attachments = [{ id: 'attachment-1', bytes: [37, 80, 68, 70, 45] }];
    mocks.invoke.mockResolvedValueOnce(attachments);
    expect(await dataAccess.readGameAttachments(['attachment-1'])).toEqual(attachments);
    expect(mocks.invoke).toHaveBeenLastCalledWith('read_game_attachments', {
      ids: ['attachment-1'],
    });
  });
  it('uses typed package and native file commands without frontend paths', async () => {
    const dataAccess = access();
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await dataAccess.readMacroCyclePackage()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('read_macrocycle_package', undefined);
    await dataAccess.validateMacroCyclePackage('{}');
    expect(mocks.invoke).toHaveBeenLastCalledWith('validate_macrocycle_package', {
      contents: '{}',
    });
    mocks.invoke.mockResolvedValueOnce(null);
    expect(await dataAccess.readTemplatePackage()).toBeNull();
    expect(mocks.invoke).toHaveBeenLastCalledWith('read_template_package', undefined);
    await dataAccess.exportPlanFile('templates', 'plan.vorlagen.json', [65]);
    expect(mocks.invoke).toHaveBeenLastCalledWith('export_plan_file', {
      format: 'templates',
      filename: 'plan.vorlagen.json',
      bytes: [65],
    });
    await dataAccess.exportPlanFile('csv', 'plan.csv', [65]);
    expect(mocks.invoke).toHaveBeenLastCalledWith('export_plan_file', {
      format: 'csv',
      filename: 'plan.csv',
      bytes: [65],
    });
  });
  it('preserves native error codes and normalizes transport failures', async () => {
    const dataAccess = access();
    const error = { code: 'conflict', message: 'New revision' };
    mocks.invoke.mockRejectedValueOnce(error);
    await expect(dataAccess.load()).rejects.toEqual(error);
    mocks.invoke.mockRejectedValueOnce(new Error('IPC unavailable'));
    await expect(dataAccess.load()).rejects.toMatchObject({
      code: 'storage',
      message: expect.stringContaining('Desktop'),
    });
  });
  it('transports the complete v2 aggregate and both backup versions without rewriting domain data', async () => {
    const dataAccess = access();
    const workspace = fixture.workspace as Workspace;
    mocks.invoke.mockResolvedValue({ revision: 8, workspace });
    expect(await dataAccess.save({ expectedRevision: 7, workspace })).toEqual({
      revision: 8,
      workspace,
    });
    expect(mocks.invoke).toHaveBeenLastCalledWith('save_workspace', {
      input: { expectedRevision: 7, workspace },
    });
    for (const version of [1, 2]) {
      const contents = JSON.stringify({ ...fixture, formatVersion: version });
      await dataAccess.restore(contents, 8);
      expect(mocks.invoke).toHaveBeenLastCalledWith('restore_backup', {
        contents,
        expectedRevision: 8,
      });
    }
  });
});
