import { DomainError } from '../errors';
import { FuelKind } from './FuelBatch';

/** Сведения, нужные этапам для проверки условий завершения. Собирает сервис из БД. */
export interface StageContext {
  padName: string;
  /** Сколько ракет уже стоит на площадке (без текущей). */
  padOccupied: number;
  padLimit: number;
  padMaintenanceRequired: boolean;
  /** Какие компоненты топлива уже списаны на пуск. */
  fuelKindsConsumed: FuelKind[];
}

/**
 * Этап подготовки к пуску. Этапы проходятся строго по порядку,
 * каждый наследник задаёт свои условия завершения (полиморфизм).
 */
export abstract class PreparationStage {
  abstract readonly no: number;
  abstract readonly title: string;
  abstract readonly place: string;

  /** Проверка условий завершения этапа. По умолчанию дополнительных условий нет. */
  checkCompletion(_ctx: StageContext): void {}
}

/** 1. Доставка и сборка ракеты на техническом комплексе. */
export class AssemblyStage extends PreparationStage {
  readonly no = 1;
  readonly title = 'Доставка и сборка ракеты';
  readonly place = 'Технический комплекс';
}

/** 2. Транспортировка на стартовый комплекс: площадка должна быть свободна и обслужена. */
export class TransportStage extends PreparationStage {
  readonly no = 2;
  readonly title = 'Транспортировка на стартовый комплекс';
  readonly place = 'Стартовый комплекс';

  override checkCompletion(ctx: StageContext): void {
    if (ctx.padMaintenanceRequired) {
      throw new DomainError(`${ctx.padName}: выработан норматив моточасов или циклов, сначала проведите межпусковое обслуживание`);
    }
    if (ctx.padOccupied >= ctx.padLimit) {
      throw new DomainError(`${ctx.padName} занята: одновременных подготовок ${ctx.padOccupied} из ${ctx.padLimit} допустимых`);
    }
  }
}

/** 3. Заправка: должны быть списаны и горючее, и окислитель. */
export class FuelingStage extends PreparationStage {
  readonly no = 3;
  readonly title = 'Заправка компонентами топлива';
  readonly place = 'Стартовый комплекс';

  override checkCompletion(ctx: StageContext): void {
    const missing: string[] = [];
    if (!ctx.fuelKindsConsumed.includes(FuelKind.Fuel)) missing.push('горючего');
    if (!ctx.fuelKindsConsumed.includes(FuelKind.Oxidizer)) missing.push('окислителя');
    if (missing.length) throw new DomainError(`Заправка не завершена: не зафиксирован расход ${missing.join(' и ')}`);
  }
}

/** 4. Предстартовый контроль систем. */
export class PrelaunchCheckStage extends PreparationStage {
  readonly no = 4;
  readonly title = 'Предстартовый контроль систем';
  readonly place = 'Стартовый комплекс';
}

/** Все этапы в порядке выполнения. */
export const STAGES: readonly PreparationStage[] = [
  new AssemblyStage(),
  new TransportStage(),
  new FuelingStage(),
  new PrelaunchCheckStage(),
];
