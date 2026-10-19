import type { Db } from '../../db/database';
import { Role, User } from '../entities/User';

interface UserRow { id: number; login: string; full_name: string; role: Role; password_hash: string }

/** Доступ к пользователям и сессиям. В сессиях хранится только хеш токена. */
export class UserRepository {
  constructor(private readonly db: Db) {}

  findByLogin(login: string): { user: User; passwordHash: string } | null {
    const row = this.db.prepare(`SELECT * FROM users WHERE login = ?`).get(login) as UserRow | undefined;
    return row ? { user: new User(row.id, row.login, row.full_name, row.role), passwordHash: row.password_hash } : null;
  }

  insert(login: string, passwordHash: string, fullName: string, role: Role): void {
    this.db.prepare(`INSERT INTO users (login, password_hash, full_name, role) VALUES (?, ?, ?, ?)`)
      .run(login, passwordHash, fullName, role);
  }

  createSession(tokenHash: string, userId: number, expiresAt: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(new Date().toISOString());
    this.db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`).run(tokenHash, userId, expiresAt);
  }

  findBySession(tokenHash: string): User | null {
    const row = this.db.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, new Date().toISOString()) as UserRow | undefined;
    return row ? new User(row.id, row.login, row.full_name, row.role) : null;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
  }
}
