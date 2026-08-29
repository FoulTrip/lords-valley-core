# Events Module — Contexto de Arquitectura

## Propósito
Bus de eventos agnóstico y proyección en tiempo real hacia clientes (React + Phaser). Desacopla completamente el `SimulationEngine` de los WebSockets.

## Estructura
```
events/
  context.md
  events.module.ts
  game-event.gateway.ts
  game-event.listener.ts
  dto/
    game-event.dto.ts
```

## Flujo
```
SimulationEngine --(EventEmitter2)--> GameEventListener --(Server.to(room).emit)--> GameEventGateway --> Socket.io Rooms
```

## Componentes
- **game-event.gateway.ts**: `@WebSocketGateway({ namespace: 'game', cors:{origin:'*'} })`. Gestiona `handleConnection`/`handleDisconnect`, `client.join(settlementId)` para Rooms por asentamiento. Expone `@WebSocketServer() server: Server`.
- **game-event.listener.ts**: `@Injectable()` con `@OnEvent('SURVIVOR_LOYALTY_CHANGED')` etc. Traduce evento de dominio a `server.to(payload.settlementId).emit(event, payload)`. Nunca llamado directamente por el engine.
- **dto/game-event.dto.ts**: Tipos de payload `SurvivorLoyaltyChangedDto`, `ResourceExtractedDto`.

## Precisión Técnica Crítica
- **Rooms > Broadcast global**: `server.emit` está prohibido. Usar `server.to(settlementId).emit(...)` para optimizar ancho de banda. Cliente hace `socket.emit('joinSettlement', settlementId)` y gateway ejecuta `client.join`.
- Cliente React/Phaser: `io('http://localhost:3000/game')`, luego `socket.on('SURVIVOR_LOYALTY_CHANGED', handler)`.

## Dependencias
- `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@nestjs/event-emitter`.
- No depende de `SettlementRepository` ni de `Prisma`.

## Testabilidad
- Listener testeable con `EventEmitter2` mock y `server` mock.
- Gateway testeable con cliente socket.io de prueba en `test/e2e`.
