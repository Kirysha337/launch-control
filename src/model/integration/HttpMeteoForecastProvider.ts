import { ForecastRequest, MeteoForecastProvider, MeteoServiceError } from './MeteoForecastProvider';

/** Время ожидания ответа службы по умолчанию, мс. */
export const DEFAULT_METEO_TIMEOUT_MS = 10_000;

/**
 * Обращение к внешней метеослужбе по HTTP: GET {baseUrl}/forecast?pad=…&at=…
 * Таймаут реализован через AbortController и действует на весь запрос, включая чтение тела.
 */
export class HttpMeteoForecastProvider implements MeteoForecastProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = DEFAULT_METEO_TIMEOUT_MS,
  ) {}

  async fetchForecast(request: ForecastRequest): Promise<unknown> {
    const url = new URL('/forecast', this.baseUrl);
    url.searchParams.set('pad', request.pad);
    url.searchParams.set('vehicle', request.vehicleType);
    url.searchParams.set('at', request.windowStart.replace(' ', 'T'));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const timeoutError = () => new MeteoServiceError('timeout', `нет ответа метеослужбы за ${this.timeoutMs / 1000} с`);
    try {
      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
      } catch {
        throw controller.signal.aborted ? timeoutError() : new MeteoServiceError('network', 'метеослужба недоступна (нет соединения)');
      }
      if (!response.ok) throw new MeteoServiceError('http', `метеослужба ответила ошибкой ${response.status}`);
      try {
        return await response.json();
      } catch {
        throw controller.signal.aborted ? timeoutError() : new MeteoServiceError('format', 'неверный формат ответа метеослужбы: не JSON');
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
