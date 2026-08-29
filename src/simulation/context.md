# Simulation Module — Contexto de Arquitectura

## Propósito
Motor de tiempo determinista del Core. Ejecuta el loop de simulación offline/online para todos los `Settlement` activos a frecuencia fija, sin conocer detalles de WebSockets o HTTP.

## Estructura
```
simulation/
  context.md
  simulation.module.ts
  simulation.engine.ts
  services/
    simulation.service.ts
  types/
    simulation.types.ts
```

## Responsabilidades
- **simulation.engine.ts**: `@Interval(2000)` singleton. Ciclo:
  1. `repository.findAllActiveIds()`
  2. `for id: repository.findById(id) -> SettlementDomain`
  3. `domain.executeTick()` (metabolismo, calendario, sanciones invierno/contaminación)
  4. `domain.pullEvents()` -> `eventEmitter.emit(type, payload)`
  5. `repository.save(domain)`
- Manejo de errores por asentamiento: un fallo no aborta el batch. Log con `Logger`.
- No contiene lógica de negocio: delega todo al `SettlementDomain`.

## Escalabilidad
- Intervalo configurable vía `ConfigService` (default 2000ms = 1 tick económico).
- Conexiones Prisma con alcance request: no guarda estado entre ticks. Evita bloqueos por escrituras masivas concurrentes en MongoDB.
- Futuro: shard por `ownerId` o cola BullMQ si >10k settlements.

## Conexión con Otros Módulos
- Importa `SettlementModule` (solo `SettlementRepository`).
- Emite eventos locales `SURVIVOR_LOYALTY_CHANGED`, `RESOURCE_EXTRACTED`, `SETTLEMENT_TICK_COMPLETED`.
- Consumido por `EventsModule` (`GameEventListener`) para proyección a WebSockets.

## Convenciones
- No importar `@prisma/client` directamente aquí; siempre vía repository.
- No hacer `broadcast` aquí; solo `eventEmitter.emit`.
