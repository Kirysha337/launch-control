import { Launch, LaunchStatus, ORBIT_TITLES, ORBITS } from '../../model/entities/Launch';
import { LaunchPad } from '../../model/entities/LaunchPad';
import { STAGES } from '../../model/entities/PreparationStage';
import { Role } from '../../model/entities/User';
import { VehicleTypeRow } from '../../model/repositories/LaunchRepository';
import { fmtDateTime, html, SafeHtml } from '../html';
import { chip, layout, PageContext } from '../layout';

export function statusChip(l: Launch): SafeHtml {
  const tone = { planned: 'violet', preparing: 'blue', ready: 'green', launched: 'gray' } as const;
  return chip(l.statusTitle, tone[l.status]);
}

/** Мини-индикатор прохождения этапов подготовки. */
export function stageDots(l: Launch): SafeHtml {
  const done = l.status === LaunchStatus.Launched ? STAGES.length : l.completedStages;
  return html`<span class="dots" title="Этапов пройдено: ${done} из ${STAGES.length}">
    ${STAGES.map((s) => html`<i class="${s.no <= done ? 'on' : ''}"></i>`)}</span>`;
}

export function launchesPage(
  ctx: PageContext,
  data: { launches: Launch[]; vehicleTypes: VehicleTypeRow[]; pads: LaunchPad[]; forecastWarnings: Set<number> },
): string {
  const active = data.launches.filter((l) => l.status !== LaunchStatus.Launched);
  const done = data.launches.filter((l) => l.status === LaunchStatus.Launched);
  const canRegister = ctx.user!.can(Role.Manager);

  const table = (list: Launch[], isDone: boolean) => html`
    <table class="table">
      <thead><tr>
        <th>№</th><th>Носитель</th><th>Полезная нагрузка</th><th>Орбита</th><th>Площадка</th>
        <th>${isDone ? 'Время старта' : 'Стартовое окно'}</th><th>Подготовка</th><th>Статус</th>
      </tr></thead>
      <tbody>
        ${list.map((l) => html`
        <tr>
          <td class="muted">${l.id}</td>
          <td><b>${l.vehicleType}</b></td>
          <td><a href="/launches/${l.id}">${l.payload}</a></td>
          <td>${l.targetOrbit}</td>
          <td>${l.pad}</td>
          <td class="mono">${isDone ? fmtDateTime(l.launchedAt) : html`${fmtDateTime(l.windowStart)}<small> – ${l.windowEnd.slice(11)}</small>`}</td>
          <td>${stageDots(l)}<small class="muted stage-name">${l.currentStage?.title ?? ''}</small></td>
          <td>${statusChip(l)}${data.forecastWarnings.has(l.id) ? html` ${chip('риск переноса', 'amber')}` : ''}</td>
        </tr>`)}
        ${list.length ? '' : html`<tr><td colspan="8" class="empty">Нет пусков</td></tr>`}
      </tbody>
    </table>`;

  const stats = [
    ['Запланировано', data.launches.filter((l) => l.status === LaunchStatus.Planned).length],
    ['Идёт подготовка', data.launches.filter((l) => l.status === LaunchStatus.Preparing).length],
    ['Готовы к пуску', data.launches.filter((l) => l.status === LaunchStatus.Ready).length],
    ['Проведено', done.length],
  ];

  return layout(ctx, 'Пуски', 'launches', html`
    <div class="page-head">
      <div><h1>Расписание пусков</h1><p class="muted">Регистрация, подготовка и проведение пусков ракет-носителей</p></div>
    </div>
    <div class="stats">${stats.map(([t, v]) => html`<div class="stat"><span>${t}</span><b>${v}</b></div>`)}</div>

    <div class="${canRegister ? 'grid grid--main' : ''}">
      <section class="card">
        <h2>Ближайшие пуски</h2>
        ${table(active, false)}
      </section>
      ${canRegister ? html`
      <section class="card">
        <h2>Регистрация пуска</h2>
        <form method="post" action="/launches" class="form">
          <label>Тип носителя
            <select name="vehicleTypeId" required>
              ${data.vehicleTypes.map((v) => html`<option value="${v.id}">${v.name}</option>`)}
            </select></label>
          <label>Полезная нагрузка
            <input name="payload" required maxlength="200" placeholder="Например, «Метеор-М» №2-6"></label>
          <label>Целевая орбита
            <select name="targetOrbit">${ORBITS.map((o) => html`<option value="${o}">${ORBIT_TITLES[o]}</option>`)}</select></label>
          <label>Стартовая площадка
            <select name="padId">${data.pads.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
          <div class="row2">
            <label>Начало окна <input type="datetime-local" name="windowStart" required></label>
            <label>Конец окна <input type="datetime-local" name="windowEnd" required></label>
          </div>
          <button class="btn btn--primary">Зарегистрировать пуск</button>
        </form>
      </section>` : ''}
    </div>

    <section class="card">
      <h2>Проведённые пуски</h2>
      ${table(done, true)}
    </section>
  `);
}
