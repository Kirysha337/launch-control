import { openDatabase } from '../src/db/database';
import { seedIfEmpty } from '../src/db/seed';
import { Role, User } from '../src/model/entities/User';
import { MeteoFailure, MeteoForecastProvider, MeteoServiceError } from '../src/model/integration/MeteoForecastProvider';
import { ForecastRepository } from '../src/model/repositories/ForecastRepository';
import { FuelRepository } from '../src/model/repositories/FuelRepository';
import { LaunchRepository } from '../src/model/repositories/LaunchRepository';
import { PadRepository } from '../src/model/repositories/PadRepository';
import { TelemetryRepository } from '../src/model/repositories/TelemetryRepository';
import { UserRepository } from '../src/model/repositories/UserRepository';
import { WeatherRepository } from '../src/model/repositories/WeatherRepository';
import { AuthService } from '../src/model/services/AuthService';
import { ForecastService } from '../src/model/services/ForecastService';
import { FuelService } from '../src/model/services/FuelService';
import { LaunchService } from '../src/model/services/LaunchService';
import { ReportService } from '../src/model/services/ReportService';
import { TelemetryService } from '../src/model/services/TelemetryService';
import { WeatherService } from '../src/model/services/WeatherService';

/** Пользователи демо-данных (id совпадают с seed). */
export const U = {
  manager: new User(1, 'manager', 'Орлов В. С.', Role.Manager),
  engineer: new User(2, 'engineer', 'Сидоров П. Н.', Role.Engineer),
  telemetry: new User(3, 'telemetry', 'Кузнецова Е. А.', Role.Telemetry),
  meteo: new User(4, 'meteo', 'Белов Д. И.', Role.Meteo),
};

/** Ответ метеослужбы в пределах (ветер на высотах 19 м/с). */
export const CALM = {
  levels: [
    { altitudeM: 0, windMs: 6, temperatureC: 3 },
    { altitudeM: 1000, windMs: 10, temperatureC: -2 },
    { altitudeM: 10000, windMs: 19, temperatureC: -50 },
  ],
  cloudiness: 4,
  thunderstorm: false,
};

/** Ответ метеослужбы с превышением (ветер на высотах 31 м/с и гроза). */
export const STORM = { ...CALM, levels: [...CALM.levels.slice(0, 2), { altitudeM: 10000, windMs: 31, temperatureC: -50 }], thunderstorm: true };

/** Провайдер-заглушка: возвращает заданный ответ и считает обращения. */
export function stubProvider(body: unknown): MeteoForecastProvider & { calls: number } {
  return { calls: 0, async fetchForecast() { this.calls++; return body; } };
}

export function failingProvider(failure: MeteoFailure, message: string): MeteoForecastProvider {
  return { async fetchForecast() { throw new MeteoServiceError(failure, message); } };
}

/** Система с демо-данными в памяти — те же сервисы, что собираются в app.ts. */
export function setup(provider: MeteoForecastProvider = stubProvider(CALM)) {
  const db = openDatabase(':memory:');
  const log = console.log; console.log = () => {};
  seedIfEmpty(db, new AuthService(new UserRepository(db)));
  console.log = log;
  const launchRepo = new LaunchRepository(db);
  const padRepo = new PadRepository(db);
  const weatherRepo = new WeatherRepository(db);
  return {
    db,
    launchRepo,
    launches: new LaunchService(db, launchRepo, padRepo, weatherRepo),
    fuel: new FuelService(db, new FuelRepository(db), launchRepo),
    weather: new WeatherService(db, weatherRepo, launchRepo),
    telemetry: new TelemetryService(new TelemetryRepository(db), launchRepo),
    reports: new ReportService(db),
    forecasts: new ForecastService(new ForecastRepository(db), launchRepo, provider),
  };
}
