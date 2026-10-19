import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA } from './schema';

export type Db = Database.Database;

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'data', 'launch.db');

/** Открывает базу, включает внешние ключи и создаёт таблицы, если их ещё нет. */
export function openDatabase(file: string = process.env.DB_PATH ?? DEFAULT_PATH): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
