import { CombatService, COMBAT_STATS } from './combat.service';

jest.mock('@nestjs/common', () => {
  class Logger {
    log() {}
    warn() {}
    debug() {}
  }
  return {
    Injectable: () => () => undefined,
    Logger,
  };
});

describe('CombatService (daño autoritativo)', () => {
  it('expone stats canónicas: survivor 10/200/50, dragon 500, ghost 50', () => {
    expect(COMBAT_STATS.survivor).toMatchObject({ maxHp: 200, maxEnergia: 50, damage: 10 });
    expect(COMBAT_STATS['dead-dragon'].damage).toBe(500);
    expect(COMBAT_STATS.ghost.damage).toBe(50);
  });

  it('ghost pega 50 al player y descuenta HP autoritativo (200 base)', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1);
    const res = svc.processGhostAttackPlayer(
      g.id, 'p1', g.positionX, g.positionY, g.positionX + 10, g.positionY, 's1', 'survival',
    );
    expect(res.applied).toBe(true);
    expect(res.amount).toBe(50);
    expect(res.targetHp).toBe(150);
    expect(res.targetMaxHp).toBe(200);
    expect(res.isDead).toBe(false);
  });

  it('survivor pega 10 a otro survivor', () => {
    const svc = new CombatService();
    const res = svc.applyCombatHit({
      attackerId: 'a1', attackerKind: 'survivor',
      targetId: 't1', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 10, targetY: 0,
      settlementId: 's1',
    });
    expect(res).toMatchObject({ applied: true, damage: 10, targetHp: 190, targetMaxHp: 200, isDead: false });
  });

  it('dead-dragon mata de un golpe (500) y el objetivo queda muerto', () => {
    const svc = new CombatService();
    const kill = svc.applyCombatHit({
      attackerId: 'dd1', attackerKind: 'dead-dragon',
      targetId: 't1', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 10, targetY: 0,
      settlementId: 's1',
    });
    expect(kill).toMatchObject({ applied: true, damage: 500, targetHp: 0, isDead: true });
    const again = svc.applyCombatHit({
      attackerId: 'dd2', attackerKind: 'dead-dragon',
      targetId: 't1', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 10, targetY: 0,
      settlementId: 's1',
    });
    expect(again.applied).toBe(false);
    expect(again.rejectedReason).toBe('target_dead');
  });

  it('respawn restaura HP lleno y permite recibir daño de nuevo', () => {
    const svc = new CombatService();
    svc.applyCombatHit({
      attackerId: 'dd1', attackerKind: 'dead-dragon',
      targetId: 'p1', targetKind: 'player',
      attackerX: 0, attackerY: 0, targetX: 10, targetY: 0,
      settlementId: 's1',
    });
    expect(svc.respawnEntity('p1', 'player', 's1')).toEqual({ entityId: 'p1', hp: 200, maxHp: 200 });
    const res = svc.applyCombatHit({
      attackerId: 'a1', attackerKind: 'survivor',
      targetId: 'p1', targetKind: 'player',
      attackerX: 0, attackerY: 0, targetX: 10, targetY: 0,
      settlementId: 's1',
    });
    expect(res).toMatchObject({ applied: true, targetHp: 190 });
  });

  it('rechaza kind desconocido, distancia y cooldown', () => {
    const svc = new CombatService();
    const bad = svc.applyCombatHit({
      attackerId: 'a', attackerKind: 'dragon',
      targetId: 't', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 1, targetY: 0,
      settlementId: 's1',
    });
    expect(bad.rejectedReason).toBe('unknown_kind');
    const far = svc.applyCombatHit({
      attackerId: 'a1', attackerKind: 'survivor',
      targetId: 't2', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 9999, targetY: 0,
      settlementId: 's1',
    });
    expect(far.rejectedReason).toBe('attacker_too_far');
    const first = svc.applyCombatHit({
      attackerId: 'a2', attackerKind: 'survivor',
      targetId: 't3', targetKind: 'player',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1',
    });
    expect(first.applied).toBe(true);
    const second = svc.applyCombatHit({
      attackerId: 'a2', attackerKind: 'survivor',
      targetId: 't3', targetKind: 'player',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1',
    });
    expect(second.rejectedReason).toBe('cooldown_not_met');
  });

  it('player reporta monto acotado a 200; sin monto se rechaza', () => {
    const svc = new CombatService();
    const big = svc.applyCombatHit({
      attackerId: 'p1', attackerKind: 'player',
      targetId: 'g1', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1', amount: 500,
    });
    expect(big).toMatchObject({ applied: true, damage: 200, isDead: true });
    const none = svc.applyCombatHit({
      attackerId: 'p2', attackerKind: 'player',
      targetId: 'g2', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1',
    });
    expect(none.rejectedReason).toBe('invalid_damage');
  });

  it('golpe a ghost usa su HP registrado y valida distancia servidora', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1);
    const res = svc.applyCombatHit({
      attackerId: 'a1', attackerKind: 'survivor',
      targetId: g.id, targetKind: 'ghost',
      attackerX: g.positionX + 10, attackerY: g.positionY,
      targetX: g.positionX, targetY: g.positionY,
      settlementId: 's1',
    });
    expect(res).toMatchObject({ applied: true, damage: 10, targetHp: 590, isDead: false });
  });

  it('spawn con base sugerida dispersa alrededor de la base (no del centro legacy)', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1, { x: 9000, y: 1000 });
    expect(g.positionX).toBeGreaterThanOrEqual(9000 - 500);
    expect(g.positionX).toBeLessThanOrEqual(9000 + 500);
    expect(g.positionY).toBeGreaterThanOrEqual(1000 - 500);
    expect(g.positionY).toBeLessThanOrEqual(1000 + 500);
  });

  it('spawn sin base usa el centro legacy (3072,3072)', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1);
    expect(g.positionX).toBeGreaterThanOrEqual(3072 - 500);
    expect(g.positionX).toBeLessThanOrEqual(3072 + 500);
  });

  it('spawn acota la base sugerida al mundo iso (0..12288, 0..6144)', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1, { x: 99999, y: -50 });
    expect(g.positionX).toBeGreaterThanOrEqual(12288 - 500);
    expect(g.positionX).toBeLessThanOrEqual(12288 + 500);
    expect(g.positionY).toBeGreaterThanOrEqual(0 - 500);
  });

  it('escudo + cota reducen el daño de ghost (10% + 20% = 35 de 50)', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1);
    const res = svc.processGhostAttackPlayer(
      g.id, 'p1', g.positionX, g.positionY, g.positionX + 10, g.positionY, 's1', 'survival', false,
      { armor: 'Cota de Malla', armorCalidad: 'comun', shield: 'Escudo', shieldCalidad: 'comun' },
    );
    expect(res).toMatchObject({ applied: true, amount: 35, targetHp: 165 });
  });

  it('ghost no puede dañar a un jugador invisible', () => {
    const svc = new CombatService();
    const [g] = svc.spawnGhosts('s1', 1);
    const res = svc.processGhostAttackPlayer(
      g.id, 'p1', g.positionX, g.positionY, g.positionX + 10, g.positionY, 's1', 'survival', false,
      { buffs: [{ kind: 'invisible', value: 1, expiresAt: Date.now() + 10_000 }] },
    );
    expect(res.applied).toBe(false);
    expect(res.rejectedReason).toBe('invisible');
  });

  it('combat:hit contra invisible se rechaza y la furia suma daño temporal', () => {
    const svc = new CombatService();
    const invis = svc.applyCombatHit({
      attackerId: 'dd1', attackerKind: 'dead-dragon',
      targetId: 'p1', targetKind: 'player',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1',
      defenderLoadout: { buffs: [{ kind: 'invisible', value: 1, expiresAt: Date.now() + 10_000 }] },
    });
    expect(invis.applied).toBe(false);
    expect(invis.rejectedReason).toBe('target_invisible');
    const fury = svc.applyCombatHit({
      attackerId: 'a1', attackerKind: 'survivor',
      targetId: 't9', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1',
      attackerLoadout: {
        weapon: 'Daga', weaponCalidad: 'comun',
        buffs: [{ kind: 'damage_boost', value: 30, expiresAt: Date.now() + 30_000 }],
      },
    });
    // Daga 5 + furia 30
    expect(fury).toMatchObject({ applied: true, damage: 35 });
    const expired = svc.applyCombatHit({
      attackerId: 'a2', attackerKind: 'survivor',
      targetId: 't10', targetKind: 'survivor',
      attackerX: 0, attackerY: 0, targetX: 5, targetY: 0,
      settlementId: 's1',
      attackerLoadout: {
        weapon: 'Daga', weaponCalidad: 'comun',
        buffs: [{ kind: 'damage_boost', value: 30, expiresAt: Date.now() - 1000 }],
      },
    });
    expect(expired).toMatchObject({ applied: true, damage: 5 });
  });
});
