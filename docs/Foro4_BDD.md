# Foro 4 — Pruebas BDD con glue code

## Caso de uso seleccionado

Se mantiene el caso de uso trabajado en el Foro 3:

**UC5 — Gestionar Agenda (Crear / Modificar / Cancelar Cita)**.

Actor principal: **Secretaria**. El objetivo es validar comportamiento real de creación y modificación de citas, disponibilidad de bloques, consistencia ante errores y concurrencia.

## Ajuste de escenarios requerido por el Foro 4

El Foro 4 exige exactamente:

- 2 escenarios positivos.
- 2 escenarios negativos.
- 1 escenario de frontera.

En el Foro 3, el conjunto principal tenía tres escenarios positivos (crear, modificar y cancelar), un escenario negativo que agrupaba **crear o modificar con un horario no disponible**, y un escenario de frontera de concurrencia.

Para cumplir la distribución requerida **se agregó explícitamente un segundo escenario negativo**:

> **Modificar una cita hacia un horario ocupado.**

Este escenario no introduce una regla de negocio nueva. Se deriva del escenario negativo previo “Horario no disponible”, que ya indicaba que el sistema debía rechazar tanto una creación como una modificación cuando el bloque solicitado estuviera ocupado o bloqueado. En Foro 4 ese comportamiento combinado se desdobla en dos pruebas independientes.

El conjunto automatizado queda así:

| # | Escenario | Clasificación | Origen |
|---|---|---|---|
| 1 | Crear una cita en bloque disponible | Positivo | Foro 3 |
| 2 | Modificar una cita hacia bloque disponible | Positivo | Foro 3 |
| 3 | Rechazar creación en bloque bloqueado | Negativo | Foro 3, escenario “Horario no disponible” |
| 4 | Modificar una cita hacia horario ocupado | Negativo | **Agregado en Foro 4**, derivado del escenario negativo combinado del Foro 3 |
| 5 | Evitar doble reserva concurrente | Frontera | Foro 3 |

El escenario positivo de **cancelar una cita** del Foro 3 se conserva como antecedente documental, pero no forma parte de los cinco escenarios seleccionados para esta entrega porque el Foro 4 exige solo dos positivos.

## Enfoque técnico

La implementación usa **Cucumber.js + TypeScript**. Los archivos `.feature` se conectan mediante step definitions (glue code) con los casos de uso reales del backend.

Las pruebas no validan una simulación de la lógica de agenda. Ejecutan:

```text
Gherkin (.feature)
       ↓
Glue code Given / When / Then
       ↓
createAppointmentUseCases(...)
       ↓
AppointmentRepository real
       ↓
PostgreSQL
       ↓
AgendaSync real (Yjs)
```

Los escenarios utilizan fechas relativas al día de ejecución para evitar que queden obsoletos por tener fechas fijas en el pasado.

## Ciclo BDD reflejado en el historial Git

La implementación se realiza en etapas separadas:

1. **Escenarios escritos:** se incorpora primero el archivo `.feature`.
2. **Pasos no implementados:** en esa etapa Cucumber no dispone todavía del glue code.
3. **Glue code:** se agregan las definiciones Given–When–Then y los hooks de base de datos.
4. **Ejecución contra la funcionalidad existente:** el escenario de concurrencia expone que verificar disponibilidad y luego insertar no es una operación atómica.
5. **Ajuste funcional:** se agrega una restricción transaccional a nivel PostgreSQL para impedir solapamientos activos incluso ante dos solicitudes simultáneas.
6. **Escenarios en verde:** los cinco escenarios deben finalizar correctamente.

## Ejecución local

Las pruebas usan una base PostgreSQL **dedicada** llamada `smoothflow_bdd` en el puerto `5434`. Los hooks de Cucumber rechazan la ejecución si no se detecta el entorno de pruebas, porque antes de cada escenario se limpian los fixtures.

Desde la raíz del repositorio:

```bash
pnpm install
pnpm bdd:db:up
pnpm test:bdd
pnpm bdd:db:down
```

El comando `pnpm test:bdd`:

1. compila `@smoothflow/shared`;
2. ejecuta Cucumber.js con TypeScript mediante `tsx`;
3. aplica las migraciones reales de PostgreSQL;
4. prepara datos aislados por escenario;
5. ejecuta los cinco escenarios contra los casos de uso y repositorios reales.

También puede reemplazarse la URL de la base BDD:

```bash
BDD_DATABASE_URL=postgresql://usuario:clave@host:puerto/smoothflow_bdd pnpm test:bdd
```

## Resultado verificado

La ejecución automatizada en GitHub Actions fue validada correctamente con PostgreSQL 16:

```text
5 scenarios (5 passed)
46 steps (46 passed)
```

Además, en la misma ejecución finalizaron correctamente:

- pruebas unitarias existentes;
- typecheck del monorepo;
- instalación con `pnpm install --frozen-lockfile`;
- los cinco escenarios BDD.

## Glue code

Los vínculos Given–When–Then están implementados en:

```text
apps/api/features/step-definitions/gestion-agenda.steps.ts
```

El estado compartido de Cucumber está en:

```text
apps/api/features/support/world.ts
```

y la preparación/limpieza de PostgreSQL en:

```text
apps/api/features/support/hooks.ts
```

La característica Gherkin está en:

```text
apps/api/features/gestion-agenda.feature
```

## Ajuste funcional descubierto por BDD

El escenario de frontera exige que dos solicitudes simultáneas sobre el mismo bloque no produzcan dos citas confirmadas. La implementación original verificaba primero la disponibilidad y después realizaba el `INSERT`. Bajo concurrencia, ambas solicitudes podían superar la consulta previa antes de que alguna persistiera la cita.

Se agregó la migración:

```text
apps/api/src/infrastructure/db/migrations/0002_forum4_no_double_booking.sql
```

Esta incorpora una restricción `EXCLUDE USING gist` sobre clínica, médico y rango temporal para impedir solapamientos de citas activas directamente en PostgreSQL. Si dos operaciones compiten, una queda persistida y la otra genera la violación `23P01`, que el repositorio traduce al error de dominio:

```text
ConflictError
code: DOUBLE_BOOKING
```

De esta forma la prevención de doble reserva no depende únicamente de una consulta previa y se mantiene correcta ante concurrencia real.

## Evidencia recomendada para el video

Para el video de entrega basta con mostrar:

1. `apps/api/features/gestion-agenda.feature`, destacando los tags `@positivo`, `@negativo` y `@frontera`.
2. La nota `@agregado-foro4` del escenario **Modificar una cita hacia un horario ocupado**, explicando que se agregó para obtener los 2 negativos requeridos.
3. `gestion-agenda.steps.ts` para mostrar el glue code.
4. La migración `0002_forum4_no_double_booking.sql` como ajuste de funcionalidad descubierto por el caso de frontera.
5. Ejecutar:
   ```bash
   pnpm bdd:db:up
   pnpm test:bdd
   ```
6. Mostrar al final:
   ```text
   5 scenarios (5 passed)
   46 steps (46 passed)
   ```
7. Finalizar con:
   ```bash
   pnpm bdd:db:down
   ```

La workflow `.github/workflows/foro4-verify.yml` deja además evidencia reproducible de la ejecución automática.
