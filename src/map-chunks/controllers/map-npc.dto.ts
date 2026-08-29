import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class MapNpcDto {
  @ApiProperty()
  @Expose() id!: string;

  @ApiProperty()
  @Expose() name!: string;

  @ApiProperty({ example: 0 })
  @Expose() chunkX!: number;

  @ApiProperty({ example: 0 })
  @Expose() chunkY!: number;

  @ApiProperty({ example: 0 })
  @Expose() positionX!: number;

  @ApiProperty({ example: 0 })
  @Expose() positionY!: number;

  @ApiProperty({ nullable: true })
  @Expose() settlementId!: string | null;

  @ApiProperty({ nullable: true })
  @Expose() survivorId!: string | null;

  @ApiProperty()
  @Expose() isActive!: boolean;

  @ApiProperty()
  @Expose() createdAt!: Date;

  @ApiProperty()
  @Expose() updatedAt!: Date;
}