import type { Request, Router } from 'express';
import { WeatherService } from '../model/services/WeatherService';
import { fmtDateTime } from '../view/html';
import { action, currentUser, idParam } from './common';

/** Приём метеосводки по пуску. */
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  routes(r: Router): void {
    r.post('/launches/:id/weather', action((req, res) => {
      const result = this.weather.record(currentUser(res), idParam(req), req.body);
      return result.postponedTo
        ? { type: 'warn', text: `Превышены предельные значения (${result.violations.join('; ')}). Пуск перенесён на ${fmtDateTime(result.postponedTo)}` }
        : 'Сводка внесена: метеоусловия допустимы';
    }, (req: Request) => `/launches/${req.params.id}`));
  }
}
