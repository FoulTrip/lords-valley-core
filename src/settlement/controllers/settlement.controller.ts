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
  Query,
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
  ApiQuery,
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

  @Get('owner/:ownerId')
  @ApiOperation({ summary: 'Listar asentamientos por owner', description: '1:N Player -> Settlements indexado por ownerId' })
  @ApiParam({ name: 'ownerId', description: 'ObjectId del Player' })
  @ApiOkResponse({ type: [SettlementResponseDto] })
  async findByOwner(@Param('ownerId') ownerId: string): Promise<SettlementResponseDto[]> {
    return this.settlementService.findByOwner(ownerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener asentamiento por ID' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto })
  @ApiNotFoundResponse({ description: 'Settlement no encontrado' })
  async findOne(@Param('id') id: string): Promise<SettlementResponseDto> {
    return this.settlementService.findById(id);
  }

  @Post(':id/viewport')
  @ApiOperation({ summary: 'Query chunks by viewport', description: 'Return chunk IDs visible in viewport. Frontend sends camera bounds, server returns chunk coordinates.' })
  @ApiQuery({ name: 'minChunkX', type: Number, required: false })
  @ApiQuery({ name: 'minChunkY', type: Number, required: false })
  @ApiQuery({ name: 'maxChunkX', type: Number, required: false })
  @ApiQuery({ name: 'maxChunkY', type: Number, required: false })
  @ApiQuery({ name: 'settlementId', type: Number, required: false })
  @ApiResponse({ status: 200, type: [String], description: 'List of chunk IDs [chunkX_chunkY]' })
  async getChunksByViewport(
    @Param('id') settlementId: string,
    @Query() query: { minChunkX?: number; minChunkY?: number; maxChunkX?: number; maxChunkY?: number; settlementId?: number },
  ): Promise<string[]> {
    const minCX = query.minChunkX ?? 0;
    const minCY = query.minChunkY ?? 0;
    const maxCX = query.maxChunkX ?? 100;
    const maxCY = query.maxChunkY ?? 100;

    // Generate chunk IDs for the viewport area
    const chunks: string[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        chunks.push(`${cx}_${cy}`);
      }
    }

    return chunks;
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

  @Patch(':id/world-state')
  @ApiOperation({ summary: 'Actualizar worldState (terrainHeights, farmPlots)', description: 'Persiste estado isométrico por settlement para hidratación cross-device' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto })
  async updateWorldState(@Param('id') id: string, @Body() body: { worldState: any; worldSeed?: string }): Promise<SettlementResponseDto> {
    if (body.worldSeed) {
      // opcional: si envían worldSeed junto con worldState, actualizar también
      const domain = await (this.settlementService as any).repository.findById(id);
      if (domain) {
        domain.updateWorldSeed(body.worldSeed);
        await (this.settlementService as any).repository.save(domain);
      }
    }
    return this.settlementService.updateWorldState(id, body.worldState ?? body);
  }

  @Patch(':id/rename')
  @ApiOperation({ summary: 'Renombrar asentamiento', description: 'Actualiza nombre del settlement (usado por StartScreen)' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto })
  async rename(@Param('id') id: string, @Body() body: { name: string }): Promise<SettlementResponseDto> {
    if (!body?.name || !body.name.trim()) throw new Error('name requerido');
    return this.settlementService.rename(id, body.name.trim());
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
