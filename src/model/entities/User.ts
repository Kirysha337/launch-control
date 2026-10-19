import { AccessDeniedError } from '../errors';

/** Роли пользователей центра управления. */
export enum Role {
  Manager = 'manager',
  Engineer = 'engineer',
  Telemetry = 'telemetry',
  Meteo = 'meteo',
}

export const ROLE_TITLES: Record<Role, string> = {
  [Role.Manager]: 'Руководитель центра',
  [Role.Engineer]: 'Инженер технического комплекса',
  [Role.Telemetry]: 'Оператор телеметрии',
  [Role.Meteo]: 'Метеоролог',
};

/** Пользователь системы (сотрудник центра). Хеш пароля в объект не попадает. */
export class User {
  constructor(
    readonly id: number,
    readonly login: string,
    readonly fullName: string,
    readonly role: Role,
  ) {}

  get roleTitle(): string {
    return ROLE_TITLES[this.role];
  }

  /** Имеет ли пользователь одну из ролей. */
  can(...roles: Role[]): boolean {
    return roles.includes(this.role);
  }

  /** Проверка прав: бросает исключение, если роль не подходит. */
  require(...roles: Role[]): void {
    if (!this.can(...roles)) {
      throw new AccessDeniedError(`Действие доступно только ролям: ${roles.map((r) => ROLE_TITLES[r]).join(', ')}`);
    }
  }
}
