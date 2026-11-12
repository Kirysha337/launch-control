/** Данные пуска, по которым запрашивается прогноз. */
export interface ForecastRequest {
  launchId: number;
  vehicleType: string;
  pad: string;
  /** Начало стартового окна, «ГГГГ-ММ-ДД ЧЧ:ММ». */
  windowStart: string;
}

/**
 * Внешняя метеорологическая служба космодрома. Модель зависит только от этого
 * интерфейса, поэтому HTTP-реализацию можно заменить заглушкой в тестах.
 */
export interface MeteoForecastProvider {
  /** Возвращает тело ответа службы (разбирает его WeatherForecast.fromApi). */
  fetchForecast(request: ForecastRequest): Promise<unknown>;
}

/** Причина, по которой прогноз от службы не получен. */
export type MeteoFailure = 'timeout' | 'network' | 'http' | 'format';

/** Служба недоступна или ответила не по формату — система переходит к ручному вводу. */
export class MeteoServiceError extends Error {
  constructor(readonly failure: MeteoFailure, message: string) {
    super(message);
    this.name = 'MeteoServiceError';
  }
}
