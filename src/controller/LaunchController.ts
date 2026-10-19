import type { Request, Response, Router } from 'express';
import { FuelService } from '../model/services/FuelService';
import { LaunchService } from '../model/services/LaunchService';
import { PadService } from '../model/services/PadService';
import { TelemetryService } from '../model/services/TelemetryService';
import { WeatherService } from '../model/services/WeatherService';
import { now, today } from '../model/time';
import { launchPage } from '../view/pages/launch';
import { launchesPage } from '../view/pages/launches';
import { action, currentUser, idParam, pageContext } from './common';

/** Расписание пусков и карточка пуска: регистрация, подготовка, перенос, проведение. */
export class LaunchController {
  constructor(
    private readonly launches: LaunchService,
    private readonly fuel: FuelService,
    private readonly weather: WeatherService,
    private readonly telemetry: TelemetryService,
    private readonly pads: PadService,
  ) {}

  routes(r: Router): void {
    const card = (req: Request) => `/launches/${req.params.id}`;
    r.get('/', this.list);
    r.post('/launches', action((req, res) => {
      const id = this.launches.register(currentUser(res), req.body);
      return `Пуск №${id} зарегистрирован`;
    }, () => '/'));
    r.get('/launches/:id', this.show);
    r.post('/launches/:id/start', action((req, res) => {
      this.launches.startPreparation(currentUser(res), idParam(req));
      return 'Подготовка начата: ракета на техническом комплексе';
    }, card));
    r.post('/launches/:id/stage', action((req, res) => {
      const stage = this.launches.completeStage(currentUser(res), idParam(req));
      return `Этап «${stage.title}» завершён`;
    }, card));
    r.post('/launches/:id/postpone', action((req, res) => {
      this.launches.postpone(currentUser(res), idParam(req), req.body);
      return 'Пуск перенесён, запись внесена в журнал переносов';
    }, card));
    r.post('/launches/:id/conduct', action((req, res) => {
      this.launches.conduct(currentUser(res), idParam(req), req.body.padHours);
      return 'Пуск проведён';
    }, card));
  }

  private list = (req: Request, res: Response): void => {
    res.send(launchesPage(pageContext(req, res), {
      launches: this.launches.list(),
      vehicleTypes: this.launches.vehicleTypes(),
      pads: this.pads.list(),
    }));
  };

  private show = (req: Request, res: Response): void => {
    const id = idParam(req);
    const launch = this.launches.get(id);
    res.send(launchPage(pageContext(req, res), {
      launch,
      stages: this.launches.stages(id),
      postponements: this.launches.postponements(id),
      consumptions: this.fuel.consumptions(id),
      batches: this.fuel.list(),
      weather: this.weather.list(id),
      limits: this.weather.limitsFor(id),
      incidents: this.telemetry.incidents(id),
      channels: this.telemetry.channels(),
      today: today(),
      now: now(),
    }));
  };
}
