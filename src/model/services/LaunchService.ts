import type { Db } from '../../db/database';
import { DomainError, NotFoundError } from '../errors';
import { Launch, LaunchInput } from '../entities/Launch';
import { POSTPONE_REASONS } from '../entities/Postponement';
import { PreparationStage } from '../entities/PreparationStage';
import { Role, User } from '../entities/User';
import { WeatherAssessment } from '../entities/Weather';
import { LaunchRepository, PostponementRow, StageRow, VehicleTypeRow } from '../repositories/LaunchRepository';
import { PadRepository } from '../repositories/PadRepository';
import { WeatherRepository } from '../repositories/WeatherRepository';
import { now } from '../time';
import { requireOneOf, requireText } from '../validation';

/** Сценарии работы с пуском: регистрация, подготовка по этапам, перенос, проведение. */
export class LaunchService {
  constructor(
    private readonly db: Db,
    private readonly launches: LaunchRepository,
    private readonly pads: PadRepository,
    private readonly weather: WeatherRepository,
  ) {}

  list(): Launch[] {
    return this.launches.findAll();
  }

  get(id: number): Launch {
    const launch = this.launches.findById(id);
    if (!launch) throw new NotFoundError('Пуск');
    return launch;
  }

  stages(id: number): StageRow[] {
    return this.launches.stages(id);
  }

  postponements(id: number): PostponementRow[] {
    return this.launches.postponements(id);
  }

  vehicleTypes(): VehicleTypeRow[] {
    return this.launches.vehicleTypes();
  }

  /** Регистрация пуска руководителем. */
  register(actor: User, input: LaunchInput): number {
    actor.require(Role.Manager);
    const launch = Launch.register(input, now());
    if (!this.launches.vehicleType(launch.vehicleTypeId)) throw new NotFoundError('Тип носителя');
    if (!this.pads.findById(launch.padId)) throw new NotFoundError('Стартовая площадка');
    return this.launches.insert(launch, actor.id);
  }

  startPreparation(actor: User, id: number): void {
    actor.require(Role.Engineer);
    const launch = this.get(id);
    launch.startPreparation();
    this.launches.update(launch);
  }

  /** Завершение текущего этапа подготовки с проверкой условий этапа. */
  completeStage(actor: User, id: number): PreparationStage {
    actor.require(Role.Engineer);
    return this.db.transaction(() => {
      const launch = this.get(id);
      const pad = this.pads.findById(launch.padId)!;
      const stage = launch.completeStage({
        padName: pad.name,
        padOccupied: pad.occupied,
        padLimit: pad.maxConcurrent,
        padMaintenanceRequired: pad.maintenanceRequired,
        fuelKindsConsumed: this.launches.fuelKindsConsumed(id),
      });
      const at = now();
      this.launches.addStage(id, stage.no, actor.id, at);
      this.launches.update(launch);
      return stage;
    })();
  }

  /** Перенос пуска руководителем с указанием причины (фиксируется в журнале). */
  postpone(actor: User, id: number, input: { windowStart: unknown; windowEnd: unknown; category: unknown; reason: unknown }): void {
    actor.require(Role.Manager);
    const category = requireOneOf(input.category, 'Причина переноса', POSTPONE_REASONS);
    if (category === 'weather') throw new DomainError('Перенос по метеоусловиям выполняется автоматически по сводке метеоролога');
    const reason = requireText(input.reason, 'Описание причины', 300);
    this.db.transaction(() => {
      const launch = this.get(id);
      const at = now();
      const old = launch.postpone(input.windowStart, input.windowEnd, at);
      this.launches.update(launch);
      this.launches.addPostponement(
        { launchId: id, oldWindowStart: old, newWindowStart: launch.windowStart, category, reason, weatherReportId: null },
        actor.id, at);
    })();
  }

  /** Проведение пуска: проверка готовности и последней метеосводки. */
  conduct(actor: User, id: number, padHours: unknown): void {
    actor.require(Role.Manager);
    const launch = this.get(id);
    const limits = this.launches.vehicleType(launch.vehicleTypeId)!;
    const latest = this.weather.latest(id);
    launch.conduct(padHours, latest ? WeatherAssessment.violations(latest, limits) : null, now());
    this.launches.update(launch);
  }
}
