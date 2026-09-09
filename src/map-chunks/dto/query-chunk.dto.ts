import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryChunkDto {
  @ApiProperty({ example: 0, description: 'chunkX' })
  @IsInt()
  @Type(() => Number)
  x!: number;

  @ApiProperty({ example: 0, description: 'chunkY' })
  @IsInt()
  @Type(() => Number)
  y!: number;

  @ApiPropertyOptional({ example: 'seed_abc123', description: 'Semilla del mundo: los tiles son deterministas por seed' })
  @IsOptional()
  @IsString()
  seed?: string;
}

export class ChunkCoordDto {
  @ApiProperty({ example: 0 })
  @IsInt()
  @Type(() => Number)
  chunkX!: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Type(() => Number)
  chunkY!: number;
}

export class BulkGenerateDto {
  @ApiProperty({ example: [{ chunkX: 0, chunkY: 0 }, { chunkX: 1, chunkY: 0 }], type: [ChunkCoordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChunkCoordDto)
  chunks!: ChunkCoordDto[];

  @ApiPropertyOptional({ example: 'seed_abc123', description: 'Semilla del mundo para todo el lote' })
  @IsOptional()
  @IsString()
  seed?: string;
}
