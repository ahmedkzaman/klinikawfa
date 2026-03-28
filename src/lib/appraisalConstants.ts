export const RATING_LABELS: Record<number, string> = {
  1: 'Unsatisfactory',
  2: 'Needs Improvement',
  3: 'Meets Expectations',
  4: 'Exceeds Expectations',
  5: 'Outstanding',
};

export const EVALUATOR_ROLES = ['Self', 'Manager', 'Peer', 'Nursing'] as const;

export const CA_EVALUATOR_ROLES = ['Self', 'Manager', 'Peer'] as const;

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

// ─── Clinic Assistant (CA) Constants ────────────────────────────────────────

export const CA_COMPETENCY_CATEGORIES = [
  {
    key: 'patient_management',
    label: 'A1. Patient Management & Customer Service',
    indicators: [
      { key: 'ca_greeting', label: 'Customer Service Greeting', description: 'Greets every patient warmly and professionally; makes them feel welcome and at ease.' },
      { key: 'ca_registration', label: 'Patient Registration', description: 'Registers patients accurately and promptly; verifies personal and insurance details; avoids duplicate records.' },
      { key: 'ca_scheduling', label: 'Appointment Scheduling', description: 'Manages appointment scheduling efficiently; minimises patient waiting time; handles rescheduling or cancellations properly.' },
      { key: 'ca_phone', label: 'Phone & Enquiry Handling', description: 'Answers calls promptly and courteously; provides accurate information; takes messages and follows up as needed.' },
    ],
  },
  {
    key: 'clinic_administration',
    label: 'A2. Clinic Administration',
    indicators: [
      { key: 'ca_records', label: 'Patient Records (Yezza)', description: 'Maintains accurate, up-to-date patient records in the Yezza system; ensures completeness and confidentiality.' },
      { key: 'ca_billing', label: 'Billing & Cash Handling', description: 'Processes payments accurately; handles cash, card, and insurance billing correctly; balances daily takings.' },
      { key: 'ca_vitals', label: 'Vital Signs Recording', description: 'Takes and records vital signs (BP, temp, pulse, SpO2) accurately and consistently before doctor consultation.' },
      { key: 'ca_reports', label: 'Daily Reporting', description: 'Completes daily clinic reports on time; reports any discrepancies or issues to management promptly.' },
    ],
  },
  {
    key: 'maintenance_inventory',
    label: 'A3. Maintenance & Inventory',
    indicators: [
      { key: 'ca_cleanliness', label: 'Cleanliness & Hygiene', description: 'Maintains clinic cleanliness to standard; follows infection control protocols; ensures treatment rooms are ready.' },
      { key: 'ca_stock', label: 'Stock Management (FIFO)', description: 'Manages stock using FIFO method; monitors expiry dates; ensures adequate supplies at all times.' },
      { key: 'ca_equipment', label: 'Equipment Maintenance', description: 'Performs basic equipment checks; reports faults within 24 hours; ensures all devices are functional and calibrated.' },
      { key: 'ca_inventory_checks', label: 'Weekly Inventory Checks', description: 'Conducts weekly inventory audits; reconciles stock counts; flags shortages or discrepancies immediately.' },
    ],
  },
  {
    key: 'procedure_assistance',
    label: 'A4. Procedure Assistance',
    indicators: [
      { key: 'ca_room_prep', label: 'Room & Equipment Preparation', description: 'Prepares treatment rooms and equipment before procedures; ensures sterile setup as required.' },
      { key: 'ca_consultation_support', label: 'Doctor Consultation Support', description: 'Assists doctor during consultations; prepares necessary materials; manages patient flow efficiently.' },
      { key: 'ca_procedure_assist', label: 'Procedure Assistance', description: 'Assists during minor procedures safely and competently; follows aseptic technique; hands instruments correctly.' },
      { key: 'ca_ili_swab', label: 'ILI Swab Compliance', description: 'Performs ILI swab testing accurately and in compliance with MOH guidelines; records results promptly.' },
    ],
  },
  {
    key: 'professionalism',
    label: 'A5. Additional Duties & Professionalism',
    indicators: [
      { key: 'ca_promo_videos', label: 'Monthly Promotional Videos', description: 'Produces or assists with monthly promotional content for clinic social media or patient education.' },
      { key: 'ca_patient_education', label: 'Patient Education', description: 'Educates patients on medication use, follow-up care, and preventive health as directed by the doctor.' },
      { key: 'ca_ethics_dress', label: 'Ethics & Dress Code', description: 'Adheres to clinic dress code and professional conduct standards at all times; maintains a neat appearance.' },
      { key: 'ca_teamwork', label: 'Teamwork & Initiative', description: 'Works collaboratively with colleagues; shows initiative; volunteers for tasks; supports team goals.' },
    ],
  },
] as const;

export const CA_KPIS = [
  { number: 1, description: 'Positive patient feedback rate', target: '≥ 95%' },
  { number: 2, description: 'Zero duplicate patient registrations', target: '0 duplicates' },
  { number: 3, description: 'Missed or wrongly scheduled appointments', target: '≤ 2%' },
  { number: 4, description: 'Phone answer rate (within 3 rings)', target: '≥ 95%' },
  { number: 5, description: 'Vital signs recording accuracy', target: '> 95%' },
  { number: 6, description: 'Billing accuracy (zero discrepancies)', target: '100%' },
  { number: 7, description: 'Zero cleanliness or hygiene complaints', target: '0 complaints' },
  { number: 8, description: 'Weekly stock checks completed on time', target: '100%' },
  { number: 9, description: 'Stock levels maintained above minimum threshold', target: '> 95%' },
  { number: 10, description: 'Equipment fault reports submitted within 24 hours', target: '≤ 24 hrs' },
  { number: 11, description: 'Treatment room prepared before every procedure', target: '100%' },
  { number: 12, description: 'Zero procedure assistance errors', target: '0 errors' },
  { number: 13, description: 'ILI swab compliance rate', target: '> 80%' },
  { number: 14, description: 'Monthly promotional video produced', target: '1 per month' },
  { number: 15, description: 'Daily cleanliness checklist completed', target: '100%' },
] as const;

export const CA_SECTION_WEIGHTS = {
  B: 0.3,
  C: 0.4,
  D: 0.1,
  E: 0.1,
  F: 0.1,
} as const;

export type AppraisalType = 'doctor' | 'clinic_assistant';

export const APPRAISAL_TYPE_LABELS: Record<AppraisalType, string> = {
  doctor: 'Doctor',
  clinic_assistant: 'Clinic Assistant',
};
