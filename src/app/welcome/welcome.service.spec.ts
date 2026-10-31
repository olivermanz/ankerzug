import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataAccessService } from '../data-access.service';
import { WelcomeService, WELCOME_MODAL_VERSION } from './welcome.service';

describe('welcome version orchestration', () => {
  const access = {
    loadWelcomeModalVersion: vi.fn(),
    acknowledgeWelcomeModal: vi.fn(),
  };
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: DataAccessService, useValue: access }],
    });
  });
  it.each([null, 0])('shows an unacknowledged version %s without saving', async (version) => {
    access.loadWelcomeModalVersion.mockResolvedValue(version);
    const service = TestBed.inject(WelcomeService);
    await service.initialize();
    expect(service.visible()).toBe(true);
    expect(access.acknowledgeWelcomeModal).not.toHaveBeenCalled();
  });
  it.each([WELCOME_MODAL_VERSION, WELCOME_MODAL_VERSION + 1])(
    'keeps acknowledged version %s hidden without downgrading it',
    async (version) => {
      access.loadWelcomeModalVersion.mockResolvedValue(version);
      const service = TestBed.inject(WelcomeService);
      await service.initialize();
      await service.initialize();
      expect(service.visible()).toBe(false);
      expect(access.loadWelcomeModalVersion).toHaveBeenCalledTimes(1);
      expect(access.acknowledgeWelcomeModal).not.toHaveBeenCalled();
    },
  );
  it('closes immediately on failure and retries the acknowledgement explicitly', async () => {
    access.loadWelcomeModalVersion.mockResolvedValue(null);
    access.acknowledgeWelcomeModal
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(1);
    const service = TestBed.inject(WelcomeService);
    await service.initialize();
    await service.dismiss();
    expect(service.visible()).toBe(false);
    expect(service.error()).toContain('nicht gespeichert');
    await service.retry();
    expect(service.error()).toBe('');
    expect(access.acknowledgeWelcomeModal).toHaveBeenLastCalledWith(WELCOME_MODAL_VERSION);
  });
  it('reports load failures and can retry without saving', async () => {
    access.loadWelcomeModalVersion
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(null);
    const service = TestBed.inject(WelcomeService);
    await service.initialize();
    expect(service.visible()).toBe(false);
    expect(service.error()).toContain('nicht geladen');
    await service.retry();
    expect(service.visible()).toBe(true);
    expect(service.error()).toBe('');
  });
  it('serializes persistence while retry is pending', async () => {
    let finish!: (version: number) => void;
    access.acknowledgeWelcomeModal.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const service = TestBed.inject(WelcomeService);
    const save = service.dismiss();
    await service.retry();
    expect(access.acknowledgeWelcomeModal).toHaveBeenCalledTimes(1);
    finish(1);
    await save;
    expect(service.busy()).toBe(false);
  });
});
