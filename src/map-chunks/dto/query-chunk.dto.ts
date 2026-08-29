import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class QueryChunkDto {
  @ApiProperty({ example: 0, description: 'chunkX' })
  @IsInt()
  @Type(() => Number)
  x!: number;

  @ApiProperty({ example: 0, description: 'chunkY' })
  @IsInt()
  @Type(() => Number)
  y!: number;
}

export class BulkGenerateDto {
  @ApiProperty({ example: [{ chunkX: 0, chunkY: 0 }, { chunkX: 1, chunkY: 0 }], type: [Object] })
  chunks!: { chunkX: number; chunkY: number }[];
}
