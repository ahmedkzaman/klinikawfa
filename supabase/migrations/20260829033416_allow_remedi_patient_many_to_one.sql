-- Remedi can contain multiple source UI/MRN records for one real patient.
-- Preserve each source record's provenance while linking all of them to the
-- single resolved Verdamed patient. Source-side keys remain unique per batch.
ALTER TABLE private.remedi_patient_map
  DROP CONSTRAINT IF EXISTS remedi_patient_map_batch_id_patient_id_key;

CREATE INDEX IF NOT EXISTS idx_remedi_patient_map_batch_patient
  ON private.remedi_patient_map (batch_id, patient_id);
