/** Нарушение бизнес-правила или некорректные входные данные. Текст показывается пользователю. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/** Действие недоступно для роли текущего пользователя. */
export class AccessDeniedError extends DomainError {
  constructor(message = 'Недостаточно прав для выполнения действия') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

/** Запрошенная запись не найдена. */
export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} не найден(а)`);
    this.name = 'NotFoundError';
  }
}
