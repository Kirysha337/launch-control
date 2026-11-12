import { DomainError } from '../errors';
import { MeteoServiceError } from '../integration/MeteoForecastProvider';
import { addHours, hoursBetween } from '../time';
import { requireNumber, requireText } from '../validation';
import { parseFlag, WeatherReading } from './Weather';

/** За сколько часов до начала стартового окна запрашивается прогноз. */
export const FORECAST_LEAD_HOURS = 24;
/** Пауза между повторными автоматическими запросами при недоступности службы, минут. */
export const FORECAST_RETRY_MINUTES = 15;
/** Нижняя граница «высот»: уровни от 1 км и выше сравниваются с пределом ветра на высотах. */
const ALTITUDE_FROM_M = 1000;
/** Наземным считается уровень не выше 100 м. */
const GROUND_UP_TO_M = 100;

export type ForecastSource = 'api' | 'manual';
export const FORECAST_SOURCE_TITLES: Record<ForecastSource, string> = {
  api: 'Метеослужба (API)',
  manual: 'Ручной ввод метеоролога',
};

/** Уровень профиля из ответа метеослужбы. */
export interface ForecastLevel {
  altitudeM: number;
  windMs: number;
  temperatureC: number;
}

export interface ManualForecastInput {
  windGround: unknown; windAltitude: unknown; temperature: unknown; cloudiness: unknown; thunderstorm: unknown; basis: unknown;
}

/**
 * Прогноз погоды на стартовое окно. Профиль по высотам сводится к тем же
 * показателям, что и фактическая сводка, поэтому прогноз проверяется теми же
 * критериями (WeatherAssessment) — единый критерий для API и ручного ввода.
 */
export class WeatherForecast implements WeatherReading {
  private constructor(
    readonly source: ForecastSource,
    readonly windGround: number,
    readonly windAltitude: number,
    readonly temperature: number,
    readonly cloudiness: number,
    readonly thunderstorm: boolean,
    /** Для ручного ввода — основание (откуда данные). */
    readonly basis: string,
  ) {}

  /**
   * Разбор ответа внешней метеослужбы. Ожидаемый формат (принят нами, в требованиях не определён):
   * `{ levels: [{ altitudeM, windMs, temperatureC }], cloudiness: 0..10, thunderstorm: boolean }`.
   * @throws MeteoServiceError('format') — ответ не соответствует формату
   */
  static fromApi(body: unknown): WeatherForecast {
    const bad = (why: string) => new MeteoServiceError('format', `неверный формат ответа метеослужбы: ${why}`);
    if (typeof body !== 'object' || body === null) throw bad('ожидался объект JSON');
    const b = body as Record<string, unknown>;
    if (!Array.isArray(b.levels) || b.levels.length < 2 || b.levels.length > 50) throw bad('levels — массив из 2–50 уровней');
    const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const levels: ForecastLevel[] = b.levels.map((raw, i) => {
      const l = raw as Record<string, unknown>;
      if (!num(l?.altitudeM, 0, 40_000) || !num(l?.windMs, 0, 150) || !num(l?.temperatureC, -90, 60)) {
        throw bad(`уровень ${i + 1}: altitudeM 0–40000, windMs 0–150, temperatureC −90…60`);
      }
      return { altitudeM: l.altitudeM as number, windMs: l.windMs as number, temperatureC: l.temperatureC as number };
    });
    if (!num(b.cloudiness, 0, 10) || !Number.isInteger(b.cloudiness)) throw bad('cloudiness — целое 0–10');
    if (typeof b.thunderstorm !== 'boolean') throw bad('thunderstorm — true/false');

    const ground = levels.reduce((a, l) => (l.altitudeM < a.altitudeM ? l : a));
    if (ground.altitudeM > GROUND_UP_TO_M) throw bad(`нет наземного уровня (до ${GROUND_UP_TO_M} м)`);
    const upper = levels.filter((l) => l.altitudeM >= ALTITUDE_FROM_M);
    if (!upper.length) throw bad(`нет уровней от ${ALTITUDE_FROM_M} м`);
    const windAltitude = Math.max(...upper.map((l) => l.windMs));
    return new WeatherForecast('api', ground.windMs, windAltitude, ground.temperatureC, b.cloudiness as number, b.thunderstorm, '');
  }

  /** Ручной ввод прогноза метеорологом при недоступности службы; основание обязательно. */
  static manual(input: ManualForecastInput): WeatherForecast {
    return new WeatherForecast(
      'manual',
      requireNumber(input.windGround, 'Ветер у земли, м/с', { min: 0, max: 80 }),
      requireNumber(input.windAltitude, 'Ветер на высотах, м/с', { min: 0, max: 150 }),
      requireNumber(input.temperature, 'Температура, °C', { min: -70, max: 60 }),
      requireNumber(input.cloudiness, 'Облачность, баллы', { min: 0, max: 10, integer: true }),
      parseFlag(input.thunderstorm),
      WeatherForecast.requireBasis(input.basis),
    );
  }

  private static requireBasis(value: unknown): string {
    const text = requireText(value, 'Основание ручного ввода', 300);
    if (text.length < 5) throw new DomainError('Основание ручного ввода должно содержать не менее 5 символов');
    return text;
  }

  static restore(r: {
    source: ForecastSource; wind_ground: number; wind_altitude: number; temperature: number; cloudiness: number; thunderstorm: number; note: string;
  }): WeatherForecast {
    return new WeatherForecast(r.source, r.wind_ground, r.wind_altitude, r.temperature, r.cloudiness, r.thunderstorm === 1,
      r.source === 'manual' ? r.note : '');
  }
}

/** Попытка получить прогноз: успешная (есть прогноз) или неудачная (служба недоступна). */
export interface ForecastAttempt {
  id: number;
  windowStart: string;
  requestedAt: string;
  source: ForecastSource;
  /** Прогноз или null, если служба не ответила. */
  forecast: WeatherForecast | null;
  /** Причина недоступности службы или основание ручного ввода. */
  note: string;
  user: string | null;
}

/**
 * История прогнозов одного пуска. Учитываются только попытки для текущего
 * стартового окна: после переноса прогноз запрашивается заново.
 */
export class ForecastHistory {
  private readonly current: ForecastAttempt[];

  /** @param attempts попытки пуска в порядке от новых к старым */
  constructor(attempts: ForecastAttempt[], private readonly windowStart: string) {
    this.current = attempts.filter((a) => a.windowStart === windowStart);
  }

  get attempts(): readonly ForecastAttempt[] {
    return this.current;
  }

  /** Последний полученный прогноз (от службы или ручной). */
  get latestForecast(): WeatherForecast | null {
    return this.current.find((a) => a.forecast !== null)?.forecast ?? null;
  }

  /** Ручной ввод допускается только после неудачного обращения к службе. */
  get manualAllowed(): boolean {
    const last = this.current[0];
    return last !== undefined && last.forecast === null;
  }

  assertManualAllowed(): void {
    if (!this.manualAllowed) {
      throw new DomainError('Ручной ввод прогноза допускается только после неудачного запроса к внешней метеослужбе');
    }
  }

  /**
   * Пора ли запросить прогноз автоматически: до начала окна не больше 24 ч,
   * прогноза ещё нет, последняя неудачная попытка была не позже чем 15 минут назад.
   */
  isDue(nowAt: string): boolean {
    const hoursLeft = hoursBetween(nowAt, this.windowStart);
    if (hoursLeft <= 0 || hoursLeft > FORECAST_LEAD_HOURS) return false;
    if (this.latestForecast) return false;
    const last = this.current[0];
    return !last || addHours(last.requestedAt, FORECAST_RETRY_MINUTES / 60) <= nowAt;
  }
}
