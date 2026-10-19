import { FUEL_KIND_TITLES, FuelKind } from '../entities/FuelBatch';
import { POSTPONE_REASON_TITLES, PostponeReason } from '../entities/Postponement';
import { PadRepository } from '../repositories/PadRepository';
import { Cell, Period, Report, sumColumn } from './Report';

/** Количество пусков по типам носителей (по дате пуска, а для непроведённых — по стартовому окну). */
export class LaunchesByVehicleReport extends Report {
  readonly title = 'Пуски по типам носителей';
  protected readonly note = 'Проведённые пуски считаются по дате старта, остальные — по началу стартового окна.';
  protected readonly columns = ['Тип носителя', 'Проведено', 'Готовятся / запланированы', 'Всего', 'Переносов'];

  protected rows(p: Period): Cell[][] {
    const rows = this.db.prepare(`
      SELECT v.name,
        SUM(CASE WHEN l.status = 'launched' THEN 1 ELSE 0 END) AS launched,
        SUM(CASE WHEN l.status <> 'launched' THEN 1 ELSE 0 END) AS pending,
        COUNT(*) AS total,
        (SELECT COUNT(*) FROM postponements pp JOIN launches l2 ON l2.id = pp.launch_id
          WHERE l2.vehicle_type_id = v.id AND pp.created_at BETWEEN ? AND ?) AS postponed
      FROM launches l JOIN vehicle_types v ON v.id = l.vehicle_type_id
      WHERE COALESCE(l.launched_at, l.window_start) BETWEEN ? AND ?
      GROUP BY v.id ORDER BY total DESC, v.name`).all(p.fromAt, p.toAt, p.fromAt, p.toAt) as
      { name: string; launched: number; pending: number; total: number; postponed: number }[];
    return rows.map((r) => [r.name, r.launched, r.pending, r.total, r.postponed]);
  }

  protected override totals(rows: Cell[][]): Cell[] {
    return ['Итого', sumColumn(rows, 1), sumColumn(rows, 2), sumColumn(rows, 3), sumColumn(rows, 4)];
  }
}

/** Расход топлива по партиям за период и текущие остатки. */
export class FuelByBatchReport extends Report {
  readonly title = 'Расход топлива по партиям';
  protected readonly note = 'Расход — за выбранный период; остаток и состояние — на текущую дату.';
  protected readonly columns = ['Партия', 'Компонент', 'Вид', 'Объём, т', 'Расход за период, т', 'Пусков', 'Остаток, т', 'Годна до'];

  protected rows(p: Period): Cell[][] {
    const rows = this.db.prepare(`
      SELECT b.batch_no, b.component, b.kind, b.quantity_t, b.expires_on,
        COALESCE((SELECT SUM(c.amount_t) FROM fuel_consumptions c WHERE c.batch_id = b.id AND c.recorded_at BETWEEN ? AND ?), 0) AS period_amount,
        (SELECT COUNT(DISTINCT c.launch_id) FROM fuel_consumptions c WHERE c.batch_id = b.id AND c.recorded_at BETWEEN ? AND ?) AS launches,
        b.quantity_t - COALESCE((SELECT SUM(c.amount_t) FROM fuel_consumptions c WHERE c.batch_id = b.id), 0) AS remaining
      FROM fuel_batches b ORDER BY b.kind, b.batch_no`).all(p.fromAt, p.toAt, p.fromAt, p.toAt) as
      { batch_no: string; component: string; kind: FuelKind; quantity_t: number; expires_on: string; period_amount: number; launches: number; remaining: number }[];
    return rows.map((r) => [r.batch_no, r.component, FUEL_KIND_TITLES[r.kind], r.quantity_t,
      Math.round(r.period_amount * 100) / 100, r.launches, Math.round(r.remaining * 100) / 100, r.expires_on]);
  }

  protected override totals(rows: Cell[][]): Cell[] {
    return ['Итого', '', '', sumColumn(rows, 3), sumColumn(rows, 4), '', sumColumn(rows, 6), ''];
  }
}

/** Загрузка стартовых площадок: пуски за период, занятость и наработка относительно норматива. */
export class PadLoadReport extends Report {
  readonly title = 'Загрузка стартовых площадок';
  protected readonly note = 'Занятость и наработка с последнего обслуживания — на текущий момент.';
  protected readonly columns = ['Площадка', 'Пусков за период', 'Ракет на площадке / лимит', 'Моточасы / норматив', 'Циклы / норматив', 'Обслуживаний за период', 'Состояние'];

  protected rows(p: Period): Cell[][] {
    const counts = this.db.prepare(`
      SELECT p.id,
        (SELECT COUNT(*) FROM launches l WHERE l.pad_id = p.id AND l.status = 'launched' AND l.launched_at BETWEEN ? AND ?) AS launches,
        (SELECT COUNT(*) FROM pad_maintenance m WHERE m.pad_id = p.id AND m.done_at BETWEEN ? AND ?) AS maintenance
      FROM launch_pads p`).all(p.fromAt, p.toAt, p.fromAt, p.toAt) as { id: number; launches: number; maintenance: number }[];
    const byId = new Map(counts.map((c) => [c.id, c]));
    return new PadRepository(this.db).findAll().map((pad) => [
      pad.name,
      byId.get(pad.id)?.launches ?? 0,
      `${pad.occupied} / ${pad.maxConcurrent}`,
      `${pad.hoursSince} / ${pad.hoursNorm}`,
      `${pad.cyclesSince} / ${pad.cyclesNorm}`,
      byId.get(pad.id)?.maintenance ?? 0,
      pad.maintenanceRequired ? 'Требуется обслуживание' : 'В норме',
    ]);
  }
}

/** Нештатные ситуации телеметрии по каналам. */
export class IncidentsReport extends Report {
  readonly title = 'Нештатные ситуации по каналам телеметрии';
  protected readonly note = 'Потери сигнала, зафиксированные операторами телеметрии за период.';
  protected readonly columns = ['Канал', 'Система носителя', 'Параметр', 'Нештатных ситуаций', 'Пусков с НС'];

  protected rows(p: Period): Cell[][] {
    const rows = this.db.prepare(`
      SELECT c.code, c.system_name, c.parameter, COUNT(i.id) AS cnt, COUNT(DISTINCT i.launch_id) AS launches
      FROM telemetry_channels c
      JOIN incidents i ON i.channel_id = c.id AND i.occurred_at BETWEEN ? AND ?
      GROUP BY c.id ORDER BY cnt DESC, c.code`).all(p.fromAt, p.toAt) as
      { code: string; system_name: string; parameter: string; cnt: number; launches: number }[];
    return rows.map((r) => [r.code, r.system_name, r.parameter, r.cnt, r.launches]);
  }

  protected override totals(rows: Cell[][]): Cell[] {
    return ['Итого', '', '', sumColumn(rows, 3), ''];
  }
}

/** Переносы пусков с детализацией по причинам. */
export class PostponementsReport extends Report {
  readonly title = 'Переносы пусков по причинам';
  protected readonly note = 'Для каждой категории приведены зафиксированные в журнале причины.';
  protected readonly columns = ['Категория причины', 'Переносов', 'Детализация'];

  protected rows(p: Period): Cell[][] {
    const rows = this.db.prepare(`
      SELECT reason_category AS category, reason FROM postponements
      WHERE created_at BETWEEN ? AND ? ORDER BY reason_category, created_at`).all(p.fromAt, p.toAt) as
      { category: PostponeReason; reason: string }[];
    const groups = new Map<PostponeReason, string[]>();
    for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r.reason]);
    return [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([category, reasons]) => [POSTPONE_REASON_TITLES[category], reasons.length, reasons.join('; ')]);
  }

  protected override totals(rows: Cell[][]): Cell[] {
    return ['Итого', sumColumn(rows, 1), ''];
  }
}
