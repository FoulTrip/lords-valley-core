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
  BadRequestException,
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
import { CreateWarehouseDto, DepositWarehouseDto, WithdrawWarehouseDto } from '../dto/warehouse.dto';

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
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(ownerId);
    if (!isValidObjectId) {
      console.warn(`[SettlementController] ownerId inválido recibido: ${ownerId}`);
      // evitar error Prisma por ObjectId mal formado
      return [];
    }
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

  // ──────────────────────────────────────────────────────────────────────────
  // AUTORIDAD DEL SERVIDOR: Endpoints que reemplazan lógica que estaba en el cliente
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /settlements/:id/survivors/spawn
   * Genera NPCs con IDs UUID reales y stats canónicos server-side.
   * El frontend llama este endpoint en lugar de `new Survivor()` con Math.random().
   */
  @Post(':id/survivors/spawn')
  @ApiOperation({ summary: 'Spawnear NPCs server-side', description: 'Genera survivors con IDs UUID reales, stats canónicos y los persiste. El cliente debe llamar este endpoint en lugar de generar NPCs localmente.' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ type: SettlementResponseDto, description: 'Settlement actualizado con los nuevos survivors' })
  @ApiNotFoundResponse({ description: 'Settlement no encontrado' })
  async spawnSurvivors(
    @Param('id') id: string,
    @Body() body: { count?: number },
  ): Promise<SettlementResponseDto> {
    const count = Math.max(1, Math.min(body?.count ?? 1, 5));
    return this.settlementService.spawnSurvivors(id, count);
  }

  /**
   * POST /settlements/:id/inventory/add
   * Agrega recursos al inventario con validación server-side.
   * El servidor valida capacidad y tipo de recurso — el cliente no puede hacer trampa.
   */
  @Post(':id/inventory/add')
  @ApiOperation({ summary: 'Agregar recurso al inventario (server-validated)', description: 'El servidor valida tipo, cantidad y capacidad. Rechaza si inventory_full o tipo inválido.' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ description: '{ ok, newQuantity, reason? }' })
  async addToInventory(
    @Param('id') id: string,
    @Body() body: { resourceType: string; quantity: string },
  ): Promise<{ ok: boolean; newQuantity: string; reason?: string }> {
    if (!body?.resourceType || !body?.quantity) {
      throw new BadRequestException('resourceType y quantity son requeridos');
    }
    return this.settlementService.addToInventory(id, body.resourceType, body.quantity);
  }

  /**
   * PATCH /settlements/:id/game-mode
   * El servidor es la única autoridad del modo de juego.
   * El cliente debe llamar este endpoint en lugar de modificar window.__CREATIVE_MODE__.
   */
  @Patch(':id/game-mode')
  @ApiOperation({ summary: 'Establecer modo de juego (server-side)', description: 'Persiste el modo creative/survival en MongoDB. El ghost AI consulta este valor — no window.__CREATIVE_MODE__.' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiOkResponse({ description: '{ gameMode: "creative" | "survival" }' })
  async setGameMode(
    @Param('id') id: string,
    @Body() body: { mode: 'creative' | 'survival' },
  ): Promise<{ gameMode: string }> {
    if (!body?.mode || !['creative', 'survival'].includes(body.mode)) {
      throw new BadRequestException('mode debe ser "creative" o "survival"');
    }
    return this.settlementService.setGameMode(id, body.mode);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ALMACENES: Endpoints autoritativos
  // ──────────────────────────────────────────────────────────────────────────

  @Get(':id/warehouses')
  @ApiOperation({ summary: 'Obtener almacenes del asentamiento' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  async getWarehouses(@Param('id') id: string) {
    return this.settlementService.getWarehouses(id);
  }

  @Post(':id/warehouses')
  @ApiOperation({ summary: 'Crear nuevo almacén (server-validated limits & 3x3 footprint)' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  async createWarehouse(
    @Param('id') id: string,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.settlementService.createWarehouse(id, dto);
  }

  @Post(':id/warehouses/:warehouseId/deposit')
  @ApiOperation({ summary: 'Depositar ítem en almacén (server-validated category, 100 slots, maxStack 300)' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiParam({ name: 'warehouseId', description: 'ID del almacén' })
  async depositToWarehouse(
    @Param('id') id: string,
    @Param('warehouseId') warehouseId: string,
    @Body() dto: DepositWarehouseDto,
  ) {
    return this.settlementService.depositToWarehouse(id, warehouseId, dto);
  }

  @Post(':id/warehouses/:warehouseId/withdraw')
  @ApiOperation({ summary: 'Retirar ítem de almacén (server-validated)' })
  @ApiParam({ name: 'id', description: 'ObjectId del settlement' })
  @ApiParam({ name: 'warehouseId', description: 'ID del almacén' })
  async withdrawFromWarehouse(
    @Param('id') id: string,
    @Param('warehouseId') warehouseId: string,
    @Body() dto: WithdrawWarehouseDto,
  ) {
    return this.settlementService.withdrawFromWarehouse(id, warehouseId, dto);
  }
}
