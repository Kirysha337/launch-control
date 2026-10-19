import type { Db } from '../../db/database';
import { WeatherReport } from '../entities/Weather';

export interface WeatherRow {
  id: number; measured_at: string; wind_ground: number; wind_altitude: number; temperature: number;
  cloudiness: number; thunderstorm: number; user: string;
}

/** Доступ к метеосводкам пусков. */
export class WeatherRepository {
  constructor(private readonly db: Db) {}

  insert(r: WeatherReport, launchId: number, userId: number): number {
    const res = this.db.prepare(`
      INSERT INTO weather_reports (launch_id, measured_at, wind_ground, wind_altitude, temperature, cloudiness, thunderstorm, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      launchId, r.measuredAt, r.windGround, r.windAltitude, r.temperature, r.cloudiness, r.thunderstorm ? 1 : 0, userId);
    return Number(res.lastInsertRowid);
  }

  list(launchId: number): WeatherRow[] {
    return this.db.prepare(`
      SELECT w.*, u.full_name AS user FROM weather_reports w JOIN users u ON u.id = w.recorded_by
      WHERE w.launch_id = ? ORDER BY w.measured_at DESC, w.id DESC`).all(launchId) as WeatherRow[];
  }

  /** Последняя по времени измерения сводка или null. */
  latest(launchId: number): WeatherReport | null {
    const row = this.list(launchId)[0];
    return row ? WeatherReport.restore(row) : null;
  }
}
