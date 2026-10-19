import { html } from '../html';
import { layout, PageContext, ROCKET_ICON } from '../layout';

export function loginPage(ctx: PageContext, showDemoHint: boolean): string {
  return layout(ctx, 'Вход', '', html`
    <div class="login">
      <div class="login__brand">${ROCKET_ICON}<span>ЦУП «Старт»</span></div>
      <h1>Центр управления пусками</h1>
      <p class="muted">Подготовка и проведение пусков ракет-носителей</p>
      <form method="post" action="/login" class="form">
        <label>Логин <input name="login" required autofocus autocomplete="username"></label>
        <label>Пароль <input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn btn--primary btn--wide">Войти</button>
      </form>
      ${showDemoHint ? html`<div class="hint">
        <b>Демо-учётные записи</b> (пароль <code>start2026</code>):
        <ul><li><code>manager</code> — руководитель центра</li><li><code>engineer</code> — инженер технического комплекса</li>
        <li><code>telemetry</code> — оператор телеметрии</li><li><code>meteo</code> — метеоролог</li></ul>
      </div>` : ''}
    </div>
  `);
}
