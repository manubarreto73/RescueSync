import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

/** Cambio de contrasena del propio usuario autenticado. */
export class ChangePasswordDto {
  @ApiProperty({ description: 'Contrasena actual, para verificar identidad' })
  @IsString()
  @Length(8, 72)
  passwordActual!: string;

  @ApiProperty({ example: 'NuevaClave2026!' })
  @IsString()
  @Length(8, 72, { message: 'La contrasena debe tener entre 8 y 72 caracteres' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'La contrasena debe incluir mayuscula, minuscula y numero',
  })
  passwordNueva!: string;
}
