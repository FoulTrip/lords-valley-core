import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'lord@valley.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'TestLord' })
  @IsString()
  @MinLength(3)
  username!: string;

  @ApiProperty({ example: 's3cr3tP@ss' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'lord@valley.test' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 's3cr3tP@ss' })
  @IsString()
  password!: string;
}
