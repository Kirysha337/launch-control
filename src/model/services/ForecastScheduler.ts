import { now } from '../time';
import { ForecastService } from './ForecastService';

/** Период проверки расписания планировщиком, мс. */
const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Планировщик: раз в минуту находит пуски, до окна которых осталось не больше 24 ч,
 * и запрашивает по ним прогноз от имени системы.
 */
export class ForecastScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly service: ForecastService, private readonly intervalMs = DEFAULT_INTERVAL_MS) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Один проход: возвращает число запрошенных прогнозов. Параллельные проходы не запускаются. */
  async tick(nowAt: string = now()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const ids = this.service.dueLaunchIds(nowAt);
      for (const id of ids) await this.service.request(null, id);
      return ids.length;
    } catch (e) {
      console.error('Планировщик прогнозов:', e);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
