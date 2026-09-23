import { eq, and, gte, lte, ne, inArray, desc } from "drizzle-orm";
import type { AppointmentStatus, AppointmentDto } from "@smoothflow/shared";
import { db } from "../client.js";
import {
  appointments,
  appointmentEvents,
  practitioners,
  specialties,
  patients,
  scheduleTemplates,
  clinics,
} from "../schema.js";
import type { AppointmentEntity } from "../../../domain/entities.js";
import { ConflictError } from "../../../domain/errors.js";
import type {
  AppointmentRepository,
  AppointmentListFilters,
  NewAppointment,
  AppointmentChanges,
  NewAppointmentEvent,
  AvailabilityData,
} from "../../../domain/ports/appointment.repository.js";

type AppointmentRow = typeof appointments.$inferSelect;

function rethrowBookingWriteError(error: unknown): never {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  // 23P01 = exclusion_violation. La restricción PostgreSQL protege
  // la agenda incluso si dos solicitudes superan simultáneamente
  // la verificación previa de disponibilidad.
  if (code === "23P01") {
    throw new ConflictError("El horario ya está ocupado o bloqueado", "DOUBLE_BOOKING");
  }

  throw error;
}

function toEntity(row: AppointmentRow): AppointmentEntity {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    practitionerId: row.practitionerId,
    status: row.status,
    startAt: row.startAt,
    endAt: row.endAt,
    notes: row.notes,
    pendingReschedule: row.pendingReschedule
      ? {
          startAt: new Date(row.pendingReschedule.startAt),
          endAt: new Date(row.pendingReschedule.endAt),
        }
      : null,
    createdByUserId: row.createdByUserId,
    requestedByUserId: row.requestedByUserId,
    requestReason: row.requestReason,
    reviewedByUserId: row.reviewedByUserId,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDto(row: AppointmentRow, extras?: Partial<AppointmentDto>): AppointmentDto {
  return {
    id: row.id,
    clinicId: row.clinicId,
    patientId: row.patientId,
    practitionerId: row.practitionerId,
    status: row.status,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    notes: row.notes,
    pendingReschedule: row.pendingReschedule,
    createdByUserId: row.createdByUserId,
    requestReason: row.requestReason,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...extras,
  };
}

export const appointmentRepository: AppointmentRepository = {
  async findById(id: string): Promise<AppointmentEntity | null> {
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return row ? toEntity(row) : null;
  },

  async findConflicting(clinicId, practitionerId, startAt, endAt) {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          eq(appointments.practitionerId, practitionerId),
          ne(appointments.status, "cancelado"),
          lte(appointments.startAt, endAt),
          gte(appointments.endAt, startAt),
        ),
      );
    return rows.map((r) => ({ id: r.id, status: r.status, startAt: r.startAt, endAt: r.endAt }));
  },

  async findBlockingCandidates(clinicId, practitionerId, startAt, endAt) {
    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          eq(appointments.practitionerId, practitionerId),
          inArray(appointments.status, ["confirmado", "reservado", "reagendado"]),
          lte(appointments.startAt, endAt),
          gte(appointments.endAt, startAt),
        ),
      );
    return rows.map((r) => ({ id: r.id, status: r.status, startAt: r.startAt, endAt: r.endAt }));
  },

  async list(filters: AppointmentListFilters): Promise<AppointmentDto[]> {
    const conditions = [];
    if (filters.clinicId) conditions.push(eq(appointments.clinicId, filters.clinicId));
    if (filters.practitionerId) {
      conditions.push(eq(appointments.practitionerId, filters.practitionerId));
    }
    if (filters.patientId) conditions.push(eq(appointments.patientId, filters.patientId));
    if (filters.from) conditions.push(gte(appointments.startAt, new Date(filters.from)));
    if (filters.to) conditions.push(lte(appointments.startAt, new Date(filters.to)));

    const rows = await db
      .select({
        appointment: appointments,
        patientGiven: patients.givenName,
        patientFamily: patients.familyName,
        practitionerGiven: practitioners.givenName,
        practitionerFamily: practitioners.familyName,
        specialtyName: specialties.name,
      })
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
      .innerJoin(specialties, eq(practitioners.specialtyId, specialties.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(appointments.startAt);

    return rows.map((r) =>
      toDto(r.appointment, {
        patientName: r.patientGiven ? `${r.patientGiven} ${r.patientFamily}` : undefined,
        practitionerName: `${r.practitionerGiven} ${r.practitionerFamily}`,
        specialtyName: r.specialtyName,
      }),
    );
  },

  async create(data: NewAppointment): Promise<AppointmentEntity> {
    try {
      const [created] = await db
        .insert(appointments)
        .values({
          clinicId: data.clinicId,
          patientId: data.patientId ?? null,
          practitionerId: data.practitionerId,
          status: data.status,
          startAt: data.startAt,
          endAt: data.endAt,
          notes: data.notes ?? null,
          createdByUserId: data.createdByUserId ?? null,
        })
        .returning();
      return toEntity(created);
    } catch (error) {
      return rethrowBookingWriteError(error);
    }
  },

  async update(id: string, changes: AppointmentChanges): Promise<AppointmentEntity> {
    const { pendingReschedule, ...rest } = changes;
    try {
      const [updated] = await db
        .update(appointments)
        .set({
          ...rest,
          ...(pendingReschedule !== undefined
            ? {
                pendingReschedule: pendingReschedule
                  ? {
                      startAt: pendingReschedule.startAt.toISOString(),
                      endAt: pendingReschedule.endAt.toISOString(),
                    }
                  : null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, id))
        .returning();
      return toEntity(updated);
    } catch (error) {
      return rethrowBookingWriteError(error);
    }
  },

  async addEvent(event: NewAppointmentEvent): Promise<void> {
    await db.insert(appointmentEvents).values({
      appointmentId: event.appointmentId,
      userId: event.userId ?? null,
      previousStatus: event.previousStatus ?? null,
      newStatus: event.newStatus,
      metadata: event.metadata,
    });
  },

  async findPreviousStatusOfLatestRequest(appointmentId: string): Promise<AppointmentStatus | null> {
    const [requestEvent] = await db
      .select()
      .from(appointmentEvents)
      .where(
        and(
          eq(appointmentEvents.appointmentId, appointmentId),
          eq(appointmentEvents.newStatus, "cancelacion_pendiente"),
        ),
      )
      .orderBy(desc(appointmentEvents.createdAt))
      .limit(1);
    return requestEvent?.previousStatus ?? null;
  },

  async listStatusesForDay(clinicId, dayStart, dayEnd): Promise<AppointmentStatus[]> {
    const rows = await db
      .select({ status: appointments.status })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          gte(appointments.startAt, dayStart),
          lte(appointments.startAt, dayEnd),
        ),
      );
    return rows.map((r) => r.status);
  },

  async getAvailabilityData(clinicId, query): Promise<AvailabilityData> {
    const [clinicRow] = await db
      .select({ timezone: clinics.timezone })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1);
    const timezone = clinicRow?.timezone ?? "America/Santiago";

    const practitionerConditions = [eq(practitioners.clinicId, clinicId)];
    if (query.practitionerId) {
      practitionerConditions.push(eq(practitioners.id, query.practitionerId));
    }
    if (query.specialtyId) {
      practitionerConditions.push(eq(practitioners.specialtyId, query.specialtyId));
    }

    const practitionerRows = await db
      .select({
        practitioner: practitioners,
        specialtyName: specialties.name,
      })
      .from(practitioners)
      .innerJoin(specialties, eq(practitioners.specialtyId, specialties.id))
      .where(and(...practitionerConditions));

    const practitionerIds = practitionerRows.map((p) => p.practitioner.id);
    if (practitionerIds.length === 0) {
      return { practitioners: [], templates: [], booked: [], timezone };
    }

    const from = new Date(query.from);
    const to = new Date(query.to);

    const bookedRows = await db
      .select({
        appointment: appointments,
        patientGiven: patients.givenName,
        patientFamily: patients.familyName,
      })
      .from(appointments)
      .leftJoin(patients, eq(appointments.patientId, patients.id))
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          inArray(appointments.practitionerId, practitionerIds),
          lte(appointments.startAt, to),
          gte(appointments.endAt, from),
          ne(appointments.status, "cancelado"),
        ),
      );

    const templateRows = await db
      .select()
      .from(scheduleTemplates)
      .where(inArray(scheduleTemplates.practitionerId, practitionerIds));

    return {
      practitioners: practitionerRows.map((r) => ({
        id: r.practitioner.id,
        specialtyId: r.practitioner.specialtyId,
        givenName: r.practitioner.givenName,
        familyName: r.practitioner.familyName,
        specialtyName: r.specialtyName,
      })),
      templates: templateRows.map((t) => ({
        practitionerId: t.practitionerId,
        dayOfWeek: t.dayOfWeek,
        startTime: t.startTime,
        endTime: t.endTime,
        slotDurationMinutes: t.slotDurationMinutes,
      })),
      booked: bookedRows.map((r) => ({
        practitionerId: r.appointment.practitionerId,
        id: r.appointment.id,
        status: r.appointment.status,
        startAt: r.appointment.startAt,
        endAt: r.appointment.endAt,
        notes: r.appointment.notes,
        patientName: r.patientGiven ? `${r.patientGiven} ${r.patientFamily}` : undefined,
        requestReason: r.appointment.requestReason,
      })),
      timezone,
    };
  },
};
