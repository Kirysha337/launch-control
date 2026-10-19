import { Role, User } from '../model/entities/User';
import { html, SafeHtml } from './html';

export interface Flash {
  type: 'ok' | 'warn' | 'error';
  text: string;
}

export interface PageContext {
  user: User | null;
  flash: Flash | null;
}

const NAV: { href: string; key: string; title: string; roles?: Role[] }[] = [
  { href: '/', key: 'launches', title: 'Пуски' },
  { href: '/fuel', key: 'fuel', title: 'Топливо' },
  { href: '/pads', key: 'pads', title: 'Площадки' },
  { href: '/telemetry', key: 'telemetry', title: 'Телеметрия' },
  { href: '/reports', key: 'reports', title: 'Отчёты', roles: [Role.Manager] },
];

export const ROCKET_ICON = html`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c3 2.5 4.5 6 4.5 10.5L14.5 16h-5l-2-3.5C7.5 8 9 4.5 12 2z"/><circle cx="12" cy="9" r="1.6"/><path d="M9.5 16 7 19.5 9.8 19M14.5 16 17 19.5 14.2 19M12 17.5V22"/></svg>`;

/** Общий каркас страницы: шапка с навигацией по ролям, сообщения, содержимое. */
export function layout(ctx: PageContext, title: string, active: string, content: SafeHtml): string {
  const user = ctx.user;
  return html`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · ЦУП «Старт»</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  ${user ? html`
  <header class="topbar">
    <div class="topbar__inner">
      <a class="brand" href="/">${ROCKET_ICON}<span>ЦУП «Старт»</span></a>
      <nav class="nav">
        ${NAV.filter((n) => !n.roles || user.can(...n.roles)).map((n) =>
          html`<a href="${n.href}" class="${n.key === active ? 'active' : ''}">${n.title}</a>`)}
      </nav>
      <div class="whoami">
        <div><b>${user.fullName}</b><small>${user.roleTitle}</small></div>
        <form method="post" action="/logout"><button class="icon-btn" title="Выйти">⎋</button></form>
      </div>
    </div>
  </header>` : ''}
  <main class="${user ? 'container' : 'container container--narrow'}">
    ${ctx.flash ? html`<div class="flash flash--${ctx.flash.type}">${ctx.flash.text}</div>` : ''}
    ${content}
  </main>
</body>
</html>`.value;
}

/** Цветная метка статуса. */
export function chip(text: string, tone: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet'): SafeHtml {
  return html`<span class="chip chip--${tone}">${text}</span>`;
}
