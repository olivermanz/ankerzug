import { describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/workspace-v2.json';
import { Workspace } from '../models';
import { calendarPlan, csvPlan, markdownPlan, planSections, exportFilename } from './readable';
import { createPlanPdf, renderPlanPdf } from '../pdf/plan-pdf';
const cycle = () => structuredClone(fixture.workspace as Workspace).cycles[0];
describe('readable plan exports', () => {
  it('escapes Markdown HTML/metacharacters and CSV formula/quote/newline content', () => {
    const c = cycle();
    c.name = '<script>*Bögen*';
    c.sessions[0].contents[0].goals = 'Saubere Auslösung';
    c.sessions[0].contents[0].material = 'Bogen und Pfeile';
    c.sessions[0].notes = '=HYPERLINK("bad")\nzweite Zeile';
    const md = markdownPlan(c),
      csv = csvPlan(c);
    expect(md).toContain('&lt;script&gt;\\*Bögen\\*');
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")\nzweite Zeile"');
    expect(csv).toContain('Geplante Pfeile');
    expect(md).toContain('Ziele: Saubere Auslösung');
    expect(md).toContain('Material: Bogen und Pfeile');
    const mesocycle = planSections(c).find((section) => section.title.startsWith('Mesozyklus:'))!;
    expect(mesocycle.lines.join(' ')).not.toContain('Intensität');
    expect(csv).toContain('"Saubere Auslösung"');
    expect(calendarPlan(c)).toContain('Ziele: Saubere Auslösung');
    expect(md).not.toContain('actualArrowCount');
    expect(planSections(c).some((s) => s.title.includes('Trainingsziel'))).toBe(false);
    expect(planSections(c).some((s) => s.title.includes('Materialthemen'))).toBe(false);
    expect(exportFilename({ ...c, name: 'a/b:plan' }, 'md')).toBe('Ankerzug-a-b-plan.md');
  });
  it('uses stable calendar UIDs, floating DST-boundary clocks, durations, cancellation and date competitions', () => {
    const c = cycle(),
      s = c.sessions[0];
    s.date = '2026-10-25';
    s.startTime = '02:30';
    s.plannedDuration = 120;
    s.name = 'Bögen, Übungen; Technik\\Weg\nZeile';
    s.status = 'cancelled';
    const first = calendarPlan(c, new Date('2026-10-07T12:00:00Z'));
    expect(first).toContain('DTSTART:20261025T023000\r\nDURATION:PT120M'.split('\r\n')[0]);
    expect(first).toContain('DURATION:PT120M');
    expect(first).toContain('STATUS:CANCELLED');
    expect(first).toContain('SUMMARY:Bögen\\, Übungen\\; Technik\\\\Weg\\nZeile');
    expect(first).toContain('DTSTART;VALUE=DATE:');
    const uids = (value: string) => value.match(/^UID:.+$/gm);
    expect(uids(first)).toEqual(uids(calendarPlan(c, new Date('2026-10-08T12:00:00Z'))));
    s.status = 'moved';
    expect(calendarPlan(c)).toContain('STATUS:CANCELLED');
    s.status = 'completed';
    expect(calendarPlan({ ...c, sessions: [s] })).not.toContain('STATUS:CANCELLED');
    expect(first).not.toContain('TZID');
  });
  it('folds Unicode calendar lines at 75 UTF-8 octets without losing text or allowing property injection', () => {
    const c = cycle();
    c.name = 'ü'.repeat(150);
    c.sessions[0].name = 'Name\r\nBEGIN:VEVENT';
    const ics = calendarPlan(c);
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DESCRIPTION:' + c.name);
    expect(unfolded).toContain('SUMMARY:Name\\nBEGIN:VEVENT');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('renders a paginated A4 plan PDF, preserves final text and rejects unsupported glyphs', () => {
    const c = cycle();
    c.sessions[0].contents[0].content = 'Übungen für Bögen und Füße\n'.repeat(200) + 'FINAL BLOCK';
    const doc = createPlanPdf(c),
      pdf = doc.output();
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.getNumberOfPages()).toBeGreaterThan(2);
    const text = vi.spyOn(doc, 'text');
    renderPlanPdf(doc, c);
    const rendered = text.mock.calls.map((call) => call[0]).join('\n');
    expect(rendered).toContain('FINAL BLOCK');
    expect(rendered).toContain('Übungen für Bögen und Füße');
    expect(rendered).not.toContain(c.goals[0].description);
    for (const call of text.mock.calls) expect(call[2]).toBeLessThanOrEqual(287);
    expect(pdf).toContain('/ToUnicode');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain('%%EOF');
    c.name = 'Unsupported 🏹';
    expect(() => createPlanPdf(c)).toThrow('nicht unterstützt');
  });
});
