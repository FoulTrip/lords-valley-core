# Auth Module — Contexto de Arquitectura

## Propósito
Registro, login y emisión JWT enlazando `Player` con `Settlement` 1:N. Stateless, secret vía `JWT_SECRET`.

## Estructura
```
auth/
  context.md
  auth.module.ts (`PassportModule.register({ session: false })` para el guard JWT)
  controllers/auth.controller.ts
  services/auth.service.ts
  strategies/jwt.strategy.ts
  guards/jwt-auth.guard.ts
  dto/register.dto.ts (`RegisterDto` + `LoginDto`)
```

## Flujo
- `POST /auth/register` {email,username,password} → bcrypt hash → `prisma.player.create` → JWT.
- `POST /auth/login` → verifica hash → JWT `{sub: player.id, email}`.
- `JwtAuthGuard` protege `player/me/*` (inventario y habilidades del jugador). El resto de endpoints sigue público.
- `PATCH /auth/player/:id/settings` ignora la clave `game` (estado servidor del módulo `player`); `PATCH pos` valida números finitos.
- Frontend guarda `access_token` en `localStorage`, `axios` interceptor `Authorization: Bearer`.

## Seguridad
- `passwordHash` nunca retorna en DTO.
- `@IsEmail`, `MinLength(8)` en DTO.
- `JWT_SECRET` desde `process.env.JWT_SECRET || 'dev-secret'`.
