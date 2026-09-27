import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { TipoOrganizacion } from '@prisma/client';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterOrganizacionDto {
  @ApiProperty({ example: 'Municipalidad de Villa Carlos Paz' })
  @IsString()
  @Length(3, 150)
  @Transform(recortar)
  nombre!: string;

  @ApiProperty({ enum: TipoOrganizacion, example: TipoOrganizacion.ONG })
  @IsEnum(TipoOrganizacion, { message: 'El tipo de organizacion no es valido' })
  tipo!: TipoOrganizacion;

  @ApiPropertyOptional({ example: '30712345678', description: 'CUIT sin guiones' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'El CUIT debe tener 11 digitos, sin guiones' })
  @IsOptional()
  cuit?: string;

  @ApiPropertyOptional({ description: 'Identificador en el Sistema Nacional' })
  @IsString()
  @Length(3, 50)
  @IsOptional()
  codigoNacional?: string;

  @ApiPropertyOptional({ example: 'contacto@cruzsolidaria.org' })
  @IsEmail({}, { message: 'El email de contacto no tiene un formato valido' })
  @Length(5, 120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsOptional()
  emailContacto?: string;

  @ApiPropertyOptional({ example: '+54 9 351 555-1234' })
  @IsString()
  @Length(6, 30)
  @IsOptional()
  telefonoContacto?: string;

  @ApiPropertyOptional({ example: 'Villa Carlos Paz' })
  @IsString()
  @Length(2, 120)
  @Transform(recortar)
  @IsOptional()
  localidad?: string;

  @ApiPropertyOptional({ example: 'Cordoba' })
  @IsString()
  @Length(2, 120)
  @Transform(recortar)
  @IsOptional()
  provincia?: string;
}
