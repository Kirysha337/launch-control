/**
 * Работа со временем. Все моменты хранятся строками «ГГГГ-ММ-ДД ЧЧ:ММ» в местном
 * времени космодрома: такие строки корректно сравниваются и сортируются в SQLite.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Момент в формате хранения. */
export function formatDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Текущий момент. */
export function now(): string {
  return formatDateTime(new Date());
}

/** Сегодняшняя дата «ГГГГ-ММ-ДД». */
export function today(): string {
  return now().slice(0, 10);
}

/** Сдвиг момента на заданное (в том числе дробное) число часов. */
export function addHours(dateTime: string, hours: number): string {
  const d = new Date(dateTime.replace(' ', 'T'));
  return formatDateTime(new Date(d.getTime() + Math.round(hours * 60) * 60_000));
}

/** Длительность интервала между двумя моментами, часов. */
export function hoursBetween(from: string, to: string): number {
  return (Date.parse(to.replace(' ', 'T')) - Date.parse(from.replace(' ', 'T'))) / 3_600_000;
}
