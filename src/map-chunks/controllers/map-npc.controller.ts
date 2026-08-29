import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  HttpCode,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { MapNpcService } from '../services/map-npc.service';
import { MapNpcDto } from './map-npc.dto';
import { CreateMapNpcDto } from './create-map-npc.dto';

@ApiTags('map-npc')
@Controller('map/npc')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class MapNpcController {
  constructor(private readonly npcService: MapNpcService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los NPCs en el mapa' })
  @ApiResponse({ type: [MapNpcDto] })
  async findAll(): Promise<MapNpcDto[]> {
    return this.npcService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener NPC del mapa por ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ type: MapNpcDto })
  async findOne(@Param('id') id: string): Promise<MapNpcDto> {
    return this.npcService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crear nuevo NPC en el mapa' })
  @ApiBody({ type: CreateMapNpcDto })
  @ApiResponse({ type: MapNpcDto, status: 201 })
  async create(@Body() dto: CreateMapNpcDto): Promise<MapNpcDto> {
    return this.npcService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar NPC del mapa' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ type: MapNpcDto })
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; positionX?: number; positionY?: number; isActive?: boolean },
  ): Promise<MapNpcDto> {
    return this.npcService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Eliminar NPC del mapa' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 204 })
  async remove(@Param('id') id: string): Promise<void> {
    await this.npcService.remove(id);
  }
}