import type { Db } from '../../db/database';
import { DomainError } from '../errors';
import { requireDate } from '../validation';

export type Cell = string | number;

/** Отчётный период (даты включительно). */
export class Period {
  private constructor(readonly from: string, readonly to: string) {}

  static parse(fromRaw: unknown, toRaw: unknown): Period {
    const from = requireDate(fromRaw, 'Начало периода');
    const to = requireDate(toRaw, 'Конец периода');
    if (from > to) throw new DomainError('Начало периода должно быть не позже конца');
    if (Date.parse(to) - Date.parse(from) > 5 * 366 * 86_400_000) throw new DomainError('Период отчёта не может превышать 5 лет');
    return new Period(from, to);
  }

  /** Начало периода в формате хранения моментов. */
  get fromAt() { return `${this.from} 00:00`; }
  /** Конец периода в формате хранения моментов. */
  get toAt() { return `${this.to} 23:59`; }
}

/** Готовая таблица отчёта для отображения. */
export interface ReportTable {
  title: string;
  note: string;
  columns: string[];
  rows: Cell[][];
  totals?: Cell[];
}

/**
 * Базовый класс отчёта (шаблонный метод): наследник задаёт заголовок, колонки
 * и строки, а сборку таблицы выполняет build().
 */
export abstract class Report {
  constructor(protected readonly db: Db) {}

  abstract readonly title: string;
  protected abstract readonly note: string;
  protected abstract readonly columns: string[];
  protected abstract rows(period: Period): Cell[][];

  /** Итоговая строка. По умолчанию отсутствует. */
  protected totals(_rows: Cell[][]): Cell[] | undefined {
    return undefined;
  }

  build(period: Period): ReportTable {
    const rows = this.rows(period);
    return { title: this.title, note: this.note, columns: this.columns, rows, totals: rows.length ? this.totals(rows) : undefined };
  }
}

/** Сумма числового столбца. */
export function sumColumn(rows: Cell[][], index: number): number {
  return Math.round(rows.reduce((acc, r) => acc + (typeof r[index] === 'number' ? (r[index] as number) : 0), 0) * 100) / 100;
}
