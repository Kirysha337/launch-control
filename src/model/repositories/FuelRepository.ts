import type { Db } from '../../db/database';
import { FuelBatch, FuelBatchRow, FuelKind } from '../entities/FuelBatch';

const SELECT_BATCH = `
  SELECT b.*, COALESCE((SELECT SUM(c.amount_t) FROM fuel_consumptions c WHERE c.batch_id = b.id), 0) AS consumed
  FROM fuel_batches b`;

export interface ConsumptionRow {
  batch_no: string; component: string; kind: FuelKind; amount_t: number; recorded_at: string; user: string;
}

/** Доступ к партиям топлива и расходу по пускам. */
export class FuelRepository {
  constructor(private readonly db: Db) {}

  findAll(): FuelBatch[] {
    return (this.db.prepare(`${SELECT_BATCH} ORDER BY b.kind, b.expires_on`).all() as FuelBatchRow[]).map(FuelBatch.restore);
  }

  findById(id: number): FuelBatch | null {
    const row = this.db.prepare(`${SELECT_BATCH} WHERE b.id = ?`).get(id) as FuelBatchRow | undefined;
    return row ? FuelBatch.restore(row) : null;
  }

  existsBatchNo(batchNo: string): boolean {
    return this.db.prepare(`SELECT 1 FROM fuel_batches WHERE batch_no = ?`).get(batchNo) !== undefined;
  }

  insert(b: FuelBatch): void {
    this.db.prepare(`
      INSERT INTO fuel_batches (batch_no, component, kind, quantity_t, received_on, expires_on) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(b.batchNo, b.component, b.kind, b.quantity, b.receivedOn, b.expiresOn);
  }

  insertConsumption(launchId: number, batchId: number, amount: number, userId: number, at: string): void {
    this.db.prepare(`
      INSERT INTO fuel_consumptions (launch_id, batch_id, amount_t, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?)`)
      .run(launchId, batchId, amount, at, userId);
  }

  consumptions(launchId: number): ConsumptionRow[] {
    return this.db.prepare(`
      SELECT b.batch_no, b.component, b.kind, c.amount_t, c.recorded_at, u.full_name AS user
      FROM fuel_consumptions c JOIN fuel_batches b ON b.id = c.batch_id JOIN users u ON u.id = c.recorded_by
      WHERE c.launch_id = ? ORDER BY c.recorded_at`).all(launchId) as ConsumptionRow[];
  }
}
