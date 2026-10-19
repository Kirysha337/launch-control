import { DomainError } from '../errors';
import { requireDate, requireOneOf, requireText } from '../validation';

export interface LaunchPadRow {
  id: number; name: string; max_concurrent: number; hours_norm: number; cycles_norm: number;
  occupied: number; hours_since: number; cycles_since: number; last_maintenance: string | null;
}

/**
 * Стартовая площадка. Наработка (моточасы и циклы) с последнего обслуживания
 * вычисляется по проведённым пускам, а не хранится.
 */
export class LaunchPad {
  private constructor(
    private readonly _id: number,
    private readonly _name: string,
    private readonly _maxConcurrent: number,
    private readonly _hoursNorm: number,
    private readonly _cyclesNorm: number,
    private readonly _occupied: number,
    private readonly _hoursSince: number,
    private readonly _cyclesSince: number,
    private readonly _lastMaintenance: string | null,
  ) {}

  static restore(r: LaunchPadRow): LaunchPad {
    return new LaunchPad(r.id, r.name, r.max_concurrent, r.hours_norm, r.cycles_norm, r.occupied,
      r.hours_since, r.cycles_since, r.last_maintenance);
  }

  get id() { return this._id; }
  get name() { return this._name; }
  get maxConcurrent() { return this._maxConcurrent; }
  get hoursNorm() { return this._hoursNorm; }
  get cyclesNorm() { return this._cyclesNorm; }
  /** Ракет на площадке сейчас (прошли транспортировку, ещё не стартовали). */
  get occupied() { return this._occupied; }
  get hoursSince() { return this._hoursSince; }
  get cyclesSince() { return this._cyclesSince; }
  get lastMaintenance() { return this._lastMaintenance; }

  /** Выработан ли норматив по моточасам или циклам. */
  get maintenanceRequired(): boolean {
    return this._hoursSince >= this._hoursNorm || this._cyclesSince >= this._cyclesNorm;
  }

  /** Использованная доля норматива (наибольшая из двух), 0..1+. */
  get wear(): number {
    return Math.max(this._hoursSince / this._hoursNorm, this._cyclesSince / this._cyclesNorm);
  }
}

/** Виды межпускового обслуживания. */
export const MAINTENANCE_KINDS = ['inspection', 'repair', 'replacement'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];
export const MAINTENANCE_TITLES: Record<MaintenanceKind, string> = {
  inspection: 'Осмотр',
  repair: 'Ремонт',
  replacement: 'Замена агрегатов',
};

export interface MaintenanceRow {
  id: number; pad_id: number; pad: string; kind: MaintenanceKind; planned_date: string; done_at: string | null; note: string;
}

/** Межпусковое обслуживание площадки: планируется на дату и затем отмечается выполненным. */
export class PadMaintenance {
  private constructor(
    private readonly _id: number,
    private readonly _padId: number,
    private readonly _pad: string,
    private readonly _kind: MaintenanceKind,
    private readonly _plannedDate: string,
    private _doneAt: string | null,
    private readonly _note: string,
  ) {}

  static plan(input: { padId: number; kind: unknown; plannedDate: unknown; note: unknown }, todayDate: string): PadMaintenance {
    const plannedDate = requireDate(input.plannedDate, 'Плановая дата');
    if (plannedDate < todayDate) throw new DomainError('Нельзя запланировать обслуживание на прошедшую дату');
    const note = typeof input.note === 'string' && input.note.trim() ? requireText(input.note, 'Примечание', 300) : '';
    return new PadMaintenance(0, input.padId, '', requireOneOf(input.kind, 'Вид обслуживания', MAINTENANCE_KINDS), plannedDate, null, note);
  }

  static restore(r: MaintenanceRow): PadMaintenance {
    return new PadMaintenance(r.id, r.pad_id, r.pad, r.kind, r.planned_date, r.done_at, r.note);
  }

  get id() { return this._id; }
  get padId() { return this._padId; }
  get pad() { return this._pad; }
  get kind() { return this._kind; }
  get kindTitle() { return MAINTENANCE_TITLES[this._kind]; }
  get plannedDate() { return this._plannedDate; }
  get doneAt() { return this._doneAt; }
  get note() { return this._note; }

  /** Отметка о выполнении: с этого момента наработка площадки считается заново. */
  complete(nowAt: string): void {
    if (this._doneAt) throw new DomainError('Обслуживание уже отмечено выполненным');
    this._doneAt = nowAt;
  }
}
