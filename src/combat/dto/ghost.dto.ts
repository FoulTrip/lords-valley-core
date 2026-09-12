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
}
