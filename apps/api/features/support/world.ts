import {
  setWorldConstructor,
  World,
  type IWorldOptions,
} from "@cucumber/cucumber";
import type { AppointmentDto, SessionUser } from "@smoothflow/shared";

export interface TestSlot {
  startAt: Date;
  endAt: Date;
}

export class SmoothFlowWorld extends World {
  clinicId = "";
  practitionerId = "";
  specialtyId = "";
  practitionerName = "Médico A";
  secretaries: SessionUser[] = [];
  patients = new Map<string, string>();
  blocks = new Map<string, TestSlot>();
  appointments = new Map<string, string>();

  lastResult: AppointmentDto | null = null;
  lastError: unknown = null;
  appointmentCountBeforeAction: number | null = null;
  concurrentResults: PromiseSettledResult<AppointmentDto>[] = [];

  constructor(options: IWorldOptions) {
    super(options);
  }

  defineRelativeBlock(alias: string, daysFromNow: number, time: string): TestSlot {
    const [hourRaw, minuteRaw] = time.split(":");
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      throw new Error(`Hora inválida para el bloque ${alias}: ${time}`);
    }

    const startAt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(hour, minute, 0, 0);
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

    const slot = { startAt, endAt };
    this.blocks.set(alias, slot);
    return slot;
  }

  getBlock(alias: string): TestSlot {
    const slot = this.blocks.get(alias);
    if (!slot) throw new Error(`Bloque no definido: ${alias}`);
    return slot;
  }

  getPatientId(code: string): string {
    const id = this.patients.get(code);
    if (!id) throw new Error(`Paciente no definido: ${code}`);
    return id;
  }

  getAppointmentId(alias: string): string {
    const id = this.appointments.get(alias);
    if (!id) throw new Error(`Cita no definida: ${alias}`);
    return id;
  }
}

setWorldConstructor(SmoothFlowWorld);
