import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Rol } from '../../common/enums/rol.enum';
import { IndicadoresQuery, IndicadoresResponseDto } from './dtos/indicadores.dto';
import { IndicadoresService } from './indicadores.service';

@ApiTags('Indicadores')
@ApiBearerAuth('access-token')
@Controller({ path: 'indicadores', version: '1' })
export class IndicadoresController {
  constructor(private readonly indicadoresService: IndicadoresService) {}

  @Get()
  @Roles(Rol.AUDITOR)
  @ApiOperation({ summary: 'Indicadores del tablero: datos propios y tiempos de Bonita' })
  @ApiResponse({ status: 200, type: IndicadoresResponseDto })
  obtener(@Query() query: IndicadoresQuery): Promise<IndicadoresResponseDto> {
    return this.indicadoresService.obtener(query.mes);
  }
}
