# 📖 Contexto de Arquitectura y Convenciones del Esquema Prisma

Este documento detalla las reglas de diseño, decisiones técnicas y restricciones de negocio aplicadas al archivo `schema.prisma` para Lords Valley MVP.

---

## 🏛️ 1. Paradigma de Diseño: Aggregate Root (NoSQL + POO)

Para optimizar la Simulación Persistente Offline (Fase 8) y evitar consultas con joins virtuales lentos, el esquema utiliza el patrón de Raíz del Agregado (Aggregate Root).

- **Colecciones Raíz Independientes:** Solo existen tres colecciones físicas en MongoDB: `Player`, `Settlement` y `GlobalMapChunk`.
- **Composición Jerárquica:** Las entidades `Survivor`, `Building`, `Resource` e `HistoryLog` son Tipos Compuestos (`type`) embebidos directamente dentro de `Settlement`.
- **Impacto en el Core:** Al consultar un asentamiento, el cliente de Prisma recupera en un solo viaje de memoria todo el estado del mundo necesario para ejecutar las fórmulas matemáticas del tiempo ausente.

---

## 🪙 2. Convención Financiera y Web3 (Estrategia String-to-BigInt)

MongoDB almacena los enteros grandes como BSON Long (64 bits firmados), lo que limita el valor máximo a 9.22 × 10¹⁸. Si el token del juego (LVY) utiliza 18 decimales (estándar Web3 para KodeChain), un usuario solo podría acumular un máximo de ~9.22 monedas antes del desbordamiento (overflow).

**Reglas de Implementación Obligatorias:**

- **Campos Afectados:** `Settlement.lvyBalance`, `Settlement.maxLvyStorage`, `Survivor.lvyBalance`, `Profession.experience` y `Resource.quantity`.
- **Almacenamiento (DB):** Se guardan estrictamente como `String` con valor por defecto `"0"`.
- **Operación (Core NestJS):** Al instanciar las Clases de Dominio, estos campos deben ser casteados a `BigInt` nativo de JavaScript (`BigInt(campoStr)`) para realizar la matemática de producción, consumo y quema (mint/burn) de forma segura.
- **Persistencia:** Antes de guardar con Prisma, se debe invocar `.toString()` sobre el valor de 256 bits.

```ts
// Ejemplo de uso correcto en el Core
const balance = BigInt(settlement.lvyBalance); // "1000000000000000000" -> 1n * 10^18
const nextBalance = balance + BigInt(500);
await prisma.settlement.update({
  where: { id },
  data: { lvyBalance: nextBalance.toString() }
});
```

---

## 🛡️ 3. Restricciones de Integridad y Validación Cruzada (Orphan Refs)

Al utilizar tipos embebidos en MongoDB, Prisma no genera llaves foráneas (FK) ni restricciones de integridad referencial nativas para las relaciones internas. El Core de NestJS debe auto-regularse.

**Matriz de Referencias Huérfanas de Alto Riesgo:**

| Campo en el Tipo Compuesto | Tipo de Dato | Entidad de Referencia Requerida |
| :--- | :--- | :--- |
| `Survivor.superiorId` | `String?` | Debe existir en `Settlement.survivors[].id` (Árbol de mando) |
| `SocialLink.targetSurvivorId` | `String` | Debe existir en `Settlement.survivors[].id` |
| `WorkSlot.survivorId` | `String` | Debe existir en `Settlement.survivors[].id` |

**Mecanismo de Mitigación (MVP):**

Toda operación de escritura (`create`, `update`) en el repositorio de asentamientos debe pasar obligatoriamente por el validador de dominio (`src/settlement/domain/settlement.validator.ts`). Este ejecuta una inspección en memoria de coste O(n) garantizando que no se guarden identificadores de NPCs inexistentes o eliminados.

```ts
// Pseudo-código del validador
function validateOrphanRefs(settlement: Settlement) {
  const validIds = new Set(settlement.survivors.map(s => s.id));
  for (const b of settlement.buildings) {
    for (const slot of b.workSlots) {
      if (!validIds.has(slot.survivorId)) throw new Error(`Orphan WorkSlot: ${slot.survivorId}`);
    }
  }
  // ... validar superiorId y socialLinks
}
```

---

## 📈 4. Gestión de Escala y Umbral de Fragmentación (Mitigación de los 16MB)

MongoDB impone un límite estricto de 16MB por documento BSON. En partidas de late game, el crecimiento lineal de los arreglos embebidos puede degradar el rendimiento o corromper el almacenamiento.

**Políticas de Monitoreo:**

- **GlobalMapChunk Separado:** Las matrices de terreno (`tiles`) y la distribución de recursos naturales jamás se embeben en el asentamiento; viven en su propia colección con un índice único compuesto `@@unique([chunkX, chunkY])`.
- **El Umbral de los 10MB:** La capa de persistencia de NestJS debe evaluar el peso estimado del JSON del asentamiento. Si `JSON.stringify(settlement).length > 10_000_000` (10MB), se activa la alerta de migración arquitectónica.

```ts
const size = Buffer.byteLength(JSON.stringify(settlement), 'utf8');
if (size > 10_000_000) {
  logger.warn(`Settlement ${settlement.id} approaching BSON limit: ${size} bytes`);
  // Trigger: métrica + alerta
}
```

**Estrategia Post-MVP:** Superado el umbral, se reestructurará el esquema migrando `Survivor` e `HistoryLog` a colecciones independientes de primer nivel utilizando relaciones `@relation` referenciadas.

---

## ⚙️ 5. Convenciones de Código y Nomenclatura

Para mantener la coherencia absoluta con el generador del cliente de Prisma, se definen los siguientes estándares de tipado:

- **Modelos Principales:** `PascalCase` (ej. `GlobalMapChunk`).
- **Tipos Compuestos:** `PascalCase` (ej. `LoyaltyEvent`).
- **Campos y Atributos:** `camelCase` (ej. `productionPriority`).
- **Enums y Constantes:** `UPPER_SNAKE_CASE` (ej. `MAESTRO_PRODUCCION`).

**Sincronización:** En entornos de desarrollo, los cambios de esquema se aplican exclusivamente mediante `npx prisma db push` para evitar la creación de archivos de migración SQL incompatibles con MongoDB.

```bash
# Flujo correcto para MongoDB
npx prisma validate
npx prisma generate
$env:DATABASE_URL="mongodb://localhost:27017/lordsvalley"; npx prisma db push
```
