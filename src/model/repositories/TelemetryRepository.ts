import type { Db } from '../../db/database';
import { Incident } from '../entities/Incident';

export interface ChannelRow { id: number; code: string; system_name: string; parameter: string; frequency_hz: number }
export interface IncidentRow {
  id: number; launch_id: number; payload: string; vehicle_type: string; code: string; system_name: string;
  occurred_at: string; description: string; measures: string; user: string;
}

/** Доступ к телеметрическим каналам и журналу нештатных ситуаций. */
export class TelemetryRepository {
  constructor(private readonly db: Db) {}

  channels(): ChannelRow[] {
    return this.db.prepare(`SELECT * FROM telemetry_channels ORDER BY code`).all() as ChannelRow[];
  }

  channelExists(id: number): boolean {
    return this.db.prepare(`SELECT 1 FROM telemetry_channels WHERE id = ?`).get(id) !== undefined;
  }

  insertIncident(i: Incident, userId: number): void {
    this.db.prepare(`
      INSERT INTO incidents (launch_id, channel_id, occurred_at, description, measures, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(i.launchId, i.channelId, i.occurredAt, i.description, i.measures, userId);
  }

  /** Журнал нештатных ситуаций (по одному пуску или по всем). */
  incidents(launchId?: number): IncidentRow[] {
    return this.db.prepare(`
      SELECT i.id, i.launch_id, l.payload, v.name AS vehicle_type, c.code, c.system_name,
             i.occurred_at, i.description, i.measures, u.full_name AS user
      FROM incidents i
      JOIN telemetry_channels c ON c.id = i.channel_id
      JOIN launches l ON l.id = i.launch_id
      JOIN vehicle_types v ON v.id = l.vehicle_type_id
      JOIN users u ON u.id = i.recorded_by
      WHERE (? IS NULL OR i.launch_id = ?)
      ORDER BY i.occurred_at DESC`).all(launchId ?? null, launchId ?? null) as IncidentRow[];
  }
}
