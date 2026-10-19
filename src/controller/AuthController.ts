import type { NextFunction, Request, Response, Router } from 'express';
import { DomainError } from '../model/errors';
import { AuthService } from '../model/services/AuthService';
import { loginPage } from '../view/pages/login';
import { pageContext, setFlash } from './common';

const SESSION_COOKIE = 'sid';

/** Вход и выход; middleware загрузки пользователя по cookie сессии. */
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly showDemoHint: boolean) {}

  routes(r: Router): void {
    r.get('/login', (req, res) => res.send(loginPage(pageContext(req, res), this.showDemoHint)));
    r.post('/login', this.login);
    r.post('/logout', this.logout);
  }

  /** Определяет пользователя по cookie (если сессия действительна). */
  loadUser = (req: Request, res: Response, next: NextFunction): void => {
    res.locals.user = this.auth.userByToken(req.cookies?.[SESSION_COOKIE]);
    next();
  };

  /** Пропускает дальше только вошедших пользователей. */
  requireAuth = (_req: Request, res: Response, next: NextFunction): void => {
    if (res.locals.user) return next();
    res.redirect('/login');
  };

  private login = (req: Request, res: Response): void => {
    try {
      const { token } = this.auth.login(req.body.login, req.body.password);
      res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', maxAge: 8 * 3_600_000 });
      res.redirect(303, '/');
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      setFlash(res, 'error', e.message);
      res.redirect(303, '/login');
    }
  };

  private logout = (req: Request, res: Response): void => {
    this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(303, '/login');
  };
}
