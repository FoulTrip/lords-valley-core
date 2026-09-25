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
  skills-defs.ts (ids de 6 escuelas × 8 habilidades, `MAX_SKILL_LEVEL = 100`)
  dto/player.dto.ts (`AddItemDto`, `StackIdDto`, `TrainDto`, `GodModeDto`, `SpawnAllowDto`)
```

## Endpoints (todos exigen `Authorization: Bearer <JWT>`, operan sobre el propio player)
- `GET /player/me/inventory` → stacks del servidor
- `POST /player/me/inventory/add` {nombre?, escuela?, cantidad 1-9} → valida catálogo o alias de escuela; rechaza lo demás
- `POST /player/me/inventory/use` {stackId} → pergamino: consume 1 y aplica +10 XP a su escuela; consumible: consume 1; resto: 403 sin mutar
- `POST /player/me/inventory/consume` {nombre, cantidad 1-999} → consume unidades por nombre canónico (Fertilizante para parcelas, etc.)
- `POST /player/me/inventory/remove` {stackId} → elimina el stack
- `GET /player/me/skills` → 6 escuelas (todo inicia en nivel 0, XP 0, tier 1)
- `POST /player/me/skills/train` {escuela, skillId?} → exige 1 pergamino de esa escuela, lo consume y aplica +10 XP
- `GET /player/me/dev` → { godMode } (categoría Dev de la consola)
- `POST /player/me/dev/godmode` {on} → persiste inmunidad; el gateway de combate rechaza daño al dueño con `god_mode`
- `POST /player/me/dev/fullmode` → las 48 habilidades a nivel 100, XP 0, desbloqueadas
- `POST /player/me/dev/spawn-allow` {kind, count} → valida comandos create/spawn (npc 1-10, dead-dragon-ally/enemy 1-5, ghost 1-3); no persiste

## Reglas validadas en servidor
- `cantidad` entero 1-9 (`class-validator` + chequeo en servicio)
- `nombre` existe en el catálogo (insensible a mayúsculas/tildes); `escuela` resuelve por alias ES/EN
- `stackId` pertenece al inventario del player autenticado
- Entrenar/usar pergamino exige stock > 0 y lo descuenta en la misma operación
- `Player.settings.game` es de escritura exclusiva del servidor: `PATCH /auth/player/:id/settings` ignora esa clave

## Persistencia
Sin migración: el estado vive en `Player.settings.game = { inventory, skills, dev }`.
Al leer se sanea (stacks con forma inválida e ids de habilidad desconocidos se descartan; `dev.godMode` solo sobrevive si es `true`).
GodMode también congela hambre/sed del jugador: en v0.1 el jugador no tiene simulación de necesidades (solo los Survivors), así que la inmunidad es total por diseño + rechazo de daño en el gateway.
