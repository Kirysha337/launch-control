import type { Db } from '../../db/database';
import { Launch, LaunchRow } from '../entities/Launch';
import { FuelKind } from '../entities/FuelBatch';
import { Postponement, PostponeReason } from '../entities/Postponement';
import { WeatherLimits } from '../entities/Weather';

const SELECT_LAUNCH = `
  SELECT l.id, l.vehicle_type_id, v.name AS vehicle_type, l.pad_id, p.name AS pad, l.payload, l.target_orbit,
         l.window_start, l.window_end, l.status, l.launched_at, l.pad_hours,
         (SELECT COUNT(*) FROM launch_stages s WHERE s.launch_id = l.id) AS completed_stages
  FROM launches l
  JOIN vehicle_types v ON v.id = l.vehicle_type_id
  JOIN launch_pads p   ON p.id = l.pad_id`;

export interface VehicleTypeRow extends WeatherLimits { id: number; name: string }
export interface StageRow { stage_no: number; completed_at: string; user: string }
export interface PostponementRow {
  old_window_start: string; new_window_start: string; reason_category: PostponeReason; reason: string; created_at: string; user: string;
}

/** Доступ к пускам, этапам подготовки, переносам и справочнику типов носителей. Все запросы параметризованы. */
export class LaunchRepository {
  constructor(private readonly db: Db) {}

  findAll(): Launch[] {
    const rows = this.db.prepare(`${SELECT_LAUNCH}
      ORDER BY CASE l.status WHEN 'launched' THEN 1 ELSE 0 END,
               CASE WHEN l.status = 'launched' THEN NULL ELSE l.window_start END,
               l.launched_at DESC`).all() as LaunchRow[];
    return rows.map(Launch.restore);
  }

  findById(id: number): Launch | null {
    const row = this.db.prepare(`${SELECT_LAUNCH} WHERE l.id = ?`).get(id) as LaunchRow | undefined;
    return row ? Launch.restore(row) : null;
  }

  insert(launch: Launch, userId: number): number {
    const res = this.db.prepare(`
      INSERT INTO launches (vehicle_type_id, pad_id, payload, target_orbit, window_start, window_end, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      launch.vehicleTypeId, launch.padId, launch.payload, launch.targetOrbit,
      launch.windowStart, launch.windowEnd, launch.status, userId);
    return Number(res.lastInsertRowid);
  }

  /** Сохраняет изменяемые поля пуска (окно, статус, факт пуска). */
  update(launch: Launch): void {
    this.db.prepare(`UPDATE launches SET window_start = ?, window_end = ?, status = ?, launched_at = ?, pad_hours = ? WHERE id = ?`)
      .run(launch.windowStart, launch.windowEnd, launch.status, launch.launchedAt, launch.padHours, launch.id);
  }

  addStage(launchId: number, stageNo: number, userId: number, at: string): void {
    this.db.prepare(`INSERT INTO launch_stages (launch_id, stage_no, completed_at, completed_by) VALUES (?, ?, ?, ?)`)
      .run(launchId, stageNo, at, userId);
  }

  stages(launchId: number): StageRow[] {
    return this.db.prepare(`
      SELECT s.stage_no, s.completed_at, u.full_name AS user FROM launch_stages s
      JOIN users u ON u.id = s.completed_by WHERE s.launch_id = ? ORDER BY s.stage_no`).all(launchId) as StageRow[];
  }

  vehicleTypes(): VehicleTypeRow[] {
    return this.db.prepare(`
      SELECT id, name, max_wind_ground AS maxWindGround, max_wind_altitude AS maxWindAltitude,
             min_temperature AS minTemperature, max_temperature AS maxTemperature, max_cloudiness AS maxCloudiness
      FROM vehicle_types ORDER BY name`).all() as VehicleTypeRow[];
  }

  vehicleType(id: number): VehicleTypeRow | null {
    return this.vehicleTypes().find((v) => v.id === id) ?? null;
  }

  addPostponement(p: Postponement, userId: number, at: string): void {
    this.db.prepare(`
      INSERT INTO postponements (launch_id, old_window_start, new_window_start, reason_category, reason, weather_report_id, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      p.launchId, p.oldWindowStart, p.newWindowStart, p.category, p.reason, p.weatherReportId, at, userId);
  }

  postponements(launchId: number): PostponementRow[] {
    return this.db.prepare(`
      SELECT p.old_window_start, p.new_window_start, p.reason_category, p.reason, p.created_at, u.full_name AS user
      FROM postponements p JOIN users u ON u.id = p.created_by
      WHERE p.launch_id = ? ORDER BY p.created_at DESC`).all(launchId) as PostponementRow[];
  }

  fuelKindsConsumed(launchId: number): FuelKind[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT b.kind FROM fuel_consumptions c JOIN fuel_batches b ON b.id = c.batch_id
      WHERE c.launch_id = ?`).all(launchId) as { kind: FuelKind }[];
    return rows.map((r) => r.kind);
  }
}
