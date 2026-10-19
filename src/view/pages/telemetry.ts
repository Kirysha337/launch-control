import { ChannelRow, IncidentRow } from '../../model/repositories/TelemetryRepository';
import { fmtDateTime, fmtNum, html } from '../html';
import { layout, PageContext } from '../layout';

export function telemetryPage(ctx: PageContext, data: { channels: ChannelRow[]; incidents: IncidentRow[] }): string {
  return layout(ctx, 'Телеметрия', 'telemetry', html`
    <div class="page-head">
      <div><h1>Телеметрический контроль</h1><p class="muted">Каналы закреплены за системами носителя; потеря сигнала фиксируется как нештатная ситуация</p></div>
    </div>
    <div class="grid grid--half">
      <section class="card">
        <h2>Каналы телеметрии</h2>
        <table class="table">
          <thead><tr><th>Канал</th><th>Система носителя</th><th>Параметр</th><th class="num">Частота, Гц</th></tr></thead>
          <tbody>${data.channels.map((c) => html`<tr><td class="mono"><b>${c.code}</b></td><td>${c.system_name}</td>
            <td>${c.parameter}</td><td class="num">${fmtNum(c.frequency_hz)}</td></tr>`)}</tbody>
        </table>
      </section>
      <section class="card">
        <h2>Журнал нештатных ситуаций</h2>
        <ul class="log">
          ${data.incidents.map((i) => html`<li>
            <div><span class="mono"><b>${i.code}</b></span> · ${i.system_name} · <a href="/launches/${i.launch_id}">${i.vehicle_type} / ${i.payload}</a></div>
            <p>${i.description}. <b>Меры:</b> ${i.measures}</p>
            <small class="muted">${fmtDateTime(i.occurred_at)} · ${i.user}</small></li>`)}
        </ul>
        ${data.incidents.length ? '' : html`<p class="empty">Нештатных ситуаций нет</p>`}
      </section>
    </div>
  `);
}
