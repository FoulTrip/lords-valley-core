import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SpawnGhostDto {
  @ApiProperty({ description: 'ID del settlement donde spawnear el ghost' })
  @IsString()
  settlementId!: string;

  @ApiProperty({ description: 'Cantidad de ghosts a spawnear (1-3)', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  count?: number;

  @ApiProperty({ description: 'Base X sugerida por el cliente (coords iso del mapa 0..12288). El servidor dispersa alrededor y sigue siendo autoridad de la posición final.', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(13000)
  baseX?: number;

  @ApiProperty({ description: 'Base Y sugerida por el cliente (coords iso del mapa 0..6144).', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(7000)
  baseY?: number;
}

export class GhostDamageDto {
  @ApiProperty({ description: 'ID del ghost que recibe daño' })
  @IsString()
  ghostId!: string;

  @ApiProperty({ description: 'Cantidad de daño (1-500)' })
  @IsNumber()
  @Min(1)
  @Max(500)
  amount!: number;

  @ApiProperty({ description: 'ID del atacante (jugador o entidad)' })
  @IsString()
  attackerId!: string;

  @ApiProperty({ description: 'Posición X del atacante en el mundo' })
  @IsNumber()
  attackerX!: number;

  @ApiProperty({ description: 'Posición Y del atacante en el mundo' })
  @IsNumber()
  attackerY!: number;

  @ApiProperty({ description: 'Arma equipada del atacante (nombre de catálogo; el servidor valida y decreta daño/hemorragia)', required: false })
  @IsOptional()
  @IsString()
  weapon?: string;

  @ApiProperty({ description: 'ID del settlement (para cargar el equipo persistido del dueño)', required: false })
  @IsOptional()
  @IsString()
  settlementId?: string;
}

export class PlayerAttackedDto {
  @ApiProperty({ description: 'ID del ghost que ataca' })
  @IsString()
  ghostId!: string;

  @ApiProperty({ description: 'ID del jugador atacado' })
  @IsString()
  targetId!: string;

  @ApiProperty({ description: 'Posición X del ghost al atacar' })
  @IsNumber()
  ghostX!: number;

  @ApiProperty({ description: 'Posición Y del ghost al atacar' })
  @IsNumber()
  ghostY!: number;

  @ApiProperty({ description: 'Posición X del objetivo al atacar' })
  @IsNumber()
  targetX!: number;

  @ApiProperty({ description: 'Posición Y del objetivo al atacar' })
  @IsNumber()
  targetY!: number;

  @ApiProperty({ description: 'ID del settlement' })
  @IsString()
  settlementId!: string;
}

/** Estado autoritativo de un Ghost retornado por el servidor */
export class GhostStateDto {
  id!: string;
  settlementId!: string;
  hp!: number;
  maxHp!: number;
  energia!: number;
  maxEnergia!: number;
  positionX!: number;
  positionY!: number;
  isDead!: boolean;
}

/** Resultado de aplicar daño a un Ghost */
export class GhostDamageResultDto {
  ghostId!: string;
  applied!: boolean;
  newHp!: number;
  isDead!: boolean;
  /** Razón si fue rechazado (anti-cheat) */
  rejectedReason?: string;
}

/** Daño confirmado por el servidor al jugador */
export class PlayerDamageResultDto {
  applied!: boolean;
  amount!: number;
  targetId!: string;
  settlementId!: string;
  rejectedReason?: string;
  /** HP autoritativo tras el golpe (el cliente lo sincroniza, nunca lo calcula) */
  targetHp?: number;
  targetMaxHp?: number;
  isDead?: boolean;
}

/** Golpe genérico reportado por el cliente; el servidor valida y decreta */
export class CombatHitDto {
  @ApiProperty({ description: 'ID del atacante' })
  @IsString()
  attackerId!: string;

  @ApiProperty({ description: 'Tipo de atacante: player | survivor | dead-dragon | ghost' })
  @IsString()
  attackerKind!: string;

  @ApiProperty({ description: 'ID del objetivo' })
  @IsString()
  targetId!: string;

  @ApiProperty({ description: 'Tipo de objetivo: player | survivor | dead-dragon | ghost' })
  @IsString()
  targetKind!: string;

  @ApiProperty({ description: 'Posición X reportada del atacante' })
  @IsNumber()
  attackerX!: number;

  @ApiProperty({ description: 'Posición Y reportada del atacante' })
  @IsNumber()
  attackerY!: number;

  @ApiProperty({ description: 'Posición X reportada del objetivo' })
  @IsNumber()
  targetX!: number;

  @ApiProperty({ description: 'Posición Y reportada del objetivo' })
  @IsNumber()
  targetY!: number;

  @ApiProperty({ description: 'ID del settlement' })
  @IsString()
  settlementId!: string;

  @ApiProperty({ description: 'Monto solo para atacante player sin arma (acotado a 200)', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  amount?: number;

  @ApiProperty({ description: 'Arma equipada del atacante (nombre de catálogo; el servidor valida y decreta daño/hemorragia)', required: false })
  @IsOptional()
  @IsString()
  weapon?: string;
}

/** Resultado autoritativo de un golpe genérico */
export class CombatHitResultDto {
  applied!: boolean;
  damage!: number;
  targetId!: string;
  /** Lo añade el gateway al emitir (eco del dto) para que el cliente enrute */
  targetKind?: string;
  targetHp!: number;
  targetMaxHp!: number;
  isDead!: boolean;
  rejectedReason?: string;
}

/** Muerte confirmada por el servidor (broadcast al room) */
export class CombatDiedDto {
  targetId!: string;
  targetKind!: string;
  settlementId!: string;
}

/** Respawn: el cliente avisa tras reaparecer; el servidor restaura HP lleno */
export class RespawnDto {
  @ApiProperty({ description: 'ID de la entidad que reaparece' })
  @IsString()
  entityId!: string;

  @ApiProperty({ description: 'Tipo: player | survivor | dead-dragon | ghost' })
  @IsString()
  kind!: string;

  @ApiProperty({ description: 'ID del settlement' })
  @IsString()
  settlementId!: string;
}
