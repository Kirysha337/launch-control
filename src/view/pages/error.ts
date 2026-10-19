import { html } from '../html';
import { layout, PageContext } from '../layout';

export function errorPage(ctx: PageContext, status: number, message: string): string {
  return layout(ctx, `Ошибка ${status}`, '', html`
    <section class="card error-card">
      <h1>${status}</h1>
      <p>${message}</p>
      <a class="btn" href="/">На главную</a>
    </section>
  `);
}
