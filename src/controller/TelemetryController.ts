import type { Request, Router } from 'express';
import { TelemetryService } from '../model/services/TelemetryService';
import { telemetryPage } from '../view/pages/telemetry';
import { action, currentUser, idParam, pageContext } from './common';

/** Каналы телеметрии и журнал нештатных ситуаций. */
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  routes(r: Router): void {
    r.get('/telemetry', (req, res) => {
      res.send(telemetryPage(pageContext(req, res), {
        channels: this.telemetry.channels(),
        incidents: this.telemetry.incidents(),
      }));
    });
    r.post('/launches/:id/incidents', action((req, res) => {
      this.telemetry.registerIncident(currentUser(res), idParam(req), req.body);
      return 'Нештатная ситуация зарегистрирована';
    }, (req: Request) => `/launches/${req.params.id}`));
  }
}
