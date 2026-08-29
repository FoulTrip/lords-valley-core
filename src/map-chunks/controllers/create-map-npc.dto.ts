import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMapNpcDto {
  @ApiProperty({ description: 'Nombre del NPC' })
  @Expose() name!: string;

  @ApiProperty({ description: 'Coordenada del chunk X en el mapa' })
  @Expose() chunkX!: number;

  @ApiProperty({ description: 'Coordenada del chunk Y en el mapa' })
  @Expose() chunkY!: number;

  @ApiProperty({ description: 'Posición X dentro del chunk' })
  @Expose() positionX!: number;

  @ApiProperty({ description: 'Posición Y dentro del chunk' })
  @Expose() positionY!: number;

  @ApiProperty({ description: 'ID del settlement opcional', nullable: true })
  @Expose() settlementId?: string;

  @ApiProperty({ description: 'ID del survivor opcional (si se traslada desde un asentamiento)', nullable: true })
  @Expose() survivorId?: string;
}