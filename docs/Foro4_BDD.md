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

## Ejecución

La sección de comandos y evidencia de ejecución se completa junto con la configuración de Cucumber y CI en los commits siguientes de esta actividad.
