import { DomainError } from './errors';

/**
 * Проверки входных значений. Используются слоем Model: любые данные из формы
 * проходят через них, поэтому обойти проверку, минуя интерфейс, нельзя.
 */

/** Обязательная непустая строка ограниченной длины. */
export function requireText(value: unknown, field: string, maxLength = 500): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new DomainError(`Поле «${field}» обязательно для заполнения`);
  if (text.length > maxLength) throw new DomainError(`Поле «${field}» длиннее ${maxLength} символов`);
  return text;
}

/** Конечное число в допустимом диапазоне. */
export function requireNumber(
  value: unknown,
  field: string,
  range: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const raw = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const num = typeof raw === 'number' ? raw : raw === '' || raw == null ? NaN : Number(raw);
  if (!Number.isFinite(num)) throw new DomainError(`Поле «${field}» должно быть числом`);
  if (range.integer && !Number.isInteger(num)) throw new DomainError(`Поле «${field}» должно быть целым числом`);
  if (range.min !== undefined && num < range.min) throw new DomainError(`Поле «${field}» не может быть меньше ${range.min}`);
  if (range.max !== undefined && num > range.max) throw new DomainError(`Поле «${field}» не может быть больше ${range.max}`);
  return num;
}

/** Идентификатор записи (положительное целое). */
export function requireId(value: unknown, field: string): number {
  return requireNumber(value, field, { min: 1, integer: true });
}

/** Значение из закрытого списка. */
export function requireOneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw new DomainError(`Недопустимое значение поля «${field}»`);
}

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Дата и время в формате «ГГГГ-ММ-ДД ЧЧ:ММ» (принимается и формат поля datetime-local). */
export function requireDateTime(value: unknown, field: string): string {
  const m = typeof value === 'string' ? DATE_TIME.exec(value.trim()) : null;
  if (!m || !isRealDate(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59) {
    throw new DomainError(`Поле «${field}» должно содержать корректные дату и время`);
  }
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

/** Дата в формате «ГГГГ-ММ-ДД». */
export function requireDate(value: unknown, field: string): string {
  const m = typeof value === 'string' ? DATE.exec(value.trim()) : null;
  if (!m || !isRealDate(+m[1], +m[2], +m[3])) throw new DomainError(`Поле «${field}» должно содержать корректную дату`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function isRealDate(y: number, mo: number, d: number): boolean {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
