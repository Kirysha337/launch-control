import { DomainError } from '../errors';
import { requireDateTime, requireId, requireText } from '../validation';

/**
 * Нештатная ситуация: потеря сигнала по телеметрическому каналу во время пуска.
 * Фиксируются время, канал и принятые меры.
 */
export class Incident {
  private constructor(
    readonly launchId: number,
    readonly channelId: number,
    readonly occurredAt: string,
    readonly description: string,
    readonly measures: string,
  ) {}

  /**
   * @param launchedAt время старта; ситуация не может произойти раньше пуска или позже текущего момента
   */
  static register(
    input: { channelId: unknown; occurredAt: unknown; description: unknown; measures: unknown },
    launchId: number, launchedAt: string, nowAt: string,
  ): Incident {
    const occurredAt = requireDateTime(input.occurredAt, 'Время потери сигнала');
    if (occurredAt < launchedAt) throw new DomainError(`Время потери сигнала раньше времени старта (${launchedAt})`);
    if (occurredAt > nowAt) throw new DomainError('Время потери сигнала не может быть в будущем');
    return new Incident(
      launchId,
      requireId(input.channelId, 'Канал'),
      occurredAt,
      requireText(input.description, 'Описание', 500),
      requireText(input.measures, 'Принятые меры', 500),
    );
  }
}
