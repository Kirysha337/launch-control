import { DomainError } from '../errors';
import { requireDate, requireNumber, requireOneOf, requireText } from '../validation';

/** Компонент топлива: горючее или окислитель. */
export enum FuelKind {
  Fuel = 'fuel',
  Oxidizer = 'oxidizer',
}

export const FUEL_KIND_TITLES: Record<FuelKind, string> = {
  [FuelKind.Fuel]: 'Горючее',
  [FuelKind.Oxidizer]: 'Окислитель',
};

export interface FuelBatchInput {
  batchNo: unknown;
  component: unknown;
  kind: unknown;
  quantity: unknown;
  receivedOn: unknown;
  expiresOn: unknown;
}

export interface FuelBatchRow {
  id: number; batch_no: string; component: string; kind: FuelKind; quantity_t: number;
  received_on: string; expires_on: string; consumed: number;
}

/** Партия топлива. Остаток не хранится: он равен объёму партии минус сумма расходов. */
export class FuelBatch {
  private constructor(
    private readonly _id: number,
    private readonly _batchNo: string,
    private readonly _component: string,
    private readonly _kind: FuelKind,
    private readonly _quantity: number,
    private readonly _receivedOn: string,
    private readonly _expiresOn: string,
    private _consumed: number,
  ) {}

  /** Создание новой партии с проверкой данных (id = 0 до сохранения). */
  static create(input: FuelBatchInput): FuelBatch {
    const receivedOn = requireDate(input.receivedOn, 'Дата поступления');
    const expiresOn = requireDate(input.expiresOn, 'Годна до');
    if (expiresOn <= receivedOn) throw new DomainError('Срок годности должен быть позже даты поступления');
    return new FuelBatch(
      0,
      requireText(input.batchNo, 'Номер партии', 40),
      requireText(input.component, 'Компонент', 100),
      requireOneOf(input.kind, 'Вид топлива', Object.values(FuelKind)),
      requireNumber(input.quantity, 'Объём, т', { min: 0.1, max: 5000 }),
      receivedOn,
      expiresOn,
      0,
    );
  }

  static restore(row: FuelBatchRow): FuelBatch {
    return new FuelBatch(row.id, row.batch_no, row.component, row.kind, row.quantity_t, row.received_on, row.expires_on, row.consumed);
  }

  get id() { return this._id; }
  get batchNo() { return this._batchNo; }
  get component() { return this._component; }
  get kind() { return this._kind; }
  get kindTitle() { return FUEL_KIND_TITLES[this._kind]; }
  get quantity() { return this._quantity; }
  get receivedOn() { return this._receivedOn; }
  get expiresOn() { return this._expiresOn; }
  get consumed() { return this._consumed; }
  get remaining() { return Math.round((this._quantity - this._consumed) * 1000) / 1000; }

  /** Просрочена ли партия на указанную дату. */
  isExpired(onDate: string): boolean {
    return this._expiresOn < onDate;
  }

  /**
   * Списание топлива на пуск. Проверяет срок годности и остаток.
   * @returns списанный объём в тоннах
   */
  consume(amountRaw: unknown, onDate: string): number {
    const amount = requireNumber(amountRaw, 'Расход, т', { min: 0.1 });
    if (this.isExpired(onDate)) {
      throw new DomainError(`Партия ${this._batchNo} просрочена (годна до ${this._expiresOn}), использовать её нельзя`);
    }
    if (amount > this.remaining) {
      throw new DomainError(`В партии ${this._batchNo} осталось ${this.remaining} т, запрошено ${amount} т`);
    }
    this._consumed += amount;
    return amount;
  }
}
