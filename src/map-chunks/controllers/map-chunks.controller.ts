import { Controller, Get, Post, Patch, Param, Query, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MapChunksService } from '../services/map-chunks.service';
import { QueryChunkDto, BulkGenerateDto } from '../dto/query-chunk.dto';
import { ChunkResponseDto } from '../dto/chunk-response.dto';

@ApiTags('map-chunks')
@Controller('map/chunks')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class MapChunksController {
  constructor(private readonly service: MapChunksService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener o crear chunk por coords', description: 'Lazy generation 32x32 si no existe' })
  @ApiQuery({ name: 'x', type: Number })
  @ApiQuery({ name: 'y', type: Number })
  @ApiResponse({ status: 200, type: ChunkResponseDto })
  async getByCoords(@Query() q: QueryChunkDto): Promise<ChunkResponseDto> {
    return this.service.getOrCreate(q.x, q.y) as unknown as ChunkResponseDto;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener chunk por ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ChunkResponseDto })
  async getById(@Param('id') id: string): Promise<ChunkResponseDto> {
    return this.service.findById(id) as unknown as ChunkResponseDto;
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generar bulk chunks' })
  @ApiResponse({ status: 201, type: [ChunkResponseDto] })
  async bulk(@Body() dto: BulkGenerateDto): Promise<ChunkResponseDto[]> {
    return this.service.generateBulk(dto.chunks) as unknown as ChunkResponseDto[];
  }

  @Patch(':id/explore')
  @ApiOperation({ summary: 'Marcar chunk como explorado' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: ChunkResponseDto })
  async explore(@Param('id') id: string): Promise<ChunkResponseDto> {
    return this.service.explore(id) as unknown as ChunkResponseDto;
  }

  @Patch(':id/claim/:settlementId')
  @ApiOperation({ summary: 'Reclamar chunk para settlement' })
  @ApiParam({ name: 'id' }) @ApiParam({ name: 'settlementId' })
  @ApiResponse({ status: 200, type: ChunkResponseDto })
  async claim(@Param('id') id: string, @Param('settlementId') settlementId: string): Promise<ChunkResponseDto> {
    return this.service.claim(id, settlementId) as unknown as ChunkResponseDto;
  }
}
