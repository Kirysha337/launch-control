import type { Db } from '../../db/database';
import { DomainError, NotFoundError } from '../errors';
import { LaunchStatus } from '../entities/Launch';
import { Role, User } from '../entities/User';
import { WeatherAssessment, WeatherInput, WeatherLimits, WeatherReport } from '../entities/Weather';
import { LaunchRepository } from '../repositories/LaunchRepository';
import { WeatherRepository, WeatherRow } from '../repositories/WeatherRepository';
import { addHours, hoursBetween, now } from '../time';

/** Резервный сдвиг стартового окна при переносе по погоде, часов. */
const WEATHER_SHIFT_HOURS = 24;

export interface WeatherResult {
  violations: string[];
  /** Новое начало окна, если пуск был перенесён. */
  postponedTo: string | null;
}

/** Метеообеспечение пуска: приём сводки, сравнение с пределами, автоматический перенос. */
export class WeatherService {
  constructor(
    private readonly db: Db,
    private readonly weather: WeatherRepository,
    private readonly launches: LaunchRepository,
  ) {}

  list(launchId: number): (WeatherRow & { violations: string[] })[] {
    const limits = this.limitsFor(launchId);
    return this.weather.list(launchId).map((row) => ({
      ...row,
      violations: WeatherAssessment.violations(WeatherReport.restore(row), limits),
    }));
  }

  limitsFor(launchId: number): WeatherLimits {
    const launch = this.launches.findById(launchId);
    if (!launch) throw new NotFoundError('Пуск');
    return this.launches.vehicleType(launch.vehicleTypeId)!;
  }

  /**
   * Сохраняет сводку. При превышении предельных значений пуск переносится на резервные
   * сутки, перенос фиксируется в журнале с перечнем нарушений.
   */
  record(actor: User, launchId: number, input: WeatherInput): WeatherResult {
    actor.require(Role.Meteo);
    const report = WeatherReport.create(input, now());
    return this.db.transaction((): WeatherResult => {
      const launch = this.launches.findById(launchId);
      if (!launch) throw new NotFoundError('Пуск');
      if (launch.status === LaunchStatus.Launched) throw new DomainError('Пуск уже проведён');
      const reportId = this.weather.insert(report, launchId, actor.id);
      const violations = WeatherAssessment.violations(report, this.launches.vehicleType(launch.vehicleTypeId)!);
      if (!violations.length) return { violations, postponedTo: null };

      const at = now();
      const duration = hoursBetween(launch.windowStart, launch.windowEnd);
      let newStart = addHours(launch.windowStart, WEATHER_SHIFT_HOURS);
      while (newStart <= at) newStart = addHours(newStart, WEATHER_SHIFT_HOURS);
      const old = launch.postpone(newStart, addHours(newStart, duration), at);
      this.launches.update(launch);
      this.launches.addPostponement({
        launchId, oldWindowStart: old, newWindowStart: newStart, category: 'weather',
        reason: `Превышены предельные значения: ${violations.join('; ')}`, weatherReportId: reportId,
      }, actor.id, at);
      return { violations, postponedTo: newStart };
    })();
  }
}
