import { describe, expect, it, vi } from 'vitest';
import { validateGamePdfs } from './attachment-validation';
import fixture from '../../../fixtures/games-package-v1.json';
import { Game } from '../models';
const mock = { load: vi.fn() };
describe('attachment usability before mutation', () => {
  it('renders every page and frees resources before accepting the original PDF bytes', async () => {
    const render = vi.fn().mockResolvedValue(undefined),
      destroy = vi.fn().mockResolvedValue(undefined);
    mock.load.mockResolvedValue({ count: 3, render, destroy });
    const games = structuredClone(fixture.games) as Game[];
    const bytes = [...games[0].attachments[0].bytes!];
    await validateGamePdfs(games, mock.load);
    expect(render.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(destroy).toHaveBeenCalledOnce();
    expect(games[0].attachments[0].bytes).toEqual(bytes);
  });
  it('rejects unreadable or password-protected PDFs and destroys failed render jobs', async () => {
    mock.load.mockRejectedValueOnce(new Error('Password required'));
    await expect(validateGamePdfs(fixture.games as Game[], mock.load)).rejects.toThrow(
      'vollständig',
    );
    const destroy = vi.fn().mockResolvedValue(undefined);
    mock.load.mockResolvedValueOnce({
      count: 2,
      render: vi.fn().mockRejectedValue(new Error('Bad stream')),
      destroy,
    });
    await expect(validateGamePdfs(fixture.games as Game[], mock.load)).rejects.toThrow(
      'Bad stream',
    );
    expect(destroy).toHaveBeenCalledOnce();
  });
});
