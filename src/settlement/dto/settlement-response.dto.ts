import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SettlementTier, Season, Weather } from '@prisma/client';

export class SurvivorResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' }) @Expose() id!: string;
  @ApiProperty({ example: 'Aric' }) @Expose() firstName!: string;
  @ApiProperty({ example: 'Stonehand' }) @Expose() lastName!: string;
  @ApiProperty({ example: 'MASCULINO', enum: ['MASCULINO', 'FEMENINO', 'OTRO'] }) @Expose() gender!: string;
  @ApiProperty({ example: 27 }) @Expose() age!: number;
  @ApiProperty({ example: 15 }) @Expose() birthDay!: number;
  @ApiProperty({ example: 6 }) @Expose() birthMonth!: number;
  @ApiProperty({ example: 990 }) @Expose() birthYear!: number;
  @ApiProperty({ example: 73 }) @Expose() loyalty!: number;
  @ApiProperty({ example: false }) @Expose() isLoyalAbsolute!: boolean;
  @ApiProperty({ type: Object, isArray: true }) @Expose() loyaltyHistory!: unknown[];
  @ApiProperty({ example: { strength: 10, agility: 12 } }) @Expose() attributes!: unknown;
  @ApiProperty({ example: [{ type: 'MEDICO', level: 2 }] }) @Expose() professions!: unknown[];
  @ApiProperty({ example: { hunger: 20, thirst: 10 } }) @Expose() needs!: unknown;
  @ApiProperty({ example: 'WORKING' }) @Expose() currentTask!: string;
  @ApiProperty({ example: 'TRABAJADOR' }) @Expose() assignedJob!: string;
  @ApiProperty({ example: '0' }) @Expose() lvyBalance!: string;
  @ApiProperty({ example: 12.5 }) @Expose() positionX!: number;
  @ApiProperty({ example: 8.0 }) @Expose() positionY!: number;
  @ApiProperty({ example: null, nullable: true }) @Expose() superiorId!: string | null;
  @ApiProperty({ example: [] }) @Expose() inventory!: unknown[];
  @ApiProperty({ example: 50 }) @Expose() maxCarryWeight!: number;
  @ApiProperty({ example: 2.5 }) @Expose() currentWeight!: number;
  @ApiProperty({ example: [] }) @Expose() socialLinks!: unknown[];
}

export class SettlementResponseDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6a7b8c9d0e' })
  @Expose() id!: string;

  @ApiProperty({ example: 'Valle del Lobo' })
  @Expose() name!: string;

  @ApiProperty({ enum: SettlementTier, example: SettlementTier.REFUGIO })
  @Expose() tier!: SettlementTier;

  @ApiProperty({ example: '665a1b2c3d4e5f6a7b8c9d0e' })
  @Expose() ownerId!: string;

  @ApiProperty({ example: '0', description: 'BigInt serializado como string (256 bits)' })
  @Expose() lvyBalance!: string;

  @ApiProperty({ example: '0' })
  @Expose() maxLvyStorage!: string;

  @ApiProperty({ example: 42 })
  @Expose() gameTime!: number;

  @ApiProperty({ example: 5 })
  @Expose() currentDay!: number;

  @ApiProperty({ example: 3 })
  @Expose() currentMonth!: number;

  @ApiProperty({ example: 1 })
  @Expose() currentYear!: number;

  @ApiProperty({ enum: Season, example: Season.PRIMAVERA })
  @Expose() season!: Season;

  @ApiProperty({ enum: Weather, example: Weather.DESPEJADO })
  @Expose() weather!: Weather;

  @ApiProperty({ example: 1.0 })
  @Expose() landFertility!: number;

  @ApiProperty({ example: 0.0 })
  @Expose() pollutionLevel!: number;

  @ApiProperty({ example: 0.0 })
  @Expose() diseaseRisk!: number;

  @ApiProperty({ example: 50 })
  @Expose() foodPriority!: number;

  @ApiProperty({ example: 30 })
  @Expose() defensePriority!: number;

  @ApiProperty({ example: 20 })
  @Expose() productionPriority!: number;

  @ApiProperty({ type: [SurvivorResponseDto] })
  @Expose()
  @Type(() => SurvivorResponseDto)
  survivors!: SurvivorResponseDto[];

  @ApiProperty({ example: [], description: 'Building[] embebido' })
  @Expose() buildings!: unknown[];

  @ApiProperty({ example: [], description: 'Resource[] String quantities' })
  @Expose() inventory!: unknown[];

  @ApiProperty({ example: [] })
  @Expose() historyLog!: unknown[];

  @ApiProperty({ example: 'seed_abc123', nullable: true, required: false })
  @Expose() worldSeed!: string | null;

  @ApiProperty({ required: false, nullable: true })
  @Expose() worldState!: any;

  @ApiProperty({ example: 'survival', enum: ['survival', 'creative'], description: 'Modo de juego autoritativo del servidor. El cliente debe leer este valor, no window.__CREATIVE_MODE__.' })
  @Expose() gameMode!: string;

  @ApiProperty()
  @Expose() createdAt!: Date;

  @ApiProperty()
  @Expose() updatedAt!: Date;
}
