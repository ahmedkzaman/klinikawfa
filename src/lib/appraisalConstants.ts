export const RATING_LABELS: Record<number, string> = {
  1: 'Unsatisfactory',
  2: 'Needs Improvement',
  3: 'Meets Expectations',
  4: 'Exceeds Expectations',
  5: 'Outstanding',
};

export const EVALUATOR_ROLES = ['Self', 'Manager', 'Peer', 'Nursing'] as const;

export const CLINICAL_CRITERIA = [
  { key: 'clinical_knowledge', label: 'Clinical Knowledge', description: 'Demonstrates current, evidence-based medical knowledge appropriate to specialisation.' },
  { key: 'diagnostic_accuracy', label: 'Diagnostic Accuracy', description: 'Accurately diagnoses conditions; uses appropriate investigations; demonstrates sound clinical reasoning.' },
  { key: 'treatment_planning', label: 'Treatment Planning', description: 'Develops appropriate, patient-centred treatment plans; reviews and adjusts as needed.' },
  { key: 'procedural_competence', label: 'Procedural Competence', description: 'Performs clinical procedures safely, skillfully, and within scope of practice.' },
  { key: 'clinical_documentation', label: 'Clinical Documentation', description: 'Maintains accurate, timely, and complete medical records in line with clinic standards.' },
  { key: 'guidelines_adherence', label: 'Adherence to Guidelines', description: 'Follows approved clinical protocols, guidelines, and evidence-based practice standards.' },
  { key: 'medication_management', label: 'Medication Management', description: 'Prescribes medication accurately and appropriately; monitors patient response.' },
  { key: 'emergency_response', label: 'Emergency & Acute Response', description: 'Responds effectively and calmly to emergency or acute clinical situations.' },
] as const;

export const PATIENT_CRITERIA = [
  { key: 'patient_communication', label: 'Patient Communication', description: 'Explains diagnoses, treatment options, and procedures clearly in language patients understand.' },
  { key: 'compassion_empathy', label: 'Compassion & Empathy', description: 'Demonstrates sensitivity, respect, and genuine concern for patients\' wellbeing and concerns.' },
  { key: 'informed_consent', label: 'Informed Consent', description: 'Consistently obtains valid, documented informed consent before procedures and treatments.' },
  { key: 'response_complaints', label: 'Response to Complaints', description: 'Handles patient concerns and complaints in a timely, professional, and empathetic manner.' },
  { key: 'cultural_sensitivity', label: 'Cultural Sensitivity', description: 'Adapts communication and care to meet the cultural, linguistic, and personal needs of patients.' },
] as const;

export const ATTENDANCE_CRITERIA = [
  { key: 'ontime_arrival', label: 'On-Time Arrival', description: 'Consistently arrives punctually for scheduled clinics, ward rounds, and meetings.' },
  { key: 'schedule_adherence', label: 'Clinic Schedule Adherence', description: 'Manages clinic flow effectively; minimises patient waiting time.' },
  { key: 'absence_notification', label: 'Notification of Absences', description: 'Provides timely, advance notice of planned absences; arranges appropriate cover.' },
  { key: 'oncall_compliance', label: 'Availability & On-Call Compliance', description: 'Fulfils on-call commitments and emergency availability requirements as expected.' },
] as const;

export const DOCTOR_KPIS = [
  { number: 1, description: 'Correct diagnosis rate', target: '100%' },
  { number: 2, description: 'Time to action for emergency cases', target: '< 5 minutes' },
  { number: 3, description: 'Positive patient feedback rate', target: '≥ 95%' },
  { number: 4, description: 'Post-procedure complication rate', target: '< 10%' },
  { number: 5, description: 'Adherence to MOH clinical guidelines', target: '100%' },
  { number: 6, description: 'Medical record documentation completeness & relevance', target: '≥ 95%' },
  { number: 7, description: 'Medical reports issued within 2 working days of request', target: '100% on time' },
  { number: 8, description: 'Antibiotic patients booked for follow-up within 1 week', target: '100%' },
  { number: 9, description: 'Insurance & medical examination cases completed within 3 working days', target: '100% on time' },
  { number: 10, description: 'Average revenue generated per patient', target: '≥ RM 150' },
  { number: 11, description: 'Positive reviews on clinic processes', target: '≥ 90%' },
  { number: 12, description: 'Clinic condition maintained to standard (cleanliness, equipment, safety)', target: '100% compliant' },
  { number: 13, description: 'Health promotion activities', target: '≥ 1 per quarter' },
] as const;

export const SECTION_WEIGHTS = {
  B: 0.3,
  C: 0.3,
  D: 0.2,
  E: 0.2,
} as const;
