# Player Module — Estado autoritativo del jugador

## Propósito
Inventario y habilidades del jugador con validación en servidor (JWT).
El frontend solo muestra estado del servidor y pide mutaciones por API:
editar `localStorage` o el DOM desde la consola del navegador no tiene efecto.

## Estructura
```
player/
  context.md
  player.module.ts (importa `PassportModule.register({ session: false })` para que `JwtAuthGuard` resuelva `AuthModuleOptions` en este contexto)
  player.controller.ts (`/player/me/*`, todo con `@UseGuards(JwtAuthGuard)`)
  player.service.ts (lee/escribe `Player.settings.game`, lógica pura + persistencia)
  item-catalog.ts (catálogo, pergaminos, alias de escuela, reglas de stack)
  skills-defs.ts (ids de 6 escuelas × 8 habilidades)
  dto/player.dto.ts (`AddItemDto`, `StackIdDto`, `TrainDto`)
```

## Endpoints (todos exigen `Authorization: Bearer <JWT>`, operan sobre el propio player)
- `GET /player/me/inventory` → stacks del servidor
- `POST /player/me/inventory/add` {nombre?, escuela?, cantidad 1-9} → valida catálogo o alias de escuela; rechaza lo demás
- `POST /player/me/inventory/use` {stackId} → pergamino: consume 1 y aplica +10 XP a su escuela; consumible: consume 1; resto: 403 sin mutar
- `POST /player/me/inventory/remove` {stackId} → elimina el stack
- `GET /player/me/skills` → 6 escuelas (todo inicia en nivel 0, XP 0, tier 1)
- `POST /player/me/skills/train` {escuela, skillId?} → exige 1 pergamino de esa escuela, lo consume y aplica +10 XP

## Reglas validadas en servidor
- `cantidad` entero 1-9 (`class-validator` + chequeo en servicio)
- `nombre` existe en el catálogo (insensible a mayúsculas/tildes); `escuela` resuelve por alias ES/EN
- `stackId` pertenece al inventario del player autenticado
- Entrenar/usar pergamino exige stock > 0 y lo descuenta en la misma operación
- `Player.settings.game` es de escritura exclusiva del servidor: `PATCH /auth/player/:id/settings` ignora esa clave

## Persistencia
Sin migración: el estado vive en `Player.settings.game = { inventory, skills }`.
Al leer se sanea (stacks con forma inválida e ids de habilidad desconocidos se descartan).
