import { Module } from '@nestjs/common';
import { MapChunksController } from './controllers/map-chunks.controller';
import { MapChunksService } from './services/map-chunks.service';
import { MapChunksRepository } from './services/map-chunks.repository';
import { ChunkGeneratorService } from './services/chunk-generator.service';

@Module({
  controllers: [MapChunksController],
  providers: [MapChunksService, MapChunksRepository, ChunkGeneratorService],
  exports: [MapChunksService],
})
export class MapChunksModule {}
