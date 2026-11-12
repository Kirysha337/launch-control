import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DomainError } from '../src/model/errors';
import { FuelBatch, FuelKind } from '../src/model/entities/FuelBatch';
import { Launch, LaunchStatus } from '../src/model/entities/Launch';
import { StageContext, STAGES } from '../src/model/entities/PreparationStage';
import { WeatherAssessment, WeatherReport } from '../src/model/entities/Weather';
import { ForecastAttempt, ForecastHistory, WeatherForecast } from '../src/model/entities/WeatherForecast';
import { MeteoServiceError } from '../src/model/integration/MeteoForecastProvider';
import { CALM } from './helpers';

const NOW = '2026-11-12 10:00';
const LIMITS = { maxWindGround: 15, maxWindAltitude: 25, minTemperature: -40, maxTemperature: 40, maxCloudiness: 10 };
const ctx = (over: Partial<StageContext> = {}): StageContext => ({
  padName: 'Площадка №1', padOccupied: 0, padLimit: 1, padMaintenanceRequired: false,
  fuelKindsConsumed: [FuelKind.Fuel, FuelKind.Oxidizer], ...over,
});
const newLaunch = () => Launch.register({
  vehicleTypeId: '1', padId: '1', payload: 'Тест', targetOrbit: 'НОО', windowStart: '2026-12-01T10:00', windowEnd: '2026-12-01T10:15',
}, NOW);

describe('лаба №3: доменная модель', () => {
  test('пуск: окно в прошлом и длиннее 12 ч отклоняются', () => {
    const base = { vehicleTypeId: '1', padId: '1', payload: 'X', targetOrbit: 'НОО' };
    assert.throws(() => Launch.register({ ...base, windowStart: '2026-01-01T10:00', windowEnd: '2026-01-01T10:15' }, NOW), DomainError);
    assert.throws(() => Launch.register({ ...base, windowStart: '2026-12-01T00:00', windowEnd: '2026-12-01T13:00' }, NOW), DomainError);
  });

  test('пуск: этапы проходятся по порядку, после четвёртого — «Готов к пуску»', () => {
    const l = newLaunch();
    assert.throws(() => l.completeStage(ctx()), DomainError);
    l.startPreparation();
    for (const s of STAGES) assert.equal(l.completeStage(ctx()).no, s.no);
    assert.equal(l.status, LaunchStatus.Ready);
    assert.throws(() => l.startPreparation(), DomainError);
  });

  test('транспортировка: занятая площадка и выработанный норматив блокируют этап', () => {
    assert.throws(() => STAGES[1].checkCompletion(ctx({ padOccupied: 1 })), /занята/);
    assert.throws(() => STAGES[1].checkCompletion(ctx({ padMaintenanceRequired: true })), /норматив/);
    assert.doesNotThrow(() => STAGES[1].checkCompletion(ctx()));
  });

  test('заправка: без окислителя этап не завершается', () => {
    assert.throws(() => STAGES[2].checkCompletion(ctx({ fuelKindsConsumed: [FuelKind.Fuel] })), /окислителя/);
  });

  test('партия топлива: просроченную и сверх остатка списать нельзя', () => {
    const b = FuelBatch.restore({ id: 1, batch_no: 'КР-1', component: 'Керосин', kind: FuelKind.Fuel, quantity_t: 100,
      received_on: '2026-01-01', expires_on: '2026-11-01', consumed: 90 });
    assert.throws(() => b.consume('5', '2026-11-12'), /просрочена/);
    assert.throws(() => b.consume('20', '2026-10-01'), /осталось 10/);
    assert.equal(b.consume('5', '2026-10-01'), 5);
  });

  test('метеоусловия: гроза и ветер на высотах дают два нарушения', () => {
    const r = WeatherReport.create({ measuredAt: NOW, windGround: '5', windAltitude: '30', temperature: '0', cloudiness: '3', thunderstorm: 'on' }, NOW);
    assert.deepEqual(WeatherAssessment.violations(r, LIMITS), ['ветер на высотах 30 м/с > 25', 'грозовая активность']);
  });
});

describe('лаба №4: прогноз метеослужбы', () => {
  test('профиль по высотам сводится: ветер у земли — наземный уровень, на высотах — максимум от 1 км', () => {
    const f = WeatherForecast.fromApi(CALM);
    assert.equal(f.source, 'api');
    assert.equal(f.windGround, 6);
    assert.equal(f.windAltitude, 19);
    assert.equal(f.temperature, 3);
    assert.deepEqual(WeatherAssessment.violations(f, LIMITS), []);
  });

  test('ответ не по формату — MeteoServiceError(format)', () => {
    for (const body of [null, { wind: 'сильный' }, { ...CALM, cloudiness: 11 }, { ...CALM, levels: [{ altitudeM: 5000, windMs: 1, temperatureC: 0 }, { altitudeM: 9000, windMs: 1, temperatureC: 0 }] }]) {
      assert.throws(() => WeatherForecast.fromApi(body), (e: unknown) => e instanceof MeteoServiceError && e.failure === 'format');
    }
  });

  test('ручной ввод: основание обязательно, значения проверяются', () => {
    const input = { windGround: '5', windAltitude: '20', temperature: '1', cloudiness: '2', thunderstorm: '', basis: 'радиозонд 06:00' };
    assert.equal(WeatherForecast.manual(input).source, 'manual');
    assert.throws(() => WeatherForecast.manual({ ...input, basis: 'ok' }), DomainError);
    assert.throws(() => WeatherForecast.manual({ ...input, windAltitude: '-1' }), DomainError);
  });

  test('история: ручной ввод только после неудачи, запрос — за 24 ч, повтор — через 15 минут', () => {
    const window = '2026-11-13 08:00';
    const failed: ForecastAttempt = { id: 1, windowStart: window, requestedAt: '2026-11-12 10:00', source: 'api', forecast: null, note: 'таймаут', user: null };
    assert.equal(new ForecastHistory([], window).manualAllowed, false);
    assert.equal(new ForecastHistory([failed], window).manualAllowed, true);
    assert.equal(new ForecastHistory([], window).isDue('2026-11-12 07:00'), false); // до окна 25 ч
    assert.equal(new ForecastHistory([], window).isDue('2026-11-12 09:00'), true);
    assert.equal(new ForecastHistory([failed], window).isDue('2026-11-12 10:10'), false);
    assert.equal(new ForecastHistory([failed], window).isDue('2026-11-12 10:15'), true);
    // попытки для прежнего окна (до переноса) не учитываются
    assert.equal(new ForecastHistory([failed], '2026-11-14 08:00').manualAllowed, false);
  });
});
