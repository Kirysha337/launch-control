import { ReportTable } from '../../model/reports/Report';
import { fmtDate, fmtNum, html } from '../html';
import { layout, PageContext } from '../layout';

const cell = (v: string | number) => (typeof v === 'number' ? html`<td class="num">${fmtNum(v, 2)}</td>` : html`<td>${v}</td>`);

export function reportsPage(ctx: PageContext, data: { from: string; to: string; tables: ReportTable[] }): string {
  return layout(ctx, 'Отчёты', 'reports', html`
    <div class="page-head">
      <div><h1>Отчёты руководителя</h1><p class="muted">Период: ${fmtDate(data.from)} – ${fmtDate(data.to)}</p></div>
      <form method="get" action="/reports" class="form form--inline">
        <label>С <input type="date" name="from" value="${data.from}" required></label>
        <label>По <input type="date" name="to" value="${data.to}" required></label>
        <button class="btn btn--primary">Сформировать</button>
      </form>
    </div>
    ${data.tables.map((t) => html`
    <section class="card">
      <h2>${t.title}</h2>
      <p class="muted small">${t.note}</p>
      <table class="table">
        <thead><tr>${t.columns.map((c, i) => html`<th class="${typeof t.rows[0]?.[i] === 'number' ? 'num' : ''}">${c}</th>`)}</tr></thead>
        <tbody>
          ${t.rows.map((r) => html`<tr>${r.map(cell)}</tr>`)}
          ${t.rows.length ? '' : html`<tr><td colspan="${t.columns.length}" class="empty">Нет данных за период</td></tr>`}
        </tbody>
        ${t.totals ? html`<tfoot><tr>${t.totals.map(cell)}</tr></tfoot>` : ''}
      </table>
    </section>`)}
  `);
}
