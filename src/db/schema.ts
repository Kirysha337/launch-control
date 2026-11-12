/**
 * Схема базы данных SQLite (соответствует модели IDEF1X из docs/diagrams/idef1x).
 * Производные величины (остаток партии топлива, наработка площадки, текущий этап
 * подготовки) не хранятся, а вычисляются запросами.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  login         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  full_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('manager','engineer','telemetry','meteo'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_types (
  id                INTEGER PRIMARY KEY,
  name              TEXT    NOT NULL UNIQUE,
  max_wind_ground   REAL    NOT NULL,
  max_wind_altitude REAL    NOT NULL,
  min_temperature   REAL    NOT NULL,
  max_temperature   REAL    NOT NULL,
  max_cloudiness    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_pads (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL UNIQUE,
  max_concurrent INTEGER NOT NULL CHECK (max_concurrent > 0),
  hours_norm     REAL    NOT NULL CHECK (hours_norm > 0),
  cycles_norm    INTEGER NOT NULL CHECK (cycles_norm > 0)
);

CREATE TABLE IF NOT EXISTS pad_maintenance (
  id           INTEGER PRIMARY KEY,
  pad_id       INTEGER NOT NULL REFERENCES launch_pads(id),
  kind         TEXT    NOT NULL CHECK (kind IN ('inspection','repair','replacement')),
  planned_date TEXT    NOT NULL,
  done_at      TEXT,
  note         TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS launches (
  id              INTEGER PRIMARY KEY,
  vehicle_type_id INTEGER NOT NULL REFERENCES vehicle_types(id),
  pad_id          INTEGER NOT NULL REFERENCES launch_pads(id),
  payload         TEXT    NOT NULL,
  target_orbit    TEXT    NOT NULL,
  window_start    TEXT    NOT NULL,
  window_end      TEXT    NOT NULL,
  status          TEXT    NOT NULL CHECK (status IN ('planned','preparing','ready','launched')),
  launched_at     TEXT,
  pad_hours       REAL,
  created_by      INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS launch_stages (
  launch_id    INTEGER NOT NULL REFERENCES launches(id),
  stage_no     INTEGER NOT NULL CHECK (stage_no BETWEEN 1 AND 4),
  completed_at TEXT    NOT NULL,
  completed_by INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (launch_id, stage_no)
);

CREATE TABLE IF NOT EXISTS fuel_batches (
  id          INTEGER PRIMARY KEY,
  batch_no    TEXT    NOT NULL UNIQUE,
  component   TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('fuel','oxidizer')),
  quantity_t  REAL    NOT NULL CHECK (quantity_t > 0),
  received_on TEXT    NOT NULL,
  expires_on  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS fuel_consumptions (
  id          INTEGER PRIMARY KEY,
  launch_id   INTEGER NOT NULL REFERENCES launches(id),
  batch_id    INTEGER NOT NULL REFERENCES fuel_batches(id),
  amount_t    REAL    NOT NULL CHECK (amount_t > 0),
  recorded_at TEXT    NOT NULL,
  recorded_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS telemetry_channels (
  id           INTEGER PRIMARY KEY,
  code         TEXT    NOT NULL UNIQUE,
  system_name  TEXT    NOT NULL,
  parameter    TEXT    NOT NULL,
  frequency_hz REAL    NOT NULL CHECK (frequency_hz > 0)
);

CREATE TABLE IF NOT EXISTS incidents (
  id          INTEGER PRIMARY KEY,
  launch_id   INTEGER NOT NULL REFERENCES launches(id),
  channel_id  INTEGER NOT NULL REFERENCES telemetry_channels(id),
  occurred_at TEXT    NOT NULL,
  description TEXT    NOT NULL,
  measures    TEXT    NOT NULL,
  recorded_by INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS weather_reports (
  id            INTEGER PRIMARY KEY,
  launch_id     INTEGER NOT NULL REFERENCES launches(id),
  measured_at   TEXT    NOT NULL,
  wind_ground   REAL    NOT NULL,
  wind_altitude REAL    NOT NULL,
  temperature   REAL    NOT NULL,
  cloudiness    INTEGER NOT NULL,
  thunderstorm  INTEGER NOT NULL CHECK (thunderstorm IN (0,1)),
  recorded_by   INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS postponements (
  id                INTEGER PRIMARY KEY,
  launch_id         INTEGER NOT NULL REFERENCES launches(id),
  old_window_start  TEXT    NOT NULL,
  new_window_start  TEXT    NOT NULL,
  reason_category   TEXT    NOT NULL CHECK (reason_category IN ('weather','technical','payload','other')),
  reason            TEXT    NOT NULL,
  weather_report_id INTEGER REFERENCES weather_reports(id),
  created_at        TEXT    NOT NULL,
  created_by        INTEGER NOT NULL REFERENCES users(id)
);

-- Лаба №4: прогнозы внешней метеослужбы и ручной ввод при её недоступности.
-- Попытка без прогноза (служба не ответила) хранится с пустыми показателями и причиной в note.
CREATE TABLE IF NOT EXISTS weather_forecasts (
  id            INTEGER PRIMARY KEY,
  launch_id     INTEGER NOT NULL REFERENCES launches(id),
  window_start  TEXT    NOT NULL,
  requested_at  TEXT    NOT NULL,
  source        TEXT    NOT NULL CHECK (source IN ('api','manual')),
  wind_ground   REAL,
  wind_altitude REAL,
  temperature   REAL,
  cloudiness    INTEGER,
  thunderstorm  INTEGER CHECK (thunderstorm IN (0,1)),
  note          TEXT    NOT NULL DEFAULT '',
  recorded_by   INTEGER REFERENCES users(id),
  CHECK (source = 'api' OR wind_ground IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_weather_forecasts_launch ON weather_forecasts(launch_id, window_start);
`;
