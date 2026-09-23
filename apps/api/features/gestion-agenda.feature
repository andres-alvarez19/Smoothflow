# language: es
@foro4 @uc5
Característica: Gestión de agenda clínica por Secretaría
  Como secretaria
  Quiero crear y modificar citas desde el panel de gestión
  Para mantener la agenda clínica consistente y sincronizada en tiempo real

  # Nota Foro 4:
  # En el Foro 3 el escenario negativo "Horario no disponible" agrupaba
  # creación y modificación. Para cumplir el requisito de 2 escenarios
  # negativos, aquí se desdobla ese comportamiento y se AGREGA de forma
  # explícita el escenario "Modificar una cita hacia un horario ocupado".
  # El conjunto automatizado queda en 2 positivos, 2 negativos y 1 frontera.

  Antecedentes:
    Dado que la secretaria ha iniciado sesión en el panel de gestión de agenda
    Y existen los pacientes "P001", "P002" y "P003"
    Y existe el médico "Médico A"

  @positivo
  Escenario: Crear una cita en un bloque horario disponible
    Dado que el bloque "A" está disponible a 7 días desde hoy a las "10:00"
    Cuando la secretaria crea una cita para el paciente "P001" con el médico "Médico A" en el bloque "A"
    Entonces la cita queda registrada con estado "confirmado"
    Y el bloque "A" deja de estar disponible para nuevas reservas
    Y la creación se propaga a la agenda en tiempo real

  @positivo
  Escenario: Modificar una cita hacia un nuevo bloque horario disponible
    Dado que existe la cita "C101" del paciente "P001" con el médico "Médico A" en el bloque "A" a 8 días desde hoy a las "10:00"
    Y que el bloque "B" está disponible a 9 días desde hoy a las "11:00"
    Cuando la secretaria modifica la cita "C101" hacia el bloque "B"
    Entonces la cita "C101" queda registrada en el bloque "B"
    Y el bloque "A" queda disponible para nuevas reservas
    Y el bloque "B" deja de estar disponible para nuevas reservas
    Y la modificación se propaga a la agenda en tiempo real

  @negativo
  Escenario: Rechazar la creación de una cita cuando el bloque está bloqueado
    Dado que el bloque "C" está bloqueado a 10 días desde hoy a las "12:00"
    Cuando la secretaria intenta crear una cita para el paciente "P001" en el bloque "C"
    Entonces el sistema rechaza la operación por indisponibilidad
    Y no se crea una nueva cita en el bloque "C"
    Y la agenda mantiene su estado consistente

  @negativo @agregado-foro4
  Escenario: Modificar una cita hacia un horario ocupado
    Dado que existe la cita "C202" del paciente "P001" con el médico "Médico A" en el bloque "A" a 11 días desde hoy a las "09:00"
    Y que el bloque "B" está ocupado por otra cita a 12 días desde hoy a las "11:00"
    Cuando la secretaria intenta modificar la cita "C202" hacia el bloque "B"
    Entonces el sistema rechaza la operación por indisponibilidad
    Y la cita "C202" permanece en el bloque "A"
    Y el bloque "B" continúa ocupado por una sola cita
    Y la agenda mantiene su estado consistente

  @frontera @concurrencia
  Escenario: Evitar doble reserva cuando dos sesiones intentan ocupar simultáneamente el último bloque disponible
    Dado que existe un único bloque disponible "Z" a 13 días desde hoy a las "10:30"
    Y existen dos sesiones de Secretaría autenticadas
    Cuando ambas sesiones intentan reservar simultáneamente el bloque "Z" para los pacientes "P001" y "P002"
    Entonces solo una de las dos operaciones queda confirmada
    Y la otra operación es rechazada por indisponibilidad
    Y existe como máximo una cita activa en el bloque "Z"
    Y los clientes conectados observan el mismo estado final de la agenda
