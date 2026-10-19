import { FUEL_KIND_TITLES, FuelBatch, FuelKind } from '../../model/entities/FuelBatch';
import { Role } from '../../model/entities/User';
import { fmtDate, fmtNum, html } from '../html';
import { chip, layout, PageContext } from '../layout';

export function fuelPage(ctx: PageContext, data: { batches: FuelBatch[]; today: string }): string {
  const canEdit = ctx.user!.can(Role.Engineer);
  const soon = (b: FuelBatch) => !b.isExpired(data.today) && Date.parse(b.expiresOn) - Date.parse(data.today) <= 30 * 86_400_000;

  return layout(ctx, 'Топливо', 'fuel', html`
    <div class="page-head">
      <div><h1>Партии топлива</h1><p class="muted">Учёт горючего и окислителя по партиям с контролем сроков годности</p></div>
    </div>
    <div class="${canEdit ? 'grid grid--main' : ''}">
      <section class="card">
        <table class="table">
          <thead><tr><th>Партия</th><th>Компонент</th><th>Вид</th><th class="num">Объём, т</th><th class="num">Израсходовано, т</th>
            <th>Остаток</th><th>Годна до</th></tr></thead>
          <tbody>
            ${data.batches.map((b) => html`<tr>
              <td class="mono"><b>${b.batchNo}</b></td>
              <td>${b.component}</td>
              <td>${chip(b.kindTitle, b.kind === FuelKind.Fuel ? 'amber' : 'blue')}</td>
              <td class="num">${fmtNum(b.quantity)}</td>
              <td class="num">${fmtNum(b.consumed)}</td>
              <td><div class="bar"><i style="width:${Math.max(0, Math.min(100, (b.remaining / b.quantity) * 100)).toFixed(0)}%"></i></div>
                <small>${fmtNum(b.remaining)} т</small></td>
              <td class="mono">${fmtDate(b.expiresOn)}<br>${b.isExpired(data.today) ? chip('Просрочена', 'red') : soon(b) ? chip('≤ 30 дней', 'amber') : ''}</td>
            </tr>`)}
          </tbody>
        </table>
      </section>
      ${canEdit ? html`
      <section class="card">
        <h2>Поступление партии</h2>
        <form method="post" action="/fuel" class="form">
          <label>Номер партии <input name="batchNo" required maxlength="40" placeholder="КР-2026-030"></label>
          <label>Компонент <input name="component" required maxlength="100" placeholder="Керосин РГ-1"></label>
          <label>Вид
            <select name="kind">${Object.values(FuelKind).map((k) => html`<option value="${k}">${FUEL_KIND_TITLES[k]}</option>`)}</select></label>
          <label>Объём, т <input name="quantity" type="number" step="0.1" min="0.1" required></label>
          <div class="row2">
            <label>Дата поступления <input type="date" name="receivedOn" required value="${data.today}"></label>
            <label>Годна до <input type="date" name="expiresOn" required></label>
          </div>
          <button class="btn btn--primary">Зарегистрировать партию</button>
        </form>
      </section>` : ''}
    </div>
  `);
}
