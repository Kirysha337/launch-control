import type { Request, Router } from 'express';
import { ForecastResult, ForecastService } from '../model/services/ForecastService';
import { Flash } from '../view/layout';
import { action, currentUser, idParam } from './common';

/** Лаба №4: запрос прогноза у внешней метеослужбы и ручной ввод при её недоступности. */
export class ForecastController {
  constructor(private readonly forecasts: ForecastService) {}

  routes(r: Router): void {
    const card = (req: Request) => `/launches/${req.params.id}`;
    r.post('/launches/:id/forecast', action(async (req, res) => {
      return ForecastController.message(await this.forecasts.request(currentUser(res), idParam(req)));
    }, card));
    r.post('/launches/:id/forecast/manual', action((req, res) => {
      return ForecastController.message(this.forecasts.manual(currentUser(res), idParam(req), req.body));
    }, card));
  }

  private static message(result: ForecastResult): string | Flash {
    if (result.outcome === 'unavailable') {
      return { type: 'warn', text: `Метеослужба недоступна: ${result.reason}. Метеоролог может ввести прогноз вручную` };
    }
    return result.violations.length
      ? { type: 'warn', text: `Прогноз получен. Предупреждение о возможном переносе: ${result.violations.join('; ')}` }
      : 'Прогноз получен: метеоусловия в пределах для типа носителя';
  }
}
