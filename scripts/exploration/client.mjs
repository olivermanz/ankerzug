import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function request(base, method, path, body, timeout = 15000) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) {
    throw new Error(`${method} ${path}: ${result.value?.message ?? JSON.stringify(result)}`);
  }
  return result.value;
}

export class Explorer {
  constructor(state) {
    this.state = state;
  }
  async call(method, path, body) {
    const entry = { time: new Date().toISOString(), method, path, body };
    try {
      const value = await request(
        this.state.endpoint,
        method,
        `/session/${this.state.sessionId}${path}`,
        body,
      );
      await this.log({ ...entry, ok: true });
      return value;
    } catch (error) {
      await this.log({ ...entry, ok: false, error: error.message });
      throw error;
    }
  }
  log(entry) {
    return appendFile(join(this.state.runDir, 'actions.jsonl'), `${JSON.stringify(entry)}\n`);
  }
  evaluate(script, args = []) {
    return this.call('POST', '/execute/sync', { script, args });
  }
  async element(selector) {
    if (typeof selector !== 'string' || !selector) throw new Error('A CSS selector is required');
    const elements = await this.call('POST', '/elements', {
      using: 'css selector',
      value: selector,
    });
    if (elements.length !== 1) {
      throw new Error(`Expected exactly one element for ${selector}, found ${elements.length}`);
    }
    const id = elements[0]['element-6066-11e4-a52e-4f735466cecf'];
    if (
      !(await this.call('GET', `/element/${id}/enabled`)) ||
      !(await this.call('GET', `/element/${id}/displayed`))
    ) {
      throw new Error(`Element is disabled or hidden: ${selector}`);
    }
    return id;
  }
  async click(selector) {
    const id = await this.element(selector);
    return this.call('POST', `/element/${id}/click`, {});
  }
  async fill(selector, text) {
    if (typeof text !== 'string') throw new Error('fill requires a text string');
    const id = await this.element(selector);
    await this.call('POST', `/element/${id}/clear`, {});
    return this.call('POST', `/element/${id}/value`, { text: String(text) });
  }
  async select(selector, value) {
    await this.element(selector);
    // HTML selects have no WebDriver select endpoint. Dispatch the same Angular form events.
    return this.evaluate(
      `
      const el = document.querySelector(arguments[0]);
      if (!(el instanceof HTMLSelectElement) || el.disabled) throw new Error('Expected enabled select');
      const option = [...el.options].find(o => o.value === arguments[1] || o.text === arguments[1]);
      if (!option || option.disabled) throw new Error('Option not available');
      el.value = option.value;
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      return el.value;
    `,
      [selector, String(value)],
    );
  }
  async keys(keys) {
    const named = {
      Tab: '\uE004',
      Enter: '\uE007',
      Escape: '\uE00C',
      Backspace: '\uE003',
      ArrowLeft: '\uE012',
      ArrowUp: '\uE013',
      ArrowRight: '\uE014',
      ArrowDown: '\uE015',
      Control: '\uE009',
      Shift: '\uE008',
      Alt: '\uE00A',
      Meta: '\uE03D',
      Delete: '\uE017',
    };
    const values = (Array.isArray(keys) ? keys : [keys]).map((k) => named[k] ?? k);
    if (values.some((k) => typeof k !== 'string' || [...k].length !== 1)) {
      throw new Error('Use named keys or individual characters; an array presses a chord');
    }
    try {
      return await this.call('POST', '/actions', {
        actions: [
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              ...values.map((value) => ({ type: 'keyDown', value })),
              ...values.toReversed().map((value) => ({ type: 'keyUp', value })),
            ],
          },
        ],
      });
    } finally {
      await this.call('DELETE', '/actions');
    }
  }
  async snapshot() {
    const result = await this.evaluate(`
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const selector = el => {
        const parts = [];
        while (el && el.nodeType === 1) {
          let part = el.tagName.toLowerCase();
          const siblings = el.parentElement ? [...el.parentElement.children].filter(s => s.tagName === el.tagName) : [];
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(el) + 1) + ')';
          parts.unshift(part);
          el = el.parentElement;
        }
        return parts.join(' > ');
      };
      return {
        url: location.href, title: document.title,
        text: document.body.innerText,
        status: document.querySelector('.save-state')?.innerText,
        controls: [...document.querySelectorAll('button, a, input, select, textarea, summary, [tabindex], [role="button"]')]
          .filter(visible).map(el => ({
            selector: selector(el), tag: el.tagName.toLowerCase(), type: el.type,
            label: el.getAttribute('aria-label') || [...(el.labels || [])].map(l => l.innerText).join(' ') || el.innerText || el.title || el.placeholder,
            value: el.value, disabled: el.disabled, checked: el.checked,
            expanded: el.getAttribute('aria-expanded'), invalid: el.getAttribute('aria-invalid'),
            options: el.options ? [...el.options].map(o => ({value: o.value, text: o.text, disabled: o.disabled})) : undefined,
          })),
        diagnostics: window.__ankerzugExplorationDiagnostics || [],
      };
    `);
    const path = join(this.state.runDir, `snapshot-${Date.now()}.json`);
    await writeFile(path, JSON.stringify(result, null, 2));
    return { artifact: path, ...result };
  }
  async screenshot() {
    const value = await this.call('GET', '/screenshot');
    const path = join(this.state.runDir, `screenshot-${Date.now()}.png`);
    await writeFile(path, Buffer.from(value, 'base64'));
    return { artifact: path };
  }
  async waitSaved(timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const status = await this.evaluate(
        "return document.querySelector('.save-state')?.innerText;",
      );
      if (status?.trim() === 'Lokal gespeichert') return status;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('Workspace is not saved; inspect validation/storage feedback before stopping');
  }
}
