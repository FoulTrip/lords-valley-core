import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ChunkResponseDto {
  @ApiProperty()
  @Expose() id!: string;

  @ApiProperty({ example: 0 })
  @Expose() chunkX!: number;

  @ApiProperty({ example: 0 })
  @Expose() chunkY!: number;

  @ApiProperty({ description: '32x32 matriz GID' })
  @Expose() tiles!: number[][];

  @ApiProperty({ description: 'Recursos vírgenes con quantity string BigInt' })
  @Expose() resources!: unknown;

  @ApiProperty()
  @Expose() isExplored!: boolean;

  @ApiProperty({ nullable: true })
  @Expose() settledBy!: string | null;

  @ApiProperty()
  @Expose() createdAt!: Date;

  @ApiProperty()
  @Expose() updatedAt!: Date;
}
