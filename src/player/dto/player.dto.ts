import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddItemDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  escuela?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  cantidad!: number;

  @IsOptional()
  @IsString()
  calidad?: 'comun'|'bueno'|'raro'|'notable'|'sobresaliente'|'obra maestra'|'legendario'|'dios';
}

export class StackIdDto {
  @IsString()
  stackId!: string;
}

export class UseItemDto {
  @IsString()
  stackId!: string;

  /** Posición del lanzador (pergaminos de área: la envía el juego). */
  @IsOptional()
  @IsNumber()
  x?: number;

  @IsOptional()
  @IsNumber()
  y?: number;

  @IsOptional()
  @IsString()
  settlementId?: string;
}

export class EquipDto {
  @IsString()
  stackId!: string;

  /** Slot destino para armas ('arma1' | 'arma2'). El resto se detecta por nombre. */
  @IsOptional()
  @IsString()
  slot?: string;
}

export class ActiveWeaponDto {
  @IsString()
  slot!: string;
}

export class UnequipDto {
  @IsString()
  slot!: string;
}

export class TrainDto {
  @IsString()
  escuela!: string;

  @IsOptional()
  @IsString()
  skillId?: string;
}

export class GodModeDto {
  @IsBoolean()
  on!: boolean;
}

export class SpawnAllowDto {
  @IsString()
  kind!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  count!: number;
}
