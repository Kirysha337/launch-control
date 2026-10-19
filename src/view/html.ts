/**
 * Шаблонизатор представлений: тегированный шаблон html`...` экранирует все
 * подставляемые значения, кроме уже готовых фрагментов SafeHtml. Это защищает от XSS.
 */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

/** «2026-10-19 14:30» → «19.10.2026 14:30». */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const [d, t] = value.split(' ');
  return `${fmtDate(d)}${t ? ' ' + t : ''}`;
}

/** «2026-10-19» → «19.10.2026». */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function fmtNum(value: number, digits = 1): string {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

/** Значение для поля datetime-local. */
export function toInputDateTime(value: string): string {
  return value.replace(' ', 'T');
}
