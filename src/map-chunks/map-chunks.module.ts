import { Module } from '@nestjs/common';
import { MapChunksController } from './controllers/map-chunks.controller';
import { MapNpcController } from './controllers/map-npc.controller';
import { MapChunksService } from './services/map-chunks.service';
import { MapNpcService } from './services/map-npc.service';
import { MapChunksRepository } from './services/map-chunks.repository';
import { MapNpcRepository } from './services/map-npc.repository';
import { ChunkGeneratorService } from './services/chunk-generator.service';
import { IsometricProjectionService } from './services/isometric-projection.service';

@Module({
  controllers: [MapChunksController, MapNpcController],
  providers: [MapChunksService, MapNpcService, MapChunksRepository, MapNpcRepository, ChunkGeneratorService, IsometricProjectionService],
  exports: [MapChunksService, MapNpcService, IsometricProjectionService],
})
export class MapChunksModule {}
