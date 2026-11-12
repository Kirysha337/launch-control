import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { AccessDeniedError, DomainError } from '../src/model/errors';
import { LaunchStatus } from '../src/model/entities/Launch';
import { HttpMeteoForecastProvider } from '../src/model/integration/HttpMeteoForecastProvider';
import { ForecastScheduler } from '../src/model/services/ForecastScheduler';
import { addHours, now, today } from '../src/model/time';
import { CALM, failingProvider, setup, STORM, stubProvider, U } from './helpers';

// Демо-данные: пуск 13 готов к пуску (окно через 20 ч), 14 — на заправке (площадка №1),
// 15 — собран и ждёт транспортировки на ту же площадку №1.
const READY = 13;
const manual = { windGround: '5', windAltitude: '20', temperature: '1', cloudiness: '2', thunderstorm: '', basis: 'радиозондирование 06:00' };

describe('лаба №3: сценарии работают как прежде', () => {
  test('регистрация пуска: руководитель может, инженер — нет', () => {
    const s = setup();
    const input = { vehicleTypeId: '2', padId: '2', payload: 'Метеор-М №2-6', targetOrbit: 'ССО',
      windowStart: addHours(now(), 72), windowEnd: addHours(now(), 72.25) };
    const id = s.launches.register(U.manager, input);
    assert.equal(s.launches.get(id).status, LaunchStatus.Planned);
    assert.throws(() => s.launches.register(U.engineer, input), AccessDeniedError);
  });

  test('транспортировка на занятую площадку отклоняется', () => {
    const s = setup();
    assert.throws(() => s.launches.completeStage(U.engineer, 15), /занята/);
    assert.equal(s.launches.get(15).completedStages, 1);
  });

  test('фактическая сводка с превышением переносит пуск на сутки', () => {
    const s = setup();
    const before = s.launches.get(READY).windowStart;
    const r = s.weather.record(U.meteo, READY, { measuredAt: now(), windGround: '9', windAltitude: '32', temperature: '6', cloudiness: '7', thunderstorm: '' });
    assert.deepEqual(r.violations, ['ветер на высотах 32 м/с > 25']);
    assert.equal(s.launches.get(READY).windowStart, addHours(before, 24));
    assert.equal(s.launches.postponements(READY)[0].reason_category, 'weather');
  });

  test('проведение пуска, нештатная ситуация и отчёты', () => {
    const s = setup();
    s.weather.record(U.meteo, READY, { measuredAt: now(), windGround: '5', windAltitude: '16', temperature: '4', cloudiness: '5', thunderstorm: '' });
    s.launches.conduct(U.manager, READY, '14');
    assert.equal(s.launches.get(READY).status, LaunchStatus.Launched);
    s.telemetry.registerIncident(U.telemetry, READY, { channelId: '4', occurredAt: now(), description: 'Потеря сигнала', measures: 'Резервный НИП' });
    const year = today().slice(0, 4);
    const { tables } = s.reports.build(U.manager, `${year}-01-01`, `${year}-12-31`);
    assert.equal(tables.length, 5);
    assert.ok(tables[3].rows.some((r) => r[0] === 'ТМ-04'));
  });
});

describe('лаба №4: прогноз внешней метеослужбы', () => {
  test('прогноз в пределах сохраняется, предупреждения нет, окно не меняется', async () => {
    const s = setup(stubProvider(CALM));
    const before = s.launches.get(READY).windowStart;
    const r = await s.forecasts.request(U.meteo, READY);
    assert.equal(r.outcome, 'received');
    assert.deepEqual(r.violations, []);
    assert.deepEqual(s.forecasts.warning(READY), []);
    assert.equal(s.launches.get(READY).windowStart, before);
  });

  test('прогноз с превышением даёт предупреждение, но не переносит пуск', async () => {
    const s = setup(stubProvider(STORM));
    const before = s.launches.get(READY).windowStart;
    const r = await s.forecasts.request(U.manager, READY);
    assert.deepEqual(r.violations, ['ветер на высотах 31 м/с > 25', 'грозовая активность']);
    assert.deepEqual(s.forecasts.warning(READY), r.violations);
    assert.equal(s.launches.get(READY).windowStart, before);
    assert.equal(s.launches.postponements(READY).length, 0);
  });

  test('служба недоступна: попытка фиксируется с причиной, затем ручной ввод метеоролога', async () => {
    const s = setup(failingProvider('http', 'метеослужба ответила ошибкой 503'));
    const r = await s.forecasts.request(null, READY);
    assert.equal(r.outcome, 'unavailable');
    const h = s.forecasts.history(READY);
    assert.equal(h.attempts[0].note, 'метеослужба ответила ошибкой 503');
    assert.equal(h.attempts[0].user, null); // запрос системы
    assert.equal(h.manualAllowed, true);
    const m = s.forecasts.manual(U.meteo, READY, { ...manual, windAltitude: '28' });
    assert.deepEqual(m.violations, ['ветер на высотах 28 м/с > 25']); // тот же критерий, что для API
    assert.equal(s.forecasts.history(READY).latestForecast?.source, 'manual');
  });

  test('ручной ввод без неудачного запроса запрещён; оператор телеметрии прогноз не запрашивает', async () => {
    const s = setup(stubProvider(CALM));
    assert.throws(() => s.forecasts.manual(U.meteo, READY, manual), DomainError);
    await s.forecasts.request(U.meteo, READY);
    assert.throws(() => s.forecasts.manual(U.meteo, READY, manual), /только после неудачного запроса/);
    await assert.rejects(s.forecasts.request(U.telemetry, READY), AccessDeniedError);
  });

  test('планировщик запрашивает прогноз по пуску с окном в ближайшие 24 ч и не повторяет его', async () => {
    const provider = stubProvider(CALM);
    const s = setup(provider);
    const scheduler = new ForecastScheduler(s.forecasts);
    assert.equal(await scheduler.tick(), 1); // только пуск 13: окно через 20 ч
    assert.equal(provider.calls, 1);
    assert.equal(await scheduler.tick(), 0);
  });
});

describe('лаба №4: HTTP-обращение к метеослужбе (таймаут и ошибки)', () => {
  let server: http.Server;
  let base = '';
  let mode: 'ok' | 'slow' | 'down' | 'garbage' = 'ok';
  before(async () => {
    server = http.createServer((req, res) => {
      const send = (status: number, body: string) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body); };
      assert.ok(req.url?.startsWith('/forecast?pad='));
      if (mode === 'slow') return void setTimeout(() => send(200, JSON.stringify(CALM)), 600);
      if (mode === 'down') return send(503, '{}');
      if (mode === 'garbage') return send(200, 'не json');
      send(200, JSON.stringify(CALM));
    });
    await new Promise<void>((ok) => server.listen(0, ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => { server.closeAllConnections(); server.close(); });

  const req = { launchId: READY, vehicleType: 'Союз-2.1б', pad: 'Площадка №31', windowStart: '2026-11-13 08:00' };

  test('ответ в срок разбирается в прогноз', async () => {
    mode = 'ok';
    const s = setup(new HttpMeteoForecastProvider(base, 300));
    assert.equal((await s.forecasts.request(U.meteo, READY)).outcome, 'received');
  });

  test('ответ дольше таймаута — «нет ответа за … с», переход к ручному вводу', async () => {
    mode = 'slow';
    const s = setup(new HttpMeteoForecastProvider(base, 200));
    const started = Date.now();
    const r = await s.forecasts.request(U.meteo, READY);
    assert.ok(Date.now() - started < 550, 'запрос прерван по таймауту, а не дождался ответа 600 мс');
    assert.equal(r.outcome, 'unavailable');
    assert.match(r.reason, /нет ответа метеослужбы за 0.2 с/);
    assert.equal(s.forecasts.history(READY).manualAllowed, true);
  });

  test('HTTP 503, не-JSON и закрытый порт обрабатываются как недоступность службы', async () => {
    mode = 'down';
    await assert.rejects(new HttpMeteoForecastProvider(base, 300).fetchForecast(req), (e: any) => e.failure === 'http');
    mode = 'garbage';
    await assert.rejects(new HttpMeteoForecastProvider(base, 300).fetchForecast(req), (e: any) => e.failure === 'format');
    await assert.rejects(new HttpMeteoForecastProvider('http://127.0.0.1:9', 300).fetchForecast(req), (e: any) => e.failure === 'network');
  });
});
