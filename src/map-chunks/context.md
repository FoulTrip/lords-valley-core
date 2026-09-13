# MapChunks Module — Contexto de Arquitectura

## Propósito
Streaming del mundo explorable. Persiste `GlobalMapChunk` 32×32 tiles (1024px) separado del `Settlement` para evitar límite BSON 16MB. Genera terreno y recursos vírgenes de forma determinista.

## Estructura
```
map-chunks/
  context.md
  map-chunks.module.ts
  controllers/map-chunks.controller.ts
  services/map-chunks.service.ts
  services/map-chunks.repository.ts
  services/chunk-generator.service.ts
  dto/create-chunk.dto.ts
  dto/query-chunk.dto.ts
  dto/chunk-response.dto.ts
  types/map-chunks.types.ts
```

## Contrato 32×32
- `tiles: number[32][32]` GID: 1 grass, 2 dirt, 3 rock(≥100 colisión), 5 forest. `worldX = chunkX*1024 + localX*32`.
- `resources: { type: ResourceType, quantity: string, posX, posY, chunkLocalX, chunkLocalY }[]` 2-5 por chunk.
- `isExplored` false por defecto, `settledBy` ObjectId opcional indexado.

## Generación
`ChunkGeneratorService.generate(chunkX, chunkY, seed)` determinista. Ver `MINERAL_CONFIGS` y consts `TILE_*` en el servicio para la distribución vigente.

## Endpoints
- `GET /map/chunks?x=0&y=0` → genera si no existe (lazy), cachea.
- `GET /map/chunks/:id`
- `POST /map/chunks/generate` bulk
- `PATCH /map/chunks/:id/explore`

## Dependencias
- `PrismaService` único. No depende de `SettlementModule` (evita ciclo). `settledBy` es string plano.
