import crypto from 'node:crypto';
import { DomainError } from '../errors';
import { Role, User } from '../entities/User';
import { UserRepository } from '../repositories/UserRepository';

const SESSION_HOURS = 8;

/** Вход в систему, сессии и хеширование паролей (scrypt с солью). */
export class AuthService {
  constructor(private readonly users: UserRepository) {}

  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private static verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
  }

  private static tokenHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  createUser(login: string, password: string, fullName: string, role: Role): void {
    this.users.insert(login, AuthService.hashPassword(password), fullName, role);
  }

  /** Проверяет логин и пароль, создаёт сессию. Возвращает токен для cookie. */
  login(login: unknown, password: unknown): { token: string; user: User } {
    const found = typeof login === 'string' ? this.users.findByLogin(login.trim()) : null;
    if (!found || typeof password !== 'string' || !AuthService.verifyPassword(password, found.passwordHash)) {
      throw new DomainError('Неверный логин или пароль');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString();
    this.users.createSession(AuthService.tokenHash(token), found.user.id, expiresAt);
    return { token, user: found.user };
  }

  userByToken(token: string | undefined): User | null {
    return token ? this.users.findBySession(AuthService.tokenHash(token)) : null;
  }

  logout(token: string | undefined): void {
    if (token) this.users.deleteSession(AuthService.tokenHash(token));
  }
}
