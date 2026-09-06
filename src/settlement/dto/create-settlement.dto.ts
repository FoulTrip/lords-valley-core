import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementTier } from '@prisma/client';

export class CreateSettlementDto {
  @ApiProperty({
    example: 'Valle del Lobo',
    description: 'Nombre del asentamiento',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: '665a1b2c3d4e5f6a7b8c9d0e',
    description: 'ObjectId del Player propietario',
  })
  @IsString()
  @IsNotEmpty()
  ownerId!: string;

  @ApiPropertyOptional({
    enum: SettlementTier,
    example: SettlementTier.REFUGIO,
    description: 'Tier político inicial',
  })
  @IsOptional()
  @IsEnum(SettlementTier)
  tier?: SettlementTier;

  @ApiPropertyOptional({ example: 'seed_abc123', description: 'Semilla de mundo isométrico' })
  @IsOptional()
  @IsString()
  worldSeed?: string;

  @ApiPropertyOptional({ description: 'Estado persistente del mundo (terrainHeights, farmPlots)' })
  @IsOptional()
  worldState?: any;
}
