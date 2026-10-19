import type { Db } from '../../db/database';
import { DomainError, NotFoundError } from '../errors';
import { FuelBatch, FuelBatchInput } from '../entities/FuelBatch';
import { FuelingStage } from '../entities/PreparationStage';
import { Role, User } from '../entities/User';
import { ConsumptionRow, FuelRepository } from '../repositories/FuelRepository';
import { LaunchRepository } from '../repositories/LaunchRepository';
import { now, today } from '../time';
import { requireId } from '../validation';

/** Учёт партий топлива и списание расхода на пуски. */
export class FuelService {
  constructor(
    private readonly db: Db,
    private readonly fuel: FuelRepository,
    private readonly launches: LaunchRepository,
  ) {}

  list(): FuelBatch[] {
    return this.fuel.findAll();
  }

  consumptions(launchId: number): ConsumptionRow[] {
    return this.fuel.consumptions(launchId);
  }

  addBatch(actor: User, input: FuelBatchInput): void {
    actor.require(Role.Engineer);
    const batch = FuelBatch.create(input);
    if (this.fuel.existsBatchNo(batch.batchNo)) throw new DomainError(`Партия ${batch.batchNo} уже зарегистрирована`);
    this.fuel.insert(batch);
  }

  /** Фиксация расхода топлива на пуск. Допускается только на этапе заправки. */
  consume(actor: User, launchId: number, input: { batchId: unknown; amount: unknown }): void {
    actor.require(Role.Engineer);
    this.db.transaction(() => {
      const launch = this.launches.findById(launchId);
      if (!launch) throw new NotFoundError('Пуск');
      if (!(launch.currentStage instanceof FuelingStage)) {
        throw new DomainError('Расход топлива фиксируется только на этапе «Заправка компонентами топлива»');
      }
      const batch = this.fuel.findById(requireId(input.batchId, 'Партия'));
      if (!batch) throw new NotFoundError('Партия топлива');
      const amount = batch.consume(input.amount, today());
      this.fuel.insertConsumption(launchId, batch.id, amount, actor.id, now());
    })();
  }
}
