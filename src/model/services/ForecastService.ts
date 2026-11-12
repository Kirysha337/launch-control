import { DomainError, NotFoundError } from '../errors';
import { Launch, LaunchStatus } from '../entities/Launch';
import { Role, User } from '../entities/User';
import { WeatherAssessment } from '../entities/Weather';
import { ForecastHistory, ManualForecastInput, WeatherForecast } from '../entities/WeatherForecast';
import { MeteoForecastProvider, MeteoServiceError } from '../integration/MeteoForecastProvider';
import { ForecastRepository } from '../repositories/ForecastRepository';
import { LaunchRepository } from '../repositories/LaunchRepository';
import { now } from '../time';

export interface ForecastResult {
  /** received — прогноз получен; unavailable — служба недоступна, нужен ручной ввод. */
  outcome: 'received' | 'unavailable';
  /** Нарушения пределов по прогнозу: непустой список — предупреждение о возможном переносе. */
  violations: string[];
  /** Причина недоступности службы. */
  reason: string;
}

/**
 * Прогноз погоды за 24 ч до стартового окна (лаба №4, условие 4).
 * Прогноз только предупреждает о возможном переносе; переносит пуск по-прежнему
 * фактическая сводка метеоролога (WeatherService) или решение руководителя.
 */
export class ForecastService {
  constructor(
    private readonly forecasts: ForecastRepository,
    private readonly launches: LaunchRepository,
    private readonly provider: MeteoForecastProvider,
  ) {}

  history(launchId: number): ForecastHistory {
    const launch = this.activeOrAny(launchId);
    return new ForecastHistory(this.forecasts.attempts(launchId), launch.windowStart);
  }

  /** Нарушения пределов по последнему прогнозу для текущего окна (пустой список — нет предупреждения). */
  warning(launchId: number): string[] {
    const launch = this.activeOrAny(launchId);
    if (launch.status === LaunchStatus.Launched) return [];
    const forecast = new ForecastHistory(this.forecasts.attempts(launchId), launch.windowStart).latestForecast;
    return forecast ? this.violations(launch, forecast) : [];
  }

  /** Нарушения пределов типа носителя по прогнозу — тот же критерий, что для фактической сводки. */
  violations(launch: Launch, forecast: WeatherForecast): string[] {
    return WeatherAssessment.violations(forecast, this.launches.vehicleType(launch.vehicleTypeId)!);
  }

  /**
   * Запрос прогноза во внешней службе. При таймауте, ошибке сети или неверном
   * ответе попытка фиксируется с причиной, и метеорологу открывается ручной ввод.
   * @param actor пользователь или null — автоматический запрос планировщика
   */
  async request(actor: User | null, launchId: number): Promise<ForecastResult> {
    actor?.require(Role.Meteo, Role.Manager);
    const launch = this.active(launchId);
    try {
      const body = await this.provider.fetchForecast({
        launchId, vehicleType: launch.vehicleType, pad: launch.pad, windowStart: launch.windowStart,
      });
      const forecast = WeatherForecast.fromApi(body);
      this.forecasts.insertForecast(launchId, launch.windowStart, now(), forecast, actor?.id ?? null);
      return { outcome: 'received', violations: this.violations(launch, forecast), reason: '' };
    } catch (e) {
      if (!(e instanceof MeteoServiceError)) throw e;
      this.forecasts.insertFailure(launchId, launch.windowStart, now(), e.message, actor?.id ?? null);
      return { outcome: 'unavailable', violations: [], reason: e.message };
    }
  }

  /** Ручной ввод прогноза метеорологом — только после неудачного запроса к службе. */
  manual(actor: User, launchId: number, input: ManualForecastInput): ForecastResult {
    actor.require(Role.Meteo);
    const launch = this.active(launchId);
    new ForecastHistory(this.forecasts.attempts(launchId), launch.windowStart).assertManualAllowed();
    const forecast = WeatherForecast.manual(input);
    this.forecasts.insertForecast(launchId, launch.windowStart, now(), forecast, actor.id);
    return { outcome: 'received', violations: this.violations(launch, forecast), reason: '' };
  }

  /** Пуски, по которым пора автоматически запросить прогноз. */
  dueLaunchIds(nowAt: string = now()): number[] {
    return this.launches.findAll()
      .filter((l) => l.status !== LaunchStatus.Launched)
      .filter((l) => new ForecastHistory(this.forecasts.attempts(l.id), l.windowStart).isDue(nowAt))
      .map((l) => l.id);
  }

  private activeOrAny(launchId: number): Launch {
    const launch = this.launches.findById(launchId);
    if (!launch) throw new NotFoundError('Пуск');
    return launch;
  }

  private active(launchId: number): Launch {
    const launch = this.activeOrAny(launchId);
    if (launch.status === LaunchStatus.Launched) throw new DomainError('Пуск уже проведён, прогноз не нужен');
    return launch;
  }
}
