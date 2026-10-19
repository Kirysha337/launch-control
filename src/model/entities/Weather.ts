import { DomainError } from '../errors';
import { requireDateTime, requireNumber } from '../validation';

/** Предельные метеоусловия для типа носителя. */
export interface WeatherLimits {
  maxWindGround: number;
  maxWindAltitude: number;
  minTemperature: number;
  maxTemperature: number;
  maxCloudiness: number;
}

export interface WeatherInput {
  measuredAt: unknown; windGround: unknown; windAltitude: unknown; temperature: unknown; cloudiness: unknown; thunderstorm: unknown;
}

/** Метеосводка для пуска. */
export class WeatherReport {
  private constructor(
    readonly measuredAt: string,
    readonly windGround: number,
    readonly windAltitude: number,
    readonly temperature: number,
    readonly cloudiness: number,
    readonly thunderstorm: boolean,
  ) {}

  /** Создание сводки с проверкой физически допустимых диапазонов. */
  static create(input: WeatherInput, nowAt: string): WeatherReport {
    const measuredAt = requireDateTime(input.measuredAt, 'Время измерения');
    if (measuredAt > nowAt) throw new DomainError('Время измерения не может быть в будущем');
    return new WeatherReport(
      measuredAt,
      requireNumber(input.windGround, 'Ветер у земли, м/с', { min: 0, max: 80 }),
      requireNumber(input.windAltitude, 'Ветер на высотах, м/с', { min: 0, max: 150 }),
      requireNumber(input.temperature, 'Температура, °C', { min: -70, max: 60 }),
      requireNumber(input.cloudiness, 'Облачность, баллы', { min: 0, max: 10, integer: true }),
      input.thunderstorm === true || input.thunderstorm === 'on' || input.thunderstorm === '1' || input.thunderstorm === 1,
    );
  }

  static restore(r: { measured_at: string; wind_ground: number; wind_altitude: number; temperature: number; cloudiness: number; thunderstorm: number }): WeatherReport {
    return new WeatherReport(r.measured_at, r.wind_ground, r.wind_altitude, r.temperature, r.cloudiness, r.thunderstorm === 1);
  }
}

/** Критерий метеоусловий. Каждый наследник проверяет один параметр. */
export abstract class WeatherCriterion {
  /** @returns описание нарушения или null, если параметр в норме */
  abstract check(report: WeatherReport, limits: WeatherLimits): string | null;
}

export class GroundWindCriterion extends WeatherCriterion {
  check(r: WeatherReport, l: WeatherLimits) {
    return r.windGround > l.maxWindGround ? `ветер у земли ${r.windGround} м/с > ${l.maxWindGround}` : null;
  }
}

export class AltitudeWindCriterion extends WeatherCriterion {
  check(r: WeatherReport, l: WeatherLimits) {
    return r.windAltitude > l.maxWindAltitude ? `ветер на высотах ${r.windAltitude} м/с > ${l.maxWindAltitude}` : null;
  }
}

export class TemperatureCriterion extends WeatherCriterion {
  check(r: WeatherReport, l: WeatherLimits) {
    if (r.temperature < l.minTemperature) return `температура ${r.temperature} °C < ${l.minTemperature}`;
    if (r.temperature > l.maxTemperature) return `температура ${r.temperature} °C > ${l.maxTemperature}`;
    return null;
  }
}

export class CloudinessCriterion extends WeatherCriterion {
  check(r: WeatherReport, l: WeatherLimits) {
    return r.cloudiness > l.maxCloudiness ? `облачность ${r.cloudiness} балл. > ${l.maxCloudiness}` : null;
  }
}

export class ThunderstormCriterion extends WeatherCriterion {
  check(r: WeatherReport) {
    return r.thunderstorm ? 'грозовая активность' : null;
  }
}

/** Оценка сводки по всем критериям. Новый критерий добавляется в список без изменения остального кода. */
export class WeatherAssessment {
  private static readonly criteria: readonly WeatherCriterion[] = [
    new GroundWindCriterion(),
    new AltitudeWindCriterion(),
    new TemperatureCriterion(),
    new CloudinessCriterion(),
    new ThunderstormCriterion(),
  ];

  /** Список нарушений предельных значений (пустой — пуск по погоде разрешён). */
  static violations(report: WeatherReport, limits: WeatherLimits): string[] {
    return WeatherAssessment.criteria
      .map((c) => c.check(report, limits))
      .filter((v): v is string => v !== null);
  }
}
