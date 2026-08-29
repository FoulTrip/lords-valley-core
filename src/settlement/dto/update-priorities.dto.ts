import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrioritiesDto {
  @ApiProperty({ example: 60, minimum: 0, maximum: 100, description: 'Prioridad comida 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  foodPriority!: number;

  @ApiProperty({ example: 30, minimum: 0, maximum: 100, description: 'Prioridad defensa 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  defensePriority!: number;

  @ApiProperty({ example: 10, minimum: 0, maximum: 100, description: 'Prioridad producción 0-100' })
  @IsInt()
  @Min(0)
  @Max(100)
  productionPriority!: number;
}
