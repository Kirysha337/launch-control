import { DomainError, NotFoundError } from '../errors';
import { Incident } from '../entities/Incident';
import { LaunchStatus } from '../entities/Launch';
import { Role, User } from '../entities/User';
import { LaunchRepository } from '../repositories/LaunchRepository';
import { ChannelRow, IncidentRow, TelemetryRepository } from '../repositories/TelemetryRepository';
import { now } from '../time';

/** Телеметрические каналы и журнал нештатных ситуаций. */
export class TelemetryService {
  constructor(
    private readonly telemetry: TelemetryRepository,
    private readonly launches: LaunchRepository,
  ) {}

  channels(): ChannelRow[] {
    return this.telemetry.channels();
  }

  incidents(launchId?: number): IncidentRow[] {
    return this.telemetry.incidents(launchId);
  }

  /** Регистрация потери сигнала по каналу во время проведённого пуска. */
  registerIncident(actor: User, launchId: number, input: { channelId: unknown; occurredAt: unknown; description: unknown; measures: unknown }): void {
    actor.require(Role.Telemetry);
    const launch = this.launches.findById(launchId);
    if (!launch) throw new NotFoundError('Пуск');
    if (launch.status !== LaunchStatus.Launched || !launch.launchedAt) {
      throw new DomainError('Нештатные ситуации телеметрии фиксируются только для проведённого пуска');
    }
    const incident = Incident.register(input, launchId, launch.launchedAt, now());
    if (!this.telemetry.channelExists(incident.channelId)) throw new NotFoundError('Телеметрический канал');
    this.telemetry.insertIncident(incident, actor.id);
  }
}
