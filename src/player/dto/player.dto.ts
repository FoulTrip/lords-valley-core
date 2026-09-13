import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddItemDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  escuela?: string;

  @IsInt()
  @Min(1)
  @Max(9)
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
