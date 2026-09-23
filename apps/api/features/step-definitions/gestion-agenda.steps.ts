import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { ConflictError } from "../../src/domain/errors.js";
import {
  findBookingConflict,
} from "../../src/domain/scheduling/appointment-rules.js";
import { timeRangesOverlap } from "../../src/domain/scheduling/time-range.js";
import { appointmentRepository } from "../../src/infrastructure/db/repositories/appointment.repository.js";
import { pool } from "../../src/infrastructure/db/client.js";
import { getClinicDoc } from "../../src/infrastructure/realtime/agenda-sync.js";
import { container } from "../../src/composition/container.js";
import type { SmoothFlowWorld } from "../support/world.js";

const useCases = container.appointmentUseCases;

async function countClinicAppointments(world: SmoothFlowWorld): Promise<number> {
  const result = await pool.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM "appointments" WHERE "clinic_id" = $1',
    [world.clinicId],
  );
  return result.rows[0]?.count ?? 0;
}

async function countActiveAppointmentsInBlock(
  world: SmoothFlowWorld,
  blockAlias: string,
): Promise<number> {
  const slot = world.getBlock(blockAlias);
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM "appointments"
      WHERE "clinic_id" = $1
        AND "practitioner_id" = $2
        AND "status" NOT IN ('cancelado', 'disponible')
        AND "start_at" < $4
        AND "end_at" > $3`,
    [world.clinicId, world.practitionerId, slot.startAt, slot.endAt],
  );
  return result.rows[0]?.count ?? 0;
}

async function persistFixtureAppointment(
  world: SmoothFlowWorld,
  alias: string,
  patientCode: string | null,
  blockAlias: string,
  status: "confirmado" | "bloqueado" = "confirmado",
): Promise<string> {
  const slot = world.getBlock(blockAlias);
  const created = await appointmentRepository.create({
    clinicId: world.clinicId,
    patientId: patientCode ? world.getPatientId(patientCode) : null,
    practitionerId: world.practitionerId,
    status,
    startAt: slot.startAt,
    endAt: slot.endAt,
    notes: status === "bloqueado" ? "Bloqueo fixture BDD" : "Cita fixture BDD",
    createdByUserId: world.secretaries[0].id,
  });
  world.appointments.set(alias, created.id);
  return created.id;
}

async function isBlockAvailable(world: SmoothFlowWorld, alias: string): Promise<boolean> {
  const slot = world.getBlock(alias);
  const candidates = await appointmentRepository.findConflicting(
    world.clinicId,
    world.practitionerId,
    slot.startAt,
    slot.endAt,
  );
  return findBookingConflict(candidates, slot.startAt, slot.endAt) === undefined;
}

function realtimeEvents(world: SmoothFlowWorld): Array<{
  type: string;
  appointment?: { id: string; startAt?: string; endAt?: string };
}> {
  return getClinicDoc(world.clinicId)
    .getArray("events")
    .toArray() as Array<{
      type: string;
      appointment?: { id: string; startAt?: string; endAt?: string };
    }>;
}

Given(
  "que la secretaria ha iniciado sesión en el panel de gestión de agenda",
  function (this: SmoothFlowWorld) {
    assert.ok(this.secretaries.length >= 1, "Debe existir al menos una secretaria autenticada");
    assert.equal(this.secretaries[0].role, "secretaria");
    assert.equal(this.secretaries[0].clinicId, this.clinicId);
  },
);

Given(
  'existen los pacientes "P001", "P002" y "P003"',
  function (this: SmoothFlowWorld) {
    assert.ok(this.patients.has("P001"));
    assert.ok(this.patients.has("P002"));
    assert.ok(this.patients.has("P003"));
  },
);

Given("existe el médico {string}", function (this: SmoothFlowWorld, name: string) {
  assert.equal(name, this.practitionerName);
  assert.ok(this.practitionerId);
});

Given(
  "que el bloque {string} está disponible a {int} días desde hoy a las {string}",
  function (this: SmoothFlowWorld, alias: string, days: number, time: string) {
    this.defineRelativeBlock(alias, days, time);
  },
);

Given(
  "que existe la cita {string} del paciente {string} con el médico {string} en el bloque {string} a {int} días desde hoy a las {string}",
  async function (
    this: SmoothFlowWorld,
    appointmentAlias: string,
    patientCode: string,
    practitionerName: string,
    blockAlias: string,
    days: number,
    time: string,
  ) {
    assert.equal(practitionerName, this.practitionerName);
    this.defineRelativeBlock(blockAlias, days, time);
    await persistFixtureAppointment(this, appointmentAlias, patientCode, blockAlias);
  },
);

Given(
  "que el bloque {string} está bloqueado a {int} días desde hoy a las {string}",
  async function (this: SmoothFlowWorld, blockAlias: string, days: number, time: string) {
    this.defineRelativeBlock(blockAlias, days, time);
    await persistFixtureAppointment(this, `BLOCK-${blockAlias}`, null, blockAlias, "bloqueado");
  },
);

Given(
  "que el bloque {string} está ocupado por otra cita a {int} días desde hoy a las {string}",
  async function (this: SmoothFlowWorld, blockAlias: string, days: number, time: string) {
    this.defineRelativeBlock(blockAlias, days, time);
    await persistFixtureAppointment(this, `OCCUPIED-${blockAlias}`, "P003", blockAlias);
  },
);

Given(
  "que existe un único bloque disponible {string} a {int} días desde hoy a las {string}",
  function (this: SmoothFlowWorld, blockAlias: string, days: number, time: string) {
    this.defineRelativeBlock(blockAlias, days, time);
  },
);

Given("existen dos sesiones de Secretaría autenticadas", function (this: SmoothFlowWorld) {
  assert.equal(this.secretaries.length, 2);
  assert.equal(this.secretaries[0].role, "secretaria");
  assert.equal(this.secretaries[1].role, "secretaria");
});

When(
  "la secretaria crea una cita para el paciente {string} con el médico {string} en el bloque {string}",
  async function (
    this: SmoothFlowWorld,
    patientCode: string,
    practitionerName: string,
    blockAlias: string,
  ) {
    assert.equal(practitionerName, this.practitionerName);
    const slot = this.getBlock(blockAlias);
    this.lastResult = await useCases.createAppointment(
      this.secretaries[0],
      {
        patientId: this.getPatientId(patientCode),
        practitionerId: this.practitionerId,
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
      },
      "127.0.0.1",
    );
  },
);

When(
  "la secretaria modifica la cita {string} hacia el bloque {string}",
  async function (this: SmoothFlowWorld, appointmentAlias: string, blockAlias: string) {
    const slot = this.getBlock(blockAlias);
    this.lastResult = await useCases.updateAppointment(
      this.secretaries[0],
      this.getAppointmentId(appointmentAlias),
      {
        startAt: slot.startAt.toISOString(),
        endAt: slot.endAt.toISOString(),
        status: "reagendado",
      },
      "127.0.0.1",
    );
  },
);

When(
  "la secretaria intenta crear una cita para el paciente {string} en el bloque {string}",
  async function (this: SmoothFlowWorld, patientCode: string, blockAlias: string) {
    const slot = this.getBlock(blockAlias);
    this.appointmentCountBeforeAction = await countClinicAppointments(this);
    this.lastError = null;

    try {
      this.lastResult = await useCases.createAppointment(
        this.secretaries[0],
        {
          patientId: this.getPatientId(patientCode),
          practitionerId: this.practitionerId,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
        },
        "127.0.0.1",
      );
    } catch (error) {
      this.lastError = error;
    }
  },
);

When(
  "la secretaria intenta modificar la cita {string} hacia el bloque {string}",
  async function (this: SmoothFlowWorld, appointmentAlias: string, blockAlias: string) {
    const slot = this.getBlock(blockAlias);
    this.appointmentCountBeforeAction = await countClinicAppointments(this);
    this.lastError = null;

    try {
      this.lastResult = await useCases.updateAppointment(
        this.secretaries[0],
        this.getAppointmentId(appointmentAlias),
        {
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          status: "reagendado",
        },
        "127.0.0.1",
      );
    } catch (error) {
      this.lastError = error;
    }
  },
);

When(
  "ambas sesiones intentan reservar simultáneamente el bloque {string} para los pacientes {string} y {string}",
  async function (
    this: SmoothFlowWorld,
    blockAlias: string,
    firstPatientCode: string,
    secondPatientCode: string,
  ) {
    const slot = this.getBlock(blockAlias);
    const request = (secretaryIndex: number, patientCode: string) =>
      useCases.createAppointment(
        this.secretaries[secretaryIndex],
        {
          patientId: this.getPatientId(patientCode),
          practitionerId: this.practitionerId,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
        },
        "127.0.0.1",
      );

    this.concurrentResults = await Promise.allSettled([
      request(0, firstPatientCode),
      request(1, secondPatientCode),
    ]);
  },
);

Then(
  "la cita queda registrada con estado {string}",
  function (this: SmoothFlowWorld, status: string) {
    assert.ok(this.lastResult, "La operación no devolvió una cita");
    assert.equal(this.lastResult.status, status);
    assert.equal(this.lastResult.clinicId, this.clinicId);
    assert.equal(this.lastResult.practitionerId, this.practitionerId);
  },
);

Then(
  "el bloque {string} deja de estar disponible para nuevas reservas",
  async function (this: SmoothFlowWorld, blockAlias: string) {
    assert.equal(await isBlockAvailable(this, blockAlias), false);
  },
);

Then("la creación se propaga a la agenda en tiempo real", function (this: SmoothFlowWorld) {
  assert.ok(this.lastResult);
  const events = realtimeEvents(this);
  const latest = events.at(-1);
  assert.equal(latest?.type, "appointment:created");
  assert.equal(latest?.appointment?.id, this.lastResult.id);
});

Then(
  "la cita {string} queda registrada en el bloque {string}",
  async function (this: SmoothFlowWorld, appointmentAlias: string, blockAlias: string) {
    const entity = await appointmentRepository.findById(this.getAppointmentId(appointmentAlias));
    const slot = this.getBlock(blockAlias);
    assert.ok(entity);
    assert.equal(entity.startAt.toISOString(), slot.startAt.toISOString());
    assert.equal(entity.endAt.toISOString(), slot.endAt.toISOString());
    assert.equal(entity.status, "reagendado");
  },
);

Then(
  "el bloque {string} queda disponible para nuevas reservas",
  async function (this: SmoothFlowWorld, blockAlias: string) {
    assert.equal(await isBlockAvailable(this, blockAlias), true);
  },
);

Then("la modificación se propaga a la agenda en tiempo real", function (this: SmoothFlowWorld) {
  assert.ok(this.lastResult);
  const events = realtimeEvents(this);
  const latest = events.at(-1);
  assert.equal(latest?.type, "appointment:updated");
  assert.equal(latest?.appointment?.id, this.lastResult.id);
});

Then("el sistema rechaza la operación por indisponibilidad", function (this: SmoothFlowWorld) {
  assert.ok(this.lastError instanceof ConflictError, "Se esperaba ConflictError");
  assert.equal(this.lastError.code, "DOUBLE_BOOKING");
});

Then(
  "no se crea una nueva cita en el bloque {string}",
  async function (this: SmoothFlowWorld, blockAlias: string) {
    assert.equal(await countActiveAppointmentsInBlock(this, blockAlias), 1);
  },
);

Then("la agenda mantiene su estado consistente", async function (this: SmoothFlowWorld) {
  assert.notEqual(this.appointmentCountBeforeAction, null);
  assert.equal(await countClinicAppointments(this), this.appointmentCountBeforeAction);
});

Then(
  "la cita {string} permanece en el bloque {string}",
  async function (this: SmoothFlowWorld, appointmentAlias: string, blockAlias: string) {
    const entity = await appointmentRepository.findById(this.getAppointmentId(appointmentAlias));
    const slot = this.getBlock(blockAlias);
    assert.ok(entity);
    assert.equal(entity.startAt.toISOString(), slot.startAt.toISOString());
    assert.equal(entity.endAt.toISOString(), slot.endAt.toISOString());
    assert.equal(entity.status, "confirmado");
  },
);

Then(
  "el bloque {string} continúa ocupado por una sola cita",
  async function (this: SmoothFlowWorld, blockAlias: string) {
    assert.equal(await countActiveAppointmentsInBlock(this, blockAlias), 1);
  },
);

Then("solo una de las dos operaciones queda confirmada", function (this: SmoothFlowWorld) {
  const fulfilled = this.concurrentResults.filter((result) => result.status === "fulfilled");
  assert.equal(fulfilled.length, 1);
  const winner = fulfilled[0] as PromiseFulfilledResult<{
    status: string;
  }>;
  assert.equal(winner.value.status, "confirmado");
});

Then("la otra operación es rechazada por indisponibilidad", function (this: SmoothFlowWorld) {
  const rejected = this.concurrentResults.filter((result) => result.status === "rejected");
  assert.equal(rejected.length, 1);
  const failure = rejected[0] as PromiseRejectedResult;
  assert.ok(failure.reason instanceof ConflictError);
  assert.equal(failure.reason.code, "DOUBLE_BOOKING");
});

Then(
  "existe como máximo una cita activa en el bloque {string}",
  async function (this: SmoothFlowWorld, blockAlias: string) {
    assert.equal(await countActiveAppointmentsInBlock(this, blockAlias), 1);
  },
);

Then(
  "los clientes conectados observan el mismo estado final de la agenda",
  async function (this: SmoothFlowWorld) {
    const fulfilled = this.concurrentResults.find(
      (result): result is PromiseFulfilledResult<any> => result.status === "fulfilled",
    );
    assert.ok(fulfilled);

    const events = realtimeEvents(this);
    const createdEvents = events.filter((event) => event.type === "appointment:created");
    assert.equal(createdEvents.length, 1);
    assert.equal(createdEvents[0].appointment?.id, fulfilled.value.id);

    const slot = this.getBlock("Z");
    assert.ok(
      timeRangesOverlap(
        new Date(fulfilled.value.startAt),
        new Date(fulfilled.value.endAt),
        slot.startAt,
        slot.endAt,
      ),
    );
  },
);
