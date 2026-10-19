import type { Db } from '../../db/database';
import { Role, User } from '../entities/User';
import { Period, Report, ReportTable } from '../reports/Report';
import {
  FuelByBatchReport, IncidentsReport, LaunchesByVehicleReport, PadLoadReport, PostponementsReport,
} from '../reports/reports';

/** Формирование сводных отчётов руководителя центра. */
export class ReportService {
  private readonly reports: Report[];

  constructor(db: Db) {
    this.reports = [
      new LaunchesByVehicleReport(db),
      new FuelByBatchReport(db),
      new PadLoadReport(db),
      new IncidentsReport(db),
      new PostponementsReport(db),
    ];
  }

  /** Строит все отчёты за период. Каждый отчёт собирается своим классом (полиморфный вызов build). */
  build(actor: User, from: unknown, to: unknown): { period: Period; tables: ReportTable[] } {
    actor.require(Role.Manager);
    const period = Period.parse(from, to);
    return { period, tables: this.reports.map((r) => r.build(period)) };
  }
}
