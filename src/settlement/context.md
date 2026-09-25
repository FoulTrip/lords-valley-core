# Settlement Module — Contexto de Arquitectura

## Propósito
Aggregate Root del juego. Contiene toda la lógica de negocio del asentamiento, sus NPCs y su economía. Es la única fuente de verdad para simulación offline y estado persistente.

## Estructura
```
settlement/
  context.md
  settlement.module.ts
  controllers/
    settlement.controller.ts
  services/
    settlement.service.ts
    settlement.repository.ts
  domain/
    settlement.domain.ts
    survivor.domain.ts
    settlement.validator.ts
  dto/
    create-settlement.dto.ts
    update-priorities.dto.ts
    settlement-response.dto.ts
  types/
    settlement.types.ts
```

## Capas y Reglas
- **domain/**: Clases puras, sin dependencias NestJS/Prisma. Internamente usa `BigInt` para toda economía (`lvyBalance`, `maxLvyStorage`, `Resource.quantity`). Expone `toPersistenceSnapshot()` que convierte a `String`.
- **services/**: `SettlementRepository` es el único que habla con `PrismaService`. `SettlementService` orquesta validación + dominio + persistencia. Toda escritura pasa por `SettlementValidator.validateOrphanRefs()`.
- **dto/**: Valida entrada con `class-validator`. Nunca expone `BigInt` crudo: entra/sale como `string`.
- **types/**: Eventos de dominio y `RawSettlement` tipados re-exportados de `@prisma/client`.

## Convenciones Críticas
- **String-to-BigInt**: `Settlement.lvyBalance: String DB -> BigInt Domain -> String HTTP`. Ver `prisma/context.md:2`.
- **Orphan Refs**: `survivor.superiorId`, `socialLink.targetSurvivorId`, `workSlot.survivorId` deben existir en `settlement.survivors[].id`. Validación O(n) en `repository.save()`.
- **BSON Limit**: Estimación `Buffer.byteLength(JSON.stringify(snapshot))` en cada `save()`. Warning >10MB. Post-MVP externalizar `survivors`/`historyLog`.
- **Almacenes Especializados (3x3 footprint, 100 slots, maxStack 300)**:
  - `GET /settlements/:id/warehouses`: Obtiene los almacenes persistidos en el asentamiento.
  - `POST /settlements/:id/warehouses`: Valida huella 3×3, límites por capítulo de civilización (Cap 1-2: 1, Cap 3: 2, Cap 4: 5, Cap 5+: sin límite) y crea el almacén con 100 casillas.
  - `POST /settlements/:id/warehouses/:warehouseId/deposit`: Valida server-side la categoría del ítem (`mineral`, `madera`, `comida`), pila máxima de 300 por casilla y límite de 100 slots.
  - `POST /settlements/:id/warehouses/:warehouseId/withdraw`: Valida disponibilidad y retira cantidades autoritativamente.

## Flujo Típico
`Controller -> Service (DTO) -> Repository.findById -> Domain.execute* -> pullEvents -> emit -> Repository.save(snapshot)`

## Dependencias
- `PrismaModule`
- `EventEmitter2` (solo emite, no escucha aquí)
