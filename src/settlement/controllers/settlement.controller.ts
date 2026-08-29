import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { SettlementService } from '../services/settlement.service';
import { CreateSettlementDto } from '../dto/create-settlement.dto';
import { UpdatePrioritiesDto } from '../dto/update-priorities.dto';
import { SettlementResponseDto } from '../dto/settlement-response.dto';

@ApiTags('settlements')
@Controller('settlements')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  @Post()
  @ApiOperation({ summary: 'Crear asentamiento', description: 'Crea un Settlement como Aggregate Root embebido' })
  @ApiCreatedResponse({ description: 'Asentamiento creado', type: SettlementResponseDto })
  @ApiResponse({ status: 400, description: 'Validación fallida' })
  async create(@Body() dto: CreateSettlementDto): Promise<SettlementResponseDto> {
    return this.settlementService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener asentamiento por ID' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto })
  @ApiNotFoundResponse({ description: 'Settlement no encontrado' })
  async findOne(@Param('id') id: string): Promise<SettlementResponseDto> {
    return this.settlementService.findById(id);
  }

  @Get('owner/:ownerId')
  @ApiOperation({ summary: 'Listar asentamientos por owner', description: '1:N Player -> Settlements indexado por ownerId' })
  @ApiParam({ name: 'ownerId', description: 'ObjectId del Player' })
  @ApiOkResponse({ type: [SettlementResponseDto] })
  async findByOwner(@Param('ownerId') ownerId: string): Promise<SettlementResponseDto[]> {
    return this.settlementService.findByOwner(ownerId);
  }

  @Patch(':id/priorities')
  @ApiOperation({ summary: 'Actualizar prioridades de automatización', description: 'food/defense/production 0-100, emite SETTLEMENT_PRIORITIES_CHANGED' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto })
  @ApiNotFoundResponse({ description: 'Settlement no encontrado' })
  async updatePriorities(
    @Param('id') id: string,
    @Body() dto: UpdatePrioritiesDto,
  ): Promise<SettlementResponseDto> {
    return this.settlementService.updatePriorities(id, dto);
  }

  @Post(':id/tick')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ejecutar tick manual', description: 'Avanza gameTime, ejecuta metabolismo de survivors y dispara eventos de dominio' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto })
  @ApiNotFoundResponse({ description: 'Settlement no encontrado' })
  async tick(@Param('id') id: string): Promise<SettlementResponseDto> {
    return this.settlementService.tick(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar asentamiento' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiNoContentResponse({ description: 'Eliminado' })
  @ApiNotFoundResponse({ description: 'Settlement no encontrado' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.settlementService.delete(id);
  }
}
