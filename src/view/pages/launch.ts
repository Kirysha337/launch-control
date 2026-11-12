import { FuelBatch } from '../../model/entities/FuelBatch';
import { Launch, LaunchStatus, ORBIT_TITLES } from '../../model/entities/Launch';
import { POSTPONE_REASON_TITLES, POSTPONE_REASONS } from '../../model/entities/Postponement';
import { FuelingStage, STAGES } from '../../model/entities/PreparationStage';
import { Role } from '../../model/entities/User';
import { WeatherLimits } from '../../model/entities/Weather';
import { FORECAST_LEAD_HOURS, FORECAST_SOURCE_TITLES, ForecastAttempt } from '../../model/entities/WeatherForecast';
import { ConsumptionRow } from '../../model/repositories/FuelRepository';
import { PostponementRow, StageRow } from '../../model/repositories/LaunchRepository';
import { ChannelRow, IncidentRow } from '../../model/repositories/TelemetryRepository';
import { WeatherRow } from '../../model/repositories/WeatherRepository';
import { fmtDate, fmtDateTime, fmtNum, html, toInputDateTime } from '../html';
import { chip, layout, PageContext } from '../layout';
import { statusChip } from './launches';

export interface LaunchPageData {
  launch: Launch;
  stages: StageRow[];
  consumptions: ConsumptionRow[];
  batches: FuelBatch[];
  weather: (WeatherRow & { violations: string[] })[];
  limits: WeatherLimits;
  postponements: PostponementRow[];
  incidents: IncidentRow[];
  channels: ChannelRow[];
  /** Лаба №4: попытки получить прогноз для текущего окна (с готовым списком нарушений). */
  forecasts: (ForecastAttempt & { violations: string[] })[];
  forecastWarning: string[];
  manualForecastAllowed: boolean;
  today: string;
  now: string;
}

export function launchPage(ctx: PageContext, d: LaunchPageData): string {
  const l = d.launch;
  const user = ctx.user!;
  const launched = l.status === LaunchStatus.Launched;
  const stageDone = new Map(d.stages.map((s) => [s.stage_no, s]));
  const current = l.currentStage;

  const stepper = html`
    <ol class="stepper">
      ${STAGES.map((s) => {
        const done = stageDone.get(s.no);
        const state = done ? 'done' : current?.no === s.no ? 'current' : 'todo';
        return html`<li class="step step--${state}">
          <span class="step__num">${done ? '✓' : s.no}</span>
          <div><b>${s.title}</b><small>${s.place}</small>
            ${done ? html`<small class="ok">Завершён ${fmtDateTime(done.completed_at)} · ${done.user}</small>`
              : state === 'current' ? html`<small class="cur">Текущий этап</small>` : ''}
          </div></li>`;
      })}
      <li class="step step--${launched ? 'done' : 'todo'}">
        <span class="step__num">${launched ? '✓' : '🚀'}</span>
        <div><b>Пуск</b><small>${launched ? `Старт ${fmtDateTime(l.launchedAt)}` : 'После готовности и допуска по погоде'}</small></div>
      </li>
    </ol>`;

  const engineerActions = user.can(Role.Engineer) && (l.status === LaunchStatus.Planned || current) ? html`
    <section class="card card--accent">
      <h2>Подготовка</h2>
      ${l.status === LaunchStatus.Planned ? html`
        <p class="muted">Ракета ещё не поступила на технический комплекс.</p>
        <form method="post" action="/launches/${l.id}/start"><button class="btn btn--primary">Начать подготовку</button></form>` : ''}
      ${current ? html`
        <p class="muted">Текущий этап: <b>${current.title}</b> (${current.place})</p>
        <form method="post" action="/launches/${l.id}/stage"><button class="btn btn--primary">Завершить этап</button></form>` : ''}
    </section>` : '';

  const managerActions = user.can(Role.Manager) && !launched ? html`
    ${l.status === LaunchStatus.Ready ? html`
    <section class="card card--accent">
      <h2>Проведение пуска</h2>
      <p class="muted">Пуск допускается при готовности всех систем и допустимых метеоусловиях по последней сводке.</p>
      <form method="post" action="/launches/${l.id}/conduct" class="form">
        <label>Наработка агрегатов площадки за пуск, ч <input name="padHours" type="number" step="0.5" min="0.5" max="72" value="12" required></label>
        <button class="btn btn--danger">Провести пуск</button>
      </form>
    </section>` : ''}
    <section class="card">
      <h2>Перенос пуска</h2>
      <form method="post" action="/launches/${l.id}/postpone" class="form">
        <div class="row2">
          <label>Новое начало <input type="datetime-local" name="windowStart" required value="${toInputDateTime(l.windowStart)}"></label>
          <label>Новый конец <input type="datetime-local" name="windowEnd" required value="${toInputDateTime(l.windowEnd)}"></label>
        </div>
        <label>Причина
          <select name="category">${POSTPONE_REASONS.filter((r) => r !== 'weather').map((r) => html`<option value="${r}">${POSTPONE_REASON_TITLES[r]}</option>`)}</select></label>
        <label>Описание причины <input name="reason" required maxlength="300" placeholder="Например, замена датчика давления"></label>
        <button class="btn">Перенести</button>
      </form>
    </section>` : '';

  const fuelCard = html`
    <section class="card">
      <h2>Расход топлива</h2>
      <table class="table">
        <thead><tr><th>Партия</th><th>Компонент</th><th class="num">Расход, т</th><th>Время</th><th>Внёс</th></tr></thead>
        <tbody>
          ${d.consumptions.map((c) => html`<tr><td class="mono">${c.batch_no}</td><td>${c.component}</td>
            <td class="num">${fmtNum(c.amount_t)}</td><td>${fmtDateTime(c.recorded_at)}</td><td>${c.user}</td></tr>`)}
          ${d.consumptions.length ? '' : html`<tr><td colspan="5" class="empty">Расход ещё не фиксировался</td></tr>`}
        </tbody>
      </table>
      ${user.can(Role.Engineer) && current instanceof FuelingStage ? html`
      <form method="post" action="/launches/${l.id}/fuel" class="form form--inline">
        <label>Партия
          <select name="batchId">${d.batches.map((b) => html`<option value="${b.id}">
            ${b.batchNo} · ${b.component} · остаток ${fmtNum(b.remaining)} т${b.isExpired(d.today) ? ' · просрочена' : ''}</option>`)}</select></label>
        <label>Расход, т <input name="amount" type="number" step="0.1" min="0.1" required></label>
        <button class="btn btn--primary">Списать</button>
      </form>` : ''}
    </section>`;

  const weatherCard = html`
    <section class="card">
      <h2>Метеообеспечение</h2>
      <p class="limits">Пределы для «${l.vehicleType}»: ветер у земли ≤ ${d.limits.maxWindGround} м/с, на высотах ≤ ${d.limits.maxWindAltitude} м/с,
        температура ${d.limits.minTemperature}…${d.limits.maxTemperature} °C, облачность ≤ ${d.limits.maxCloudiness} балл., гроза — запрещена.</p>
      <table class="table">
        <thead><tr><th>Время</th><th>Ветер у земли / на высотах, м/с</th><th>T, °C</th><th>Облачность</th><th>Гроза</th><th>Вывод</th><th>Внёс</th></tr></thead>
        <tbody>
          ${d.weather.map((w) => html`<tr>
            <td>${fmtDateTime(w.measured_at)}</td><td>${w.wind_ground} / ${w.wind_altitude}</td><td>${w.temperature}</td>
            <td>${w.cloudiness}</td><td>${w.thunderstorm ? 'да' : 'нет'}</td>
            <td>${w.violations.length ? html`${chip('Превышение', 'red')}<small class="viol">${w.violations.join('; ')}</small>` : chip('Допустимо', 'green')}</td>
            <td>${w.user}</td>
          </tr>`)}
          ${d.weather.length ? '' : html`<tr><td colspan="7" class="empty">Сводок нет</td></tr>`}
        </tbody>
      </table>
      ${user.can(Role.Meteo) && !launched ? html`
      <form method="post" action="/launches/${l.id}/weather" class="form form--inline">
        <label>Время измерения <input type="datetime-local" name="measuredAt" required value="${toInputDateTime(d.now)}"></label>
        <label>Ветер у земли, м/с <input name="windGround" type="number" step="0.1" min="0" required></label>
        <label>Ветер на высотах, м/с <input name="windAltitude" type="number" step="0.1" min="0" required></label>
        <label>Температура, °C <input name="temperature" type="number" step="0.1" required></label>
        <label>Облачность, баллы <input name="cloudiness" type="number" min="0" max="10" step="1" required></label>
        <label class="check"><input type="checkbox" name="thunderstorm"> Грозовая активность</label>
        <button class="btn btn--primary">Внести сводку</button>
      </form>` : ''}
    </section>`;

  const forecastCard = html`
    <section class="card">
      <h2>Прогноз внешней метеослужбы</h2>
      <p class="limits">Прогноз по высотам запрашивается автоматически за ${FORECAST_LEAD_HOURS} ч до начала окна и сравнивается с теми же пределами.
        Превышение даёт предупреждение о возможном переносе; решение о переносе принимает руководитель.</p>
      <table class="table">
        <thead><tr><th>Запрошен</th><th>Источник</th><th>Прогноз</th><th>Результат</th><th>Кто</th></tr></thead>
        <tbody>
          ${d.forecasts.map((a) => html`<tr>
            <td>${fmtDateTime(a.requestedAt)}</td><td>${FORECAST_SOURCE_TITLES[a.source]}</td>
            <td>${a.forecast ? html`ветер ${a.forecast.windGround} / ${a.forecast.windAltitude} м/с<small class="muted block">T ${a.forecast.temperature} °C · облачность ${a.forecast.cloudiness} · гроза ${a.forecast.thunderstorm ? 'да' : 'нет'}</small>` : html`<span class="muted">—</span>`}</td>
            <td>${!a.forecast ? html`${chip('Служба недоступна', 'red')}<small class="viol">${a.note}</small>`
              : a.violations.length ? html`${chip('Риск переноса', 'amber')}<small class="viol">${a.violations.join('; ')}</small>`
              : chip('В пределах', 'green')}
              ${a.source === 'manual' ? html`<small class="muted block">Основание: ${a.note}</small>` : ''}</td>
            <td>${a.user ?? 'Система'}</td>
          </tr>`)}
          ${d.forecasts.length ? '' : html`<tr><td colspan="5" class="empty">Прогноз для текущего окна ещё не запрашивался</td></tr>`}
        </tbody>
      </table>
      ${user.can(Role.Meteo, Role.Manager) && !launched ? html`
      <form method="post" action="/launches/${l.id}/forecast" class="form form--inline">
        <button class="btn">Запросить прогноз сейчас</button>
      </form>` : ''}
      ${user.can(Role.Meteo) && !launched && d.manualForecastAllowed ? html`
      <h3 class="sub">Ручной ввод прогноза (служба недоступна)</h3>
      <form method="post" action="/launches/${l.id}/forecast/manual" class="form form--inline">
        <label>Ветер у земли, м/с <input name="windGround" type="number" step="0.1" min="0" required></label>
        <label>Ветер на высотах, м/с <input name="windAltitude" type="number" step="0.1" min="0" required></label>
        <label>Температура, °C <input name="temperature" type="number" step="0.1" required></label>
        <label>Облачность, баллы <input name="cloudiness" type="number" min="0" max="10" step="1" required></label>
        <label class="check"><input type="checkbox" name="thunderstorm"> Гроза</label>
        <label class="wide">Основание (откуда данные) <input name="basis" required minlength="5" maxlength="300" placeholder="Например, радиозондирование 06:00, прогноз Гидрометцентра"></label>
        <button class="btn btn--primary">Внести прогноз</button>
      </form>` : ''}
    </section>`;

  const postponeCard = html`
    <section class="card">
      <h2>Журнал переносов</h2>
      ${d.postponements.length ? html`<ul class="log">
        ${d.postponements.map((p) => html`<li>
          <div>${chip(POSTPONE_REASON_TITLES[p.reason_category], p.reason_category === 'weather' ? 'amber' : 'violet')}
            <span class="mono">${fmtDateTime(p.old_window_start)} → ${fmtDateTime(p.new_window_start)}</span></div>
          <p>${p.reason}</p><small class="muted">${fmtDateTime(p.created_at)} · ${p.user}</small></li>`)}
      </ul>` : html`<p class="empty">Переносов не было</p>`}
    </section>`;

  const incidentsCard = launched ? html`
    <section class="card">
      <h2>Телеметрия: нештатные ситуации</h2>
      <table class="table">
        <thead><tr><th>Время</th><th>Канал</th><th>Система</th><th>Описание</th><th>Принятые меры</th></tr></thead>
        <tbody>
          ${d.incidents.map((i) => html`<tr><td>${fmtDateTime(i.occurred_at)}</td><td class="mono">${i.code}</td><td>${i.system_name}</td>
            <td>${i.description}</td><td>${i.measures}</td></tr>`)}
          ${d.incidents.length ? '' : html`<tr><td colspan="5" class="empty">Потерь сигнала не зафиксировано</td></tr>`}
        </tbody>
      </table>
      ${user.can(Role.Telemetry) ? html`
      <form method="post" action="/launches/${l.id}/incidents" class="form">
        <div class="row2">
          <label>Канал
            <select name="channelId">${d.channels.map((c) => html`<option value="${c.id}">${c.code} · ${c.system_name} · ${c.parameter}</option>`)}</select></label>
          <label>Время потери сигнала <input type="datetime-local" name="occurredAt" required value="${toInputDateTime(l.launchedAt ?? d.now)}"></label>
        </div>
        <label>Описание <input name="description" required maxlength="500" value="Потеря сигнала по каналу"></label>
        <label>Принятые меры <input name="measures" required maxlength="500" placeholder="Например, переход на резервный приёмный пункт"></label>
        <button class="btn btn--primary">Зарегистрировать нештатную ситуацию</button>
      </form>` : ''}
    </section>` : '';

  return layout(ctx, `Пуск №${l.id}`, 'launches', html`
    <a class="back" href="/">← К расписанию</a>
    <div class="page-head">
      <div>
        <h1>${l.payload}</h1>
        <p class="muted">Пуск №${l.id} · ${l.vehicleType} · ${l.pad}</p>
      </div>
      ${statusChip(l)}
    </div>
    ${d.forecastWarning.length ? html`<div class="flash flash--warn">Предупреждение о возможном переносе по прогнозу: ${d.forecastWarning.join('; ')}</div>` : ''}
    <div class="facts">
      <div><span>Тип носителя</span><b>${l.vehicleType}</b></div>
      <div><span>Целевая орбита</span><b>${ORBIT_TITLES[l.targetOrbit]}</b></div>
      <div><span>Стартовое окно</span><b>${fmtDateTime(l.windowStart)} – ${l.windowEnd.slice(11)}</b>${l.windowEnd.slice(0, 10) !== l.windowStart.slice(0, 10) ? html`<small>до ${fmtDate(l.windowEnd)}</small>` : ''}</div>
      <div><span>${launched ? 'Время старта' : 'Площадка'}</span><b>${launched ? fmtDateTime(l.launchedAt) : l.pad}</b>${launched ? html`<small>наработка площадки ${l.padHours} ч</small>` : ''}</div>
    </div>
    <div class="grid grid--main">
      <div class="stack">
        <section class="card"><h2>Этапы подготовки</h2>${stepper}</section>
        ${incidentsCard}
        ${fuelCard}
        ${forecastCard}
        ${weatherCard}
      </div>
      <div class="stack">
        ${engineerActions}
        ${managerActions}
        ${postponeCard}
      </div>
    </div>
  `);
}
