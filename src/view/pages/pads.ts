import { LaunchPad, MAINTENANCE_KINDS, MAINTENANCE_TITLES, PadMaintenance } from '../../model/entities/LaunchPad';
import { Role } from '../../model/entities/User';
import { fmtDate, fmtDateTime, fmtNum, html } from '../html';
import { chip, layout, PageContext } from '../layout';

export function padsPage(ctx: PageContext, data: { pads: LaunchPad[]; maintenance: PadMaintenance[]; today: string }): string {
  const canEdit = ctx.user!.can(Role.Engineer);
  const meter = (value: number, norm: number) => {
    const pct = Math.min(100, (value / norm) * 100);
    return html`<div class="bar ${pct >= 100 ? 'bar--red' : pct >= 80 ? 'bar--amber' : ''}"><i style="width:${pct.toFixed(0)}%"></i></div>`;
  };

  return layout(ctx, 'Площадки', 'pads', html`
    <div class="page-head">
      <div><h1>Стартовые площадки</h1><p class="muted">Ограничение одновременных подготовок и межпусковое обслуживание по нормативам моточасов и циклов</p></div>
    </div>
    <div class="pads">
      ${data.pads.map((p) => html`
      <section class="card pad">
        <div class="pad__head"><h2>${p.name}</h2>
          ${p.maintenanceRequired ? chip('Требуется обслуживание', 'red') : p.wear >= 0.8 ? chip('Скоро обслуживание', 'amber') : chip('В норме', 'green')}</div>
        <div class="pad__row"><span>Ракет на площадке</span><b>${p.occupied} из ${p.maxConcurrent}</b></div>
        ${meter(p.occupied, p.maxConcurrent)}
        <div class="pad__row"><span>Моточасы с обслуживания</span><b>${fmtNum(p.hoursSince)} / ${p.hoursNorm} ч</b></div>
        ${meter(p.hoursSince, p.hoursNorm)}
        <div class="pad__row"><span>Циклы (пуски) с обслуживания</span><b>${p.cyclesSince} / ${p.cyclesNorm}</b></div>
        ${meter(p.cyclesSince, p.cyclesNorm)}
        <small class="muted">Последнее обслуживание: ${fmtDateTime(p.lastMaintenance)}</small>
      </section>`)}
    </div>
    <div class="${canEdit ? 'grid grid--main' : ''}">
      <section class="card">
        <h2>Межпусковое обслуживание</h2>
        <table class="table">
          <thead><tr><th>Площадка</th><th>Вид</th><th>План</th><th>Выполнено</th><th>Примечание</th><th></th></tr></thead>
          <tbody>
            ${data.maintenance.map((m) => html`<tr>
              <td>${m.pad}</td><td>${m.kindTitle}</td><td>${fmtDate(m.plannedDate)}</td>
              <td>${m.doneAt ? fmtDateTime(m.doneAt) : chip(m.plannedDate < data.today ? 'Просрочено' : 'Запланировано', m.plannedDate < data.today ? 'red' : 'violet')}</td>
              <td>${m.note}</td>
              <td>${canEdit && !m.doneAt ? html`<form method="post" action="/pads/maintenance/${m.id}/complete"><button class="btn btn--small">Выполнено</button></form>` : ''}</td>
            </tr>`)}
          </tbody>
        </table>
      </section>
      ${canEdit ? html`
      <section class="card">
        <h2>Запланировать обслуживание</h2>
        <form method="post" action="/pads/maintenance" class="form">
          <label>Площадка <select name="padId">${data.pads.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select></label>
          <label>Вид <select name="kind">${MAINTENANCE_KINDS.map((k) => html`<option value="${k}">${MAINTENANCE_TITLES[k]}</option>`)}</select></label>
          <label>Плановая дата <input type="date" name="plannedDate" required value="${data.today}"></label>
          <label>Примечание <input name="note" maxlength="300"></label>
          <button class="btn btn--primary">Запланировать</button>
        </form>
      </section>` : ''}
    </div>
  `);
}
