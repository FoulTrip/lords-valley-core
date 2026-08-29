# Prisma Module — Contexto de Arquitectura

## Propósito
Única capa de acceso a MongoDB. Encapsula `PrismaClient` y expone `PrismaService` como provider global para todos los repositorios.

## Estructura
```
prisma/
  context.md
  prisma.module.ts
  prisma.service.ts
```

## Reglas
- `PrismaService extends PrismaClient` implementa `OnModuleInit` (`$connect`) y `OnModuleDestroy` (`$disconnect`). Logs `['query','info','warn','error']` activos en dev.
- Marcado como `@Global()` para inyección en cualquier módulo sin re-importar.
- Ningún otro archivo debe instanciar `new PrismaClient()` directamente.
- Cambios de esquema en dev: `npx prisma db push` (no `migrate` — incompatible con MongoDB).

## Relación con Schema
- Modelos raíz físicos: `Player`, `Settlement`, `GlobalMapChunk` (ver `prisma/schema.prisma:175-242`).
- Tipos embebidos: `Survivor`, `Building`, `Resource`, `HistoryLog` y subtipos — viven dentro de `Settlement`.
- Convención BigInt: todo campo monetario/experiencia es `String` en Prisma y `bigint` en Domain (ver `prisma/context.md:2`).
