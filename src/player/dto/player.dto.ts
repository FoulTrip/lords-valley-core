import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
}

export class StackIdDto {
  @IsString()
  stackId!: string;
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
