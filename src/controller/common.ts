import type { NextFunction, Request, Response } from 'express';
import { AccessDeniedError, DomainError, NotFoundError } from '../model/errors';
import { User } from '../model/entities/User';
import { requireId } from '../model/validation';
import { errorPage } from '../view/pages/error';
import { Flash, PageContext } from '../view/layout';

const FLASH_COOKIE = 'flash';

/** Текущий пользователь (гарантирован middleware requireAuth). */
export function currentUser(res: Response): User {
  return res.locals.user as User;
}

/** Контекст страницы для View: пользователь и одноразовое сообщение. */
export function pageContext(req: Request, res: Response): PageContext {
  let flash: Flash | null = null;
  const raw = req.cookies?.[FLASH_COOKIE];
  if (raw) {
    try { flash = JSON.parse(raw) as Flash; } catch { flash = null; }
    res.clearCookie(FLASH_COOKIE);
  }
  return { user: (res.locals.user as User | undefined) ?? null, flash };
}

export function setFlash(res: Response, type: Flash['type'], text: string): void {
  res.cookie(FLASH_COOKIE, JSON.stringify({ type, text }), { httpOnly: true, sameSite: 'strict' });
}

/** Идентификатор из параметра маршрута. */
export function idParam(req: Request, name = 'id'): number {
  return requireId(req.params[name], 'Идентификатор');
}

/**
 * Обёртка для POST-действий: вызывает Model, показывает результат или понятную ошибку
 * через сообщение на странице и возвращает пользователя назад (шаблон Post/Redirect/Get).
 * Действие может быть асинхронным (лаба №4: запрос к внешней метеослужбе).
 */
export function action(
  run: (req: Request, res: Response) => string | Flash | Promise<string | Flash>,
  back: (req: Request) => string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await run(req, res);
      if (typeof result === 'string') setFlash(res, 'ok', result);
      else setFlash(res, result.type, result.text);
    } catch (e) {
      if (e instanceof AccessDeniedError || !(e instanceof DomainError)) return next(e);
      setFlash(res, 'error', e.message);
    }
    res.redirect(303, back(req));
  };
}

/** Последний обработчик ошибок: права, отсутствующие записи и непредвиденные сбои. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const ctx = pageContext(req, res);
  if (err instanceof AccessDeniedError) {
    res.status(403).send(errorPage(ctx, 403, err.message));
  } else if (err instanceof NotFoundError) {
    res.status(404).send(errorPage(ctx, 404, err.message));
  } else if (err instanceof DomainError) {
    res.status(422).send(errorPage(ctx, 422, err.message));
  } else {
    console.error(err);
    res.status(500).send(errorPage(ctx, 500, 'Внутренняя ошибка сервера'));
  }
}
