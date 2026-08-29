# Common Module — Contexto de Arquitectura

## Propósito
Utilidades transversales agnósticas: interceptores, filtros, guards y helpers compartidos por todos los módulos de feature.

## Estructura
```
common/
  context.md
  interceptors/
    bigint-serializer.interceptor.ts
  filters/
  guards/
```

## Componentes Clave
- **bigint-serializer.interceptor.ts**: `NestInterceptor` global que serializa respuestas JSON. Convierte todo `bigint` residual a `string` antes de `JSON.stringify` para evitar `Do not know how to serialize a BigInt`. Aplica a todos los controllers y gateways HTTP. Debe registrarse como `APP_INTERCEPTOR`.

## Convenciones
- Sin dependencias de `Prisma` o de dominio.
- Código 100% puro y testeable en aislamiento.
- Nombrado `kebab-case` para archivos, `PascalCase` para clases.
