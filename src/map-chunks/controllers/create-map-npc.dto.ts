import { IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMapNpcDto {
  @ApiProperty({ description: 'Nombre del NPC' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Coordenada del chunk X en el mapa' })
  @IsInt()
  chunkX!: number;

  @ApiProperty({ description: 'Coordenada del chunk Y en el mapa' })
  @IsInt()
  chunkY!: number;

  @ApiProperty({ description: 'Posición X dentro del chunk' })
  @IsNumber()
  positionX!: number;

  @ApiProperty({ description: 'Posición Y dentro del chunk' })
  @IsNumber()
  positionY!: number;

  @ApiProperty({ description: 'ID del settlement opcional', nullable: true })
  @IsOptional()
  @IsString()
  settlementId?: string;

  @ApiProperty({ description: 'ID del survivor opcional (si se traslada desde un asentamiento)', nullable: true })
  @IsOptional()
  @IsString()
  survivorId?: string;
}