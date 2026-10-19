import { DomainError } from '../errors';
import { hoursBetween } from '../time';
import { requireDateTime, requireId, requireNumber, requireOneOf, requireText } from '../validation';
import { PreparationStage, STAGES, StageContext } from './PreparationStage';

/** Статусы пуска. Переходы: planned → preparing → ready → launched. */
export enum LaunchStatus {
  Planned = 'planned',
  Preparing = 'preparing',
  Ready = 'ready',
  Launched = 'launched',
}

export const LAUNCH_STATUS_TITLES: Record<LaunchStatus, string> = {
  [LaunchStatus.Planned]: 'Запланирован',
  [LaunchStatus.Preparing]: 'Подготовка',
  [LaunchStatus.Ready]: 'Готов к пуску',
  [LaunchStatus.Launched]: 'Пуск проведён',
};

/** Целевые орбиты. */
export const ORBITS = ['НОО', 'ССО', 'СКО', 'ГПО', 'ВЭО'] as const;
export type Orbit = (typeof ORBITS)[number];
export const ORBIT_TITLES: Record<Orbit, string> = {
  НОО: 'НОО — низкая околоземная',
  ССО: 'ССО — солнечно-синхронная',
  СКО: 'СКО — средняя круговая',
  ГПО: 'ГПО — геопереходная',
  ВЭО: 'ВЭО — высокоэллиптическая',
};

/** Максимальная длительность стартового окна, часов. */
const MAX_WINDOW_HOURS = 12;

export interface LaunchInput {
  vehicleTypeId: unknown;
  padId: unknown;
  payload: unknown;
  targetOrbit: unknown;
  windowStart: unknown;
  windowEnd: unknown;
}

export interface LaunchRow {
  id: number; vehicle_type_id: number; vehicle_type: string; pad_id: number; pad: string;
  payload: string; target_orbit: Orbit; window_start: string; window_end: string;
  status: LaunchStatus; completed_stages: number; launched_at: string | null; pad_hours: number | null;
}

/** Пуск ракеты-носителя: регистрация, поэтапная подготовка, переносы и проведение. */
export class Launch {
  private constructor(
    private readonly _id: number,
    private readonly _vehicleTypeId: number,
    private readonly _vehicleType: string,
    private readonly _padId: number,
    private readonly _pad: string,
    private readonly _payload: string,
    private readonly _targetOrbit: Orbit,
    private _windowStart: string,
    private _windowEnd: string,
    private _status: LaunchStatus,
    private _completedStages: number,
    private _launchedAt: string | null,
    private _padHours: number | null,
  ) {}

  /** Регистрация нового пуска с проверкой всех полей. */
  static register(input: LaunchInput, nowAt: string): Launch {
    const windowStart = requireDateTime(input.windowStart, 'Начало стартового окна');
    const windowEnd = requireDateTime(input.windowEnd, 'Конец стартового окна');
    Launch.checkWindow(windowStart, windowEnd, nowAt);
    return new Launch(
      0,
      requireId(input.vehicleTypeId, 'Тип носителя'), '',
      requireId(input.padId, 'Стартовая площадка'), '',
      requireText(input.payload, 'Полезная нагрузка', 200),
      requireOneOf(input.targetOrbit, 'Целевая орбита', ORBITS),
      windowStart, windowEnd, LaunchStatus.Planned, 0, null, null,
    );
  }

  static restore(r: LaunchRow): Launch {
    return new Launch(r.id, r.vehicle_type_id, r.vehicle_type, r.pad_id, r.pad, r.payload, r.target_orbit,
      r.window_start, r.window_end, r.status, r.completed_stages, r.launched_at, r.pad_hours);
  }

  private static checkWindow(start: string, end: string, nowAt: string): void {
    if (start <= nowAt) throw new DomainError('Стартовое окно должно начинаться в будущем');
    if (end <= start) throw new DomainError('Конец стартового окна должен быть позже начала');
    if (hoursBetween(start, end) > MAX_WINDOW_HOURS) throw new DomainError(`Стартовое окно не может быть длиннее ${MAX_WINDOW_HOURS} ч`);
  }

  get id() { return this._id; }
  get vehicleTypeId() { return this._vehicleTypeId; }
  get vehicleType() { return this._vehicleType; }
  get padId() { return this._padId; }
  get pad() { return this._pad; }
  get payload() { return this._payload; }
  get targetOrbit() { return this._targetOrbit; }
  get windowStart() { return this._windowStart; }
  get windowEnd() { return this._windowEnd; }
  get status() { return this._status; }
  get statusTitle() { return LAUNCH_STATUS_TITLES[this._status]; }
  get completedStages() { return this._completedStages; }
  get launchedAt() { return this._launchedAt; }
  get padHours() { return this._padHours; }

  /** Текущий (следующий к выполнению) этап подготовки или null, если подготовка не идёт. */
  get currentStage(): PreparationStage | null {
    return this._status === LaunchStatus.Preparing ? STAGES[this._completedStages] : null;
  }

  /** Начало подготовки: planned → preparing. */
  startPreparation(): void {
    if (this._status !== LaunchStatus.Planned) throw new DomainError('Подготовку можно начать только у запланированного пуска');
    this._status = LaunchStatus.Preparing;
  }

  /**
   * Завершение текущего этапа. Условия проверяет сам этап (полиморфный вызов).
   * После четвёртого этапа пуск становится готовым.
   */
  completeStage(ctx: StageContext): PreparationStage {
    const stage = this.currentStage;
    if (!stage) throw new DomainError('Пуск не находится на этапе подготовки');
    stage.checkCompletion(ctx);
    this._completedStages += 1;
    if (this._completedStages === STAGES.length) this._status = LaunchStatus.Ready;
    return stage;
  }

  /** Перенос стартового окна на более позднее время. Возвращает прежнее начало окна. */
  postpone(newStartRaw: unknown, newEndRaw: unknown, nowAt: string): string {
    if (this._status === LaunchStatus.Launched) throw new DomainError('Проведённый пуск перенести нельзя');
    const newStart = requireDateTime(newStartRaw, 'Новое начало окна');
    const newEnd = requireDateTime(newEndRaw, 'Новый конец окна');
    if (newStart <= this._windowStart) throw new DomainError('Новое стартовое окно должно быть позже текущего');
    Launch.checkWindow(newStart, newEnd, nowAt);
    const old = this._windowStart;
    this._windowStart = newStart;
    this._windowEnd = newEnd;
    return old;
  }

  /**
   * Проведение пуска. Требует готовности и допустимых метеоусловий.
   * @param weatherViolations нарушения по последней метеосводке или null, если сводки нет
   */
  conduct(padHoursRaw: unknown, weatherViolations: string[] | null, nowAt: string): void {
    if (this._status !== LaunchStatus.Ready) throw new DomainError('Пуск можно провести только после завершения всех этапов подготовки');
    if (weatherViolations === null) throw new DomainError('Нет метеоданных: метеоролог должен внести сводку перед пуском');
    if (weatherViolations.length) throw new DomainError(`Метеоусловия не допускают пуск: ${weatherViolations.join('; ')}`);
    this._padHours = requireNumber(padHoursRaw, 'Наработка агрегатов площадки, ч', { min: 0.5, max: 72 });
    this._launchedAt = nowAt;
    this._status = LaunchStatus.Launched;
  }
}
