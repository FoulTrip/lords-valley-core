import { IsString, IsNotEmpty, IsEnum, IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, ProfessionType } from '@prisma/client';

export class CreateSurvivorDto {
  @ApiProperty({ example: 'Elara' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Dawnfield' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ enum: Gender, example: Gender.FEMENINO })
  @IsEnum(Gender)
  gender!: Gender;

  @ApiProperty({ example: 24, minimum: 0, maximum: 120 })
  @IsInt()
  @Min(0)
  @Max(120)
  age!: number;

  @ApiPropertyOptional({ enum: ProfessionType, example: ProfessionType.MEDICO })
  @IsEnum(ProfessionType)
  @IsOptional()
  profession?: ProfessionType;
}
