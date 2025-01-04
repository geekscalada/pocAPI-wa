import {
  IsString,
  IsNotEmpty,
  IsEmail,
  ValidateNested,
  IsNumber,
  IsBoolean,
  Matches,
  IsOptional,
} from 'class-validator';
export class ExampleEntity {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  id!: string;
}
