import { AfterAll, Before, BeforeAll } from "@cucumber/cucumber";
import type { SessionUser } from "@smoothflow/shared";
import { db, pool } from "../../src/infrastructure/db/client.js";
import { runMigrations } from "../../src/infrastructure/db/migrate.js";
import {
  clinics,
  patients,
  practitioners,
  specialties,
  users,
} from "../../src/infrastructure/db/schema.js";
import type { SmoothFlowWorld } from "./world.js";

BeforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV !== "test" || !databaseUrl.includes("smoothflow_bdd")) {
    throw new Error(
      "Las pruebas BDD requieren NODE_ENV=test y una base dedicada smoothflow_bdd para evitar borrar datos de desarrollo.",
    );
  }
  await runMigrations();
});

Before(async function (this: SmoothFlowWorld) {
  await pool.query('TRUNCATE TABLE "clinics" CASCADE');

  const [clinic] = await db
    .insert(clinics)
    .values({ name: "Clínica BDD Foro 4", timezone: "America/Santiago" })
    .returning();

  const secretaryRows = await db
    .insert(users)
    .values([
      {
        clinicId: clinic.id,
        email: "secretaria.bdd.1@smoothflow.test",
        passwordHash: "bdd-not-used",
        role: "secretaria",
        givenName: "Secretaria",
        familyName: "Uno",
      },
      {
        clinicId: clinic.id,
        email: "secretaria.bdd.2@smoothflow.test",
        passwordHash: "bdd-not-used",
        role: "secretaria",
        givenName: "Secretaria",
        familyName: "Dos",
      },
    ])
    .returning();

  const [specialty] = await db
    .insert(specialties)
    .values({
      clinicId: clinic.id,
      name: "Medicina General BDD",
      description: "Fixture Foro 4",
    })
    .returning();

  const [practitioner] = await db
    .insert(practitioners)
    .values({
      clinicId: clinic.id,
      specialtyId: specialty.id,
      givenName: "Médico",
      familyName: "A",
      email: "medico.a@smoothflow.test",
    })
    .returning();

  const patientRows = await db
    .insert(patients)
    .values([
      {
        clinicId: clinic.id,
        givenName: "Paciente",
        familyName: "P001",
        email: "p001@smoothflow.test",
      },
      {
        clinicId: clinic.id,
        givenName: "Paciente",
        familyName: "P002",
        email: "p002@smoothflow.test",
      },
      {
        clinicId: clinic.id,
        givenName: "Paciente",
        familyName: "P003",
        email: "p003@smoothflow.test",
      },
    ])
    .returning();

  this.clinicId = clinic.id;
  this.specialtyId = specialty.id;
  this.practitionerId = practitioner.id;
  this.secretaries = secretaryRows.map(
    (row): SessionUser => ({
      id: row.id,
      clinicId: row.clinicId,
      email: row.email,
      role: row.role,
      givenName: row.givenName,
      familyName: row.familyName,
      active: row.active,
    }),
  );
  this.patients.set("P001", patientRows[0].id);
  this.patients.set("P002", patientRows[1].id);
  this.patients.set("P003", patientRows[2].id);
});

AfterAll(async () => {
  await pool.end();
});
