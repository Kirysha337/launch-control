import { NotFoundError } from '../errors';
import { LaunchPad, PadMaintenance } from '../entities/LaunchPad';
import { Role, User } from '../entities/User';
import { PadRepository } from '../repositories/PadRepository';
import { now, today } from '../time';
import { requireId } from '../validation';

/** Стартовые площадки и межпусковое обслуживание. */
export class PadService {
  constructor(private readonly pads: PadRepository) {}

  list(): LaunchPad[] {
    return this.pads.findAll();
  }

  maintenance(): PadMaintenance[] {
    return this.pads.maintenance();
  }

  plan(actor: User, input: { padId: unknown; kind: unknown; plannedDate: unknown; note: unknown }): void {
    actor.require(Role.Engineer);
    const padId = requireId(input.padId, 'Площадка');
    if (!this.pads.findById(padId)) throw new NotFoundError('Стартовая площадка');
    this.pads.insertMaintenance(PadMaintenance.plan({ ...input, padId }, today()));
  }

  complete(actor: User, maintenanceId: number): void {
    actor.require(Role.Engineer);
    const m = this.pads.findMaintenance(maintenanceId);
    if (!m) throw new NotFoundError('Обслуживание');
    m.complete(now());
    this.pads.updateMaintenance(m);
  }
}
