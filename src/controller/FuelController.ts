import type { Request, Router } from 'express';
import { FuelService } from '../model/services/FuelService';
import { today } from '../model/time';
import { fuelPage } from '../view/pages/fuel';
import { action, currentUser, idParam, pageContext } from './common';

/** Партии топлива и списание расхода на пуск. */
export class FuelController {
  constructor(private readonly fuel: FuelService) {}

  routes(r: Router): void {
    r.get('/fuel', (req, res) => {
      res.send(fuelPage(pageContext(req, res), { batches: this.fuel.list(), today: today() }));
    });
    r.post('/fuel', action((req, res) => {
      this.fuel.addBatch(currentUser(res), req.body);
      return `Партия ${String(req.body.batchNo).trim()} зарегистрирована`;
    }, () => '/fuel'));
    r.post('/launches/:id/fuel', action((req, res) => {
      this.fuel.consume(currentUser(res), idParam(req), req.body);
      return 'Расход топлива зафиксирован';
    }, (req: Request) => `/launches/${req.params.id}`));
  }
}
