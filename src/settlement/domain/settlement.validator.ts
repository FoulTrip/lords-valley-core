import { Settlement } from '@prisma/client';

export class SettlementValidator {
  static validateOrphanRefs(settlement: Settlement): void {
    const validIds = new Set(settlement.survivors.map((s) => s.id));

    for (const survivor of settlement.survivors) {
      if (survivor.superiorId && !validIds.has(survivor.superiorId)) {
        throw new Error(
          `Orphan superiorId: survivor ${survivor.id} references non-existent superior ${survivor.superiorId}`,
        );
      }

      for (const link of survivor.socialLinks) {
        if (!validIds.has(link.targetSurvivorId)) {
          throw new Error(
            `Orphan socialLink: survivor ${survivor.id} references non-existent target ${link.targetSurvivorId}`,
          );
        }
      }
    }

    for (const building of settlement.buildings) {
      for (const slot of building.workSlots) {
        if (!validIds.has(slot.survivorId)) {
          throw new Error(
            `Orphan workSlot: building ${building.id} references non-existent survivor ${slot.survivorId}`,
          );
        }
      }
    }
  }

  static validatePriorities(food: number, defense: number, production: number): void {
    for (const [name, v] of [
      ['foodPriority', food],
      ['defensePriority', defense],
      ['productionPriority', production],
    ] as const) {
      if (!Number.isInteger(v) || v < 0 || v > 100) {
        throw new Error(`${name} must be integer 0-100`);
      }
    }
  }

  static validateBsonSize(settlement: Settlement, threshold = 10_000_000): void {
    const size = Buffer.byteLength(JSON.stringify(settlement), 'utf8');
    if (size > threshold) {
      // eslint-disable-next-line no-console
      console.warn(
        `[SettlementValidator] Settlement ${settlement.id} size ${size} bytes exceeds threshold ${threshold}. Consider externalizing survivors/history.`,
      );
    }
  }
}
