import type { Db } from '../../db/database';
import { LaunchPad, LaunchPadRow, MaintenanceRow, PadMaintenance } from '../entities/LaunchPad';

/**
 * Площадка с вычисляемыми показателями: занятость (ракеты после транспортировки,
 * ещё не стартовавшие) и наработка с последнего выполненного обслуживания.
 */
const SELECT_PAD = `
  SELECT x.*,
    (SELECT COALESCE(SUM(l.pad_hours), 0) FROM launches l
      WHERE l.pad_id = x.id AND l.status = 'launched' AND l.launched_at > COALESCE(x.last_maintenance, '')) AS hours_since,
    (SELECT COUNT(*) FROM launches l
      WHERE l.pad_id = x.id AND l.status = 'launched' AND l.launched_at > COALESCE(x.last_maintenance, '')) AS cycles_since
  FROM (
    SELECT p.id, p.name, p.max_concurrent, p.hours_norm, p.cycles_norm,
      (SELECT MAX(m.done_at) FROM pad_maintenance m WHERE m.pad_id = p.id) AS last_maintenance,
      (SELECT COUNT(*) FROM launches l WHERE l.pad_id = p.id AND l.status IN ('preparing', 'ready')
         AND (SELECT COUNT(*) FROM launch_stages s WHERE s.launch_id = l.id) >= 2) AS occupied
    FROM launch_pads p
  ) x`;

const SELECT_MAINTENANCE = `
  SELECT m.id, m.pad_id, p.name AS pad, m.kind, m.planned_date, m.done_at, m.note
  FROM pad_maintenance m JOIN launch_pads p ON p.id = m.pad_id`;

/** Доступ к стартовым площадкам и межпусковому обслуживанию. */
export class PadRepository {
  constructor(private readonly db: Db) {}

  findAll(): LaunchPad[] {
    return (this.db.prepare(`${SELECT_PAD} ORDER BY x.name`).all() as LaunchPadRow[]).map(LaunchPad.restore);
  }

  findById(id: number): LaunchPad | null {
    const row = this.db.prepare(`${SELECT_PAD} WHERE x.id = ?`).get(id) as LaunchPadRow | undefined;
    return row ? LaunchPad.restore(row) : null;
  }

  maintenance(): PadMaintenance[] {
    const rows = this.db.prepare(`${SELECT_MAINTENANCE}
      ORDER BY m.done_at IS NOT NULL, m.planned_date DESC`).all() as MaintenanceRow[];
    return rows.map(PadMaintenance.restore);
  }

  findMaintenance(id: number): PadMaintenance | null {
    const row = this.db.prepare(`${SELECT_MAINTENANCE} WHERE m.id = ?`).get(id) as MaintenanceRow | undefined;
    return row ? PadMaintenance.restore(row) : null;
  }

  insertMaintenance(m: PadMaintenance): void {
    this.db.prepare(`INSERT INTO pad_maintenance (pad_id, kind, planned_date, note) VALUES (?, ?, ?, ?)`)
      .run(m.padId, m.kind, m.plannedDate, m.note);
  }

  updateMaintenance(m: PadMaintenance): void {
    this.db.prepare(`UPDATE pad_maintenance SET done_at = ? WHERE id = ?`).run(m.doneAt, m.id);
  }
}
