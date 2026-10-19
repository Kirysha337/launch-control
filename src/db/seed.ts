/**
 * Демо-данные: справочники, история пусков за год, текущие подготовки.
 * Даты строятся относительно текущего дня, поэтому демо всегда «свежее».
 * Запуск как скрипт (npm run seed) пересоздаёт базу.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Role } from '../model/entities/User';
import { AuthService } from '../model/services/AuthService';
import { UserRepository } from '../model/repositories/UserRepository';
import { formatDateTime } from '../model/time';
import { Db, openDatabase } from './database';

/** Момент: сдвиг в днях от сегодня и время. */
function at(days: number, time = '10:00'): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return formatDateTime(d);
}
const day = (days: number) => at(days).slice(0, 10);
const shift = (dateTime: string, minutes: number) => {
  const d = new Date(dateTime.replace(' ', 'T'));
  d.setMinutes(d.getMinutes() + minutes);
  return formatDateTime(d);
};

export function seedIfEmpty(db: Db, auth: AuthService): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (n > 0) return;
  db.transaction(() => seed(db, auth))();
  console.log('База заполнена демо-данными');
}

function seed(db: Db, auth: AuthService): void {
  const password = process.env.SEED_PASSWORD ?? 'start2026';
  auth.createUser('manager', password, 'Орлов В. С.', Role.Manager);
  auth.createUser('engineer', password, 'Сидоров П. Н.', Role.Engineer);
  auth.createUser('telemetry', password, 'Кузнецова Е. А.', Role.Telemetry);
  auth.createUser('meteo', password, 'Белов Д. И.', Role.Meteo);
  const [MANAGER, ENGINEER, TELEMETRY, METEO] = [1, 2, 3, 4];

  const vt = db.prepare(`INSERT INTO vehicle_types (id, name, max_wind_ground, max_wind_altitude, min_temperature, max_temperature, max_cloudiness) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  vt.run(1, 'Союз-2.1а', 15, 25, -40, 40, 10);
  vt.run(2, 'Союз-2.1б', 15, 25, -40, 40, 10);
  vt.run(3, 'Ангара-1.2', 15, 28, -40, 40, 10);
  vt.run(4, 'Ангара-А5', 12, 25, -35, 40, 8);

  const pad = db.prepare(`INSERT INTO launch_pads (id, name, max_concurrent, hours_norm, cycles_norm) VALUES (?, ?, ?, ?, ?)`);
  pad.run(1, 'Площадка №1 (Союз)', 1, 120, 5);
  pad.run(2, 'Площадка №31 (Союз)', 2, 150, 6);
  pad.run(3, 'Площадка №35 (Ангара)', 1, 100, 4);

  const maint = db.prepare(`INSERT INTO pad_maintenance (pad_id, kind, planned_date, done_at, note) VALUES (?, ?, ?, ?, ?)`);
  maint.run(3, 'repair', day(-232), at(-230, '17:00'), 'Ремонт газоотводного лотка');
  maint.run(1, 'inspection', day(-156), at(-155, '16:00'), 'Плановый осмотр после 5 пусков');
  maint.run(2, 'replacement', day(-131), at(-130, '18:30'), 'Замена агрегатов кабель-заправочной мачты');
  maint.run(1, 'inspection', day(20), null, 'Осмотр пускового устройства');
  maint.run(3, 'inspection', day(25), null, 'Осмотр перед пуском «Ангары-А5»');

  const batch = db.prepare(`INSERT INTO fuel_batches (id, batch_no, component, kind, quantity_t, received_on, expires_on) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  batch.run(1, 'КР-2026-007', 'Керосин РГ-1', 'fuel', 600, day(-280), day(-5));
  batch.run(2, 'КР-2026-019', 'Керосин РГ-1', 'fuel', 600, day(-120), day(240));
  batch.run(3, 'НФ-2026-004', 'Нафтил', 'fuel', 300, day(-60), day(300));
  batch.run(4, 'ЖК-2026-102', 'Кислород жидкий', 'oxidizer', 1500, day(-280), day(20));
  batch.run(5, 'ЖК-2026-131', 'Кислород жидкий', 'oxidizer', 1500, day(-60), day(120));

  const ch = db.prepare(`INSERT INTO telemetry_channels (id, code, system_name, parameter, frequency_hz) VALUES (?, ?, ?, ?, ?)`);
  ch.run(1, 'ТМ-01', 'Двигательная установка 1 ступени', 'Давление в камере сгорания', 100);
  ch.run(2, 'ТМ-02', 'Двигательная установка 2 ступени', 'Обороты турбонасосного агрегата', 50);
  ch.run(3, 'ТМ-03', 'Система управления', 'Угловые скорости', 200);
  ch.run(4, 'ТМ-04', 'Система управления', 'Навигационные параметры', 10);
  ch.run(5, 'ТМ-05', 'Система энергопитания', 'Напряжение бортовой сети', 10);
  ch.run(6, 'ТМ-06', 'Система разделения', 'Сигналы разделения ступеней', 50);
  ch.run(7, 'ТМ-07', 'Головной блок', 'Температура под обтекателем', 5);

  const insLaunch = db.prepare(`INSERT INTO launches (id, vehicle_type_id, pad_id, payload, target_orbit, window_start, window_end, status, launched_at, pad_hours, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insStage = db.prepare(`INSERT INTO launch_stages (launch_id, stage_no, completed_at, completed_by) VALUES (?, ?, ?, ?)`);
  const insFuel = db.prepare(`INSERT INTO fuel_consumptions (launch_id, batch_id, amount_t, recorded_at, recorded_by) VALUES (?, ?, ?, ?, ?)`);
  const insWeather = db.prepare(`INSERT INTO weather_reports (launch_id, measured_at, wind_ground, wind_altitude, temperature, cloudiness, thunderstorm, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insPost = db.prepare(`INSERT INTO postponements (launch_id, old_window_start, new_window_start, reason_category, reason, weather_report_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insIncident = db.prepare(`INSERT INTO incidents (launch_id, channel_id, occurred_at, description, measures, recorded_by) VALUES (?, ?, ?, ?, ?, ?)`);

  // --- история проведённых пусков ---
  type Hist = { id: number; type: number; pad: number; payload: string; orbit: string; day: number; time: string; hours: number;
    fuel: [number, number]; ox: [number, number] };
  const history: Hist[] = [
    { id: 1, type: 1, pad: 1, payload: 'Прогресс МС-31', orbit: 'НОО', day: -270, time: '12:20', hours: 14, fuel: [1, 75], ox: [4, 180] },
    { id: 2, type: 2, pad: 2, payload: 'Глонасс-К2 №3', orbit: 'СКО', day: -240, time: '04:15', hours: 16, fuel: [1, 78], ox: [4, 185] },
    { id: 3, type: 3, pad: 3, payload: 'Космос-2598', orbit: 'ССО', day: -200, time: '18:40', hours: 18, fuel: [1, 40], ox: [4, 105] },
    { id: 4, type: 2, pad: 2, payload: 'Метеор-М №2-4', orbit: 'ССО', day: -170, time: '08:55', hours: 15, fuel: [1, 76], ox: [4, 182] },
    { id: 5, type: 1, pad: 1, payload: 'Прогресс МС-32', orbit: 'НОО', day: -150, time: '15:05', hours: 13, fuel: [1, 74], ox: [4, 178] },
    { id: 6, type: 4, pad: 3, payload: 'Луч-5Х №1', orbit: 'ГПО', day: -110, time: '01:30', hours: 22, fuel: [1, 200], ox: [4, 540] },
    { id: 7, type: 1, pad: 1, payload: 'Прогресс МС-33', orbit: 'НОО', day: -90, time: '11:45', hours: 15, fuel: [2, 75], ox: [5, 179] },
    { id: 8, type: 2, pad: 2, payload: 'Ионосфера-М №4', orbit: 'ССО', day: -75, time: '06:10', hours: 14, fuel: [2, 77], ox: [5, 184] },
    { id: 9, type: 1, pad: 1, payload: 'Ресурс-П №6', orbit: 'ССО', day: -60, time: '13:25', hours: 16, fuel: [2, 76], ox: [5, 181] },
    { id: 10, type: 1, pad: 1, payload: 'Прогресс МС-34', orbit: 'НОО', day: -40, time: '09:50', hours: 18, fuel: [2, 74], ox: [5, 177] },
    { id: 11, type: 3, pad: 3, payload: 'Космос-2601', orbit: 'ССО', day: -20, time: '21:15', hours: 17, fuel: [3, 42], ox: [5, 107] },
    { id: 12, type: 2, pad: 2, payload: 'Глонасс-К2 №4', orbit: 'СКО', day: -8, time: '03:40', hours: 15, fuel: [2, 78], ox: [5, 186] },
  ];
  for (const h of history) {
    const start = at(h.day, h.time);
    insLaunch.run(h.id, h.type, h.pad, h.payload, h.orbit, start, shift(start, 15), 'launched', shift(start, 2), h.hours, MANAGER);
    [-10, -5, -2, -1].forEach((d, i) => insStage.run(h.id, i + 1, at(h.day + d, '17:00'), ENGINEER));
    insFuel.run(h.id, h.fuel[0], h.fuel[1], at(h.day - 1, '11:00'), ENGINEER);
    insFuel.run(h.id, h.ox[0], h.ox[1], at(h.day - 1, '12:30'), ENGINEER);
    insWeather.run(h.id, shift(start, -180), 6.5, 18, 12, 4, 0, METEO);
  }

  // переносы проведённых пусков (новое окно = фактическое окно пуска)
  const weatherPostpone = (launchId: number, oldDay: number, time: string, w: [number, number, number, number, number], reason: string) => {
    const old = at(oldDay, time);
    const measured = shift(old, -240);
    const res = insWeather.run(launchId, measured, ...w, METEO);
    const h = history.find((x) => x.id === launchId)!;
    insPost.run(launchId, old, at(h.day, h.time), 'weather', `Превышены предельные значения: ${reason}`, Number(res.lastInsertRowid), measured, METEO);
  };
  weatherPostpone(4, -171, '08:55', [9, 31, 8, 6, 0], 'ветер на высотах 31 м/с > 25');
  weatherPostpone(7, -91, '11:45', [7, 20, 24, 9, 1], 'грозовая активность');
  weatherPostpone(11, -21, '21:15', [17, 24, 3, 7, 0], 'ветер у земли 17 м/с > 15');
  insPost.run(5, at(-152, '15:05'), at(-150, '15:05'), 'technical', 'Замена датчика давления в баке окислителя второй ступени', null, at(-154, '10:00'), MANAGER);
  insPost.run(9, at(-63, '13:25'), at(-60, '13:25'), 'payload', 'Дополнительные электроиспытания полезной нагрузки на техническом комплексе', null, at(-66, '09:30'), MANAGER);

  // нештатные ситуации телеметрии
  const tm = (launchId: number, channel: number, minutes: number, description: string, measures: string) => {
    const h = history.find((x) => x.id === launchId)!;
    insIncident.run(launchId, channel, shift(at(h.day, h.time), 2 + minutes), description, measures, TELEMETRY);
  };
  tm(2, 4, 3, 'Потеря сигнала по каналу на 12 с в зоне разделения ступеней', 'Приём переведён на резервный НИП, данные дополнены из бортового запоминающего устройства');
  tm(6, 3, 5, 'Кратковременная потеря сигнала (4 с)', 'Переход на резервный приёмный пункт, данные восстановлены по бортовому накопителю');
  tm(6, 7, 9, 'Потеря сигнала по каналу на 30 с после сброса обтекателя', 'Проведена проверка тракта, сеанс продлён, параметры восстановлены по смежным каналам');
  tm(10, 5, 4, 'Потеря сигнала по каналу на 7 с', 'Запрошено повторное воспроизведение записи бортовой ТМ-системы');
  tm(12, 1, 1, 'Потеря сигнала по каналу на 2 с на участке работы 1 ступени', 'Анализ по дублирующему каналу, замечание внесено в протокол');

  // --- текущие пуски ---
  // готов к пуску: все этапы пройдены, топливо списано
  const a1 = at(2, '09:20');
  insLaunch.run(13, 2, 2, 'Метеор-М №2-5', 'ССО', a1, shift(a1, 15), 'ready', null, null, MANAGER);
  [-12, -7, -3, -1].forEach((d, i) => insStage.run(13, i + 1, at(d, '17:00'), ENGINEER));
  insFuel.run(13, 2, 77, at(-3, '11:00'), ENGINEER);
  insFuel.run(13, 5, 183, at(-3, '12:30'), ENGINEER);

  // на этапе заправки (стоит на площадке №1 с лимитом 1)
  const a2 = at(5, '14:00');
  insLaunch.run(14, 1, 1, 'Прогресс МС-35', 'НОО', a2, shift(a2, 10), 'preparing', null, null, MANAGER);
  insStage.run(14, 1, at(-6, '17:00'), ENGINEER);
  insStage.run(14, 2, at(-2, '17:00'), ENGINEER);
  insPost.run(14, at(3, '14:00'), a2, 'technical', 'Задержка поставки агрегатов наземного оборудования', null, at(-4, '09:00'), MANAGER);

  // собрана на ТК, ожидает транспортировки на ту же площадку №1
  const a3 = at(12, '11:30');
  insLaunch.run(15, 2, 1, 'Кондор-ФКА №3', 'ССО', a3, shift(a3, 20), 'preparing', null, null, MANAGER);
  insStage.run(15, 1, at(-1, '17:00'), ENGINEER);

  // запланированы
  const a4 = at(30, '03:15');
  insLaunch.run(16, 4, 3, 'Луч-5Х №2', 'ГПО', a4, shift(a4, 30), 'planned', null, null, MANAGER);
  const a5 = at(45, '05:50');
  insLaunch.run(17, 2, 2, 'Глонасс-К2 №5', 'СКО', a5, shift(a5, 15), 'planned', null, null, MANAGER);
}

if (require.main === module) {
  const file = process.env.DB_PATH ?? path.join(__dirname, '..', '..', 'data', 'launch.db');
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  const db = openDatabase(file);
  seedIfEmpty(db, new AuthService(new UserRepository(db)));
  db.close();
}
