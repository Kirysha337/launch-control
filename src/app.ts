import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import { AuthController } from './controller/AuthController';
import { errorHandler, pageContext } from './controller/common';
import { FuelController } from './controller/FuelController';
import { LaunchController } from './controller/LaunchController';
import { PadController } from './controller/PadController';
import { ReportController } from './controller/ReportController';
import { TelemetryController } from './controller/TelemetryController';
import { WeatherController } from './controller/WeatherController';
import { openDatabase } from './db/database';
import { seedIfEmpty } from './db/seed';
import { FuelRepository } from './model/repositories/FuelRepository';
import { LaunchRepository } from './model/repositories/LaunchRepository';
import { PadRepository } from './model/repositories/PadRepository';
import { TelemetryRepository } from './model/repositories/TelemetryRepository';
import { UserRepository } from './model/repositories/UserRepository';
import { WeatherRepository } from './model/repositories/WeatherRepository';
import { AuthService } from './model/services/AuthService';
import { FuelService } from './model/services/FuelService';
import { LaunchService } from './model/services/LaunchService';
import { PadService } from './model/services/PadService';
import { ReportService } from './model/services/ReportService';
import { TelemetryService } from './model/services/TelemetryService';
import { WeatherService } from './model/services/WeatherService';
import { errorPage } from './view/pages/error';

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

// --- Model: хранилище, репозитории, сервисы ---
const db = openDatabase();
const users = new UserRepository(db);
const launchRepo = new LaunchRepository(db);
const padRepo = new PadRepository(db);
const fuelRepo = new FuelRepository(db);
const weatherRepo = new WeatherRepository(db);
const telemetryRepo = new TelemetryRepository(db);

const auth = new AuthService(users);
const launches = new LaunchService(db, launchRepo, padRepo, weatherRepo);
const fuel = new FuelService(db, fuelRepo, launchRepo);
const weather = new WeatherService(db, weatherRepo, launchRepo);
const telemetry = new TelemetryService(telemetryRepo, launchRepo);
const pads = new PadService(padRepo);
const reports = new ReportService(db);

if (!isProduction) seedIfEmpty(db, auth);

// --- Controller: маршруты ---
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());

const authController = new AuthController(auth, !isProduction);
app.use(authController.loadUser);
const router = express.Router();
authController.routes(router);
router.use(authController.requireAuth);
new LaunchController(launches, fuel, weather, telemetry, pads).routes(router);
new FuelController(fuel).routes(router);
new WeatherController(weather).routes(router);
new TelemetryController(telemetry).routes(router);
new PadController(pads).routes(router);
new ReportController(reports).routes(router);
app.use(router);

app.use((req, res) => { res.status(404).send(errorPage(pageContext(req, res), 404, 'Страница не найдена')); });
app.use(errorHandler);

app.listen(PORT, () => console.log(`ЦУП «Старт» запущен: http://localhost:${PORT}`));
