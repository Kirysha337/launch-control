import type { Router } from 'express';
import { AccessDeniedError, DomainError } from '../model/errors';
import { ReportService } from '../model/services/ReportService';
import { today } from '../model/time';
import { reportsPage } from '../view/pages/reports';
import { currentUser, pageContext } from './common';

/** Сводные отчёты за период (по умолчанию — текущий год). */
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  routes(r: Router): void {
    r.get('/reports', (req, res) => {
      const year = today().slice(0, 4);
      const from = typeof req.query.from === 'string' ? req.query.from : `${year}-01-01`;
      const to = typeof req.query.to === 'string' ? req.query.to : `${year}-12-31`;
      const ctx = pageContext(req, res);
      try {
        const result = this.reports.build(currentUser(res), from, to);
        res.send(reportsPage(ctx, { from: result.period.from, to: result.period.to, tables: result.tables }));
      } catch (e) {
        if (e instanceof AccessDeniedError || !(e instanceof DomainError)) throw e;
        // некорректный период: показываем ошибку и отчёт за текущий год
        const result = this.reports.build(currentUser(res), `${year}-01-01`, `${year}-12-31`);
        res.status(422).send(reportsPage({ ...ctx, flash: { type: 'error', text: e.message } },
          { from: result.period.from, to: result.period.to, tables: result.tables }));
      }
    });
  }
}
