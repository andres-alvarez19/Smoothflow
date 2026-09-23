-- Foro 4 / BDD: impedir double booking incluso bajo concurrencia real.
-- btree_gist permite usar igualdad sobre UUID junto con rangos temporales GiST.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_active_overlap"
  EXCLUDE USING gist (
    "clinic_id" WITH =,
    "practitioner_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" NOT IN ('cancelado', 'disponible'));
