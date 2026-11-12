import type { Db } from '../../db/database';
import { ForecastAttempt, ForecastSource, WeatherForecast } from '../entities/WeatherForecast';

interface ForecastRow {
  id: number; window_start: string; requested_at: string; source: ForecastSource;
  wind_ground: number | null; wind_altitude: number | null; temperature: number | null;
  cloudiness: number | null; thunderstorm: number | null; note: string; user: string | null;
}

/** Доступ к прогнозам внешней метеослужбы (таблица weather_forecasts). */
export class ForecastRepository {
  constructor(private readonly db: Db) {}

  /** Попытки получить прогноз по пуску, от новых к старым. */
  attempts(launchId: number): ForecastAttempt[] {
    const rows = this.db.prepare(`
      SELECT f.*, u.full_name AS user FROM weather_forecasts f LEFT JOIN users u ON u.id = f.recorded_by
      WHERE f.launch_id = ? ORDER BY f.requested_at DESC, f.id DESC`).all(launchId) as ForecastRow[];
    return rows.map((r) => ({
      id: r.id,
      windowStart: r.window_start,
      requestedAt: r.requested_at,
      source: r.source,
      forecast: r.wind_ground === null ? null : WeatherForecast.restore({
        source: r.source, wind_ground: r.wind_ground, wind_altitude: r.wind_altitude!, temperature: r.temperature!,
        cloudiness: r.cloudiness!, thunderstorm: r.thunderstorm!, note: r.note,
      }),
      note: r.note,
      user: r.user,
    }));
  }

  /** Сохраняет полученный прогноз (от службы или ручной). userId = null — запрос системы. */
  insertForecast(launchId: number, windowStart: string, at: string, f: WeatherForecast, userId: number | null): void {
    this.db.prepare(`
      INSERT INTO weather_forecasts (launch_id, window_start, requested_at, source, wind_ground, wind_altitude, temperature, cloudiness, thunderstorm, note, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      launchId, windowStart, at, f.source, f.windGround, f.windAltitude, f.temperature, f.cloudiness, f.thunderstorm ? 1 : 0, f.basis, userId);
  }

  /** Сохраняет неудачное обращение к службе с причиной. */
  insertFailure(launchId: number, windowStart: string, at: string, reason: string, userId: number | null): void {
    this.db.prepare(`
      INSERT INTO weather_forecasts (launch_id, window_start, requested_at, source, note, recorded_by)
      VALUES (?, ?, ?, 'api', ?, ?)`).run(launchId, windowStart, at, reason, userId);
  }
}
