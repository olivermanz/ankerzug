// Injected only by the optional native exploration plugin, before Angular starts.
(() => {
  const records = [];
  Object.defineProperty(window, '__ankerzugExplorationDiagnostics', { value: records });
  const record = (kind, values) => {
    const text = values.map(value => {
      try { return value instanceof Error ? value.stack : typeof value === 'string' ? value : JSON.stringify(value); }
      catch { return String(value); }
    }).join(' ');
    records.push({ time: new Date().toISOString(), kind, text });
    if (records.length > 200) records.shift();
  };
  for (const kind of ['error', 'warn']) {
    const original = console[kind].bind(console);
    console[kind] = (...values) => { record(kind, values); original(...values); };
  }
  window.addEventListener('error', event => record('uncaught', [event.message, event.filename, event.lineno]));
  window.addEventListener('unhandledrejection', event => record('unhandledrejection', [event.reason]));
})();
