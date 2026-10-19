import type { Router } from 'express';
import { PadService } from '../model/services/PadService';
import { today } from '../model/time';
import { padsPage } from '../view/pages/pads';
import { action, currentUser, idParam, pageContext } from './common';

/** Стартовые площадки и межпусковое обслуживание. */
export class PadController {
  constructor(private readonly pads: PadService) {}

  routes(r: Router): void {
    r.get('/pads', (req, res) => {
      res.send(padsPage(pageContext(req, res), { pads: this.pads.list(), maintenance: this.pads.maintenance(), today: today() }));
    });
    r.post('/pads/maintenance', action((req, res) => {
      this.pads.plan(currentUser(res), req.body);
      return 'Обслуживание запланировано';
    }, () => '/pads'));
    r.post('/pads/maintenance/:id/complete', action((req, res) => {
      this.pads.complete(currentUser(res), idParam(req));
      return 'Обслуживание выполнено, наработка площадки обнулена';
    }, () => '/pads'));
  }
}
