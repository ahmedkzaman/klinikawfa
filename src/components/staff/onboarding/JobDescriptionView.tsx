import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface JobDescriptionViewProps {
  userId: string;
  onComplete: () => void;
}

export function JobDescriptionView({ userId, onComplete }: JobDescriptionViewProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff_onboarding' as any)
        .update({ job_description_acknowledged: true } as any)
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Job Description acknowledged!');
      onComplete();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Step 2: Job Description — Read & Acknowledge</CardTitle>
        <p className="text-sm text-muted-foreground">Please read the entire document below, then confirm at the bottom.</p>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none dark:prose-invert">
        <div className="bg-muted/30 rounded-lg p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">KLINIK AWFA</h2>
            <p className="text-muted-foreground">Primary Healthcare & Family Medicine</p>
            <h3 className="text-lg font-bold mt-2">JOB DESCRIPTION</h3>
            <p className="font-semibold">Clinic Staff / Healthcare Assistant</p>
            <p className="text-sm text-muted-foreground">Clinical Operations | Patient Care | Administration</p>
          </div>

          <table className="w-full text-sm border">
            <tbody>
              <tr className="border-b"><td className="p-2 font-medium border-r">Position Title</td><td className="p-2">Clinic Staff / Healthcare Assistant</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Department</td><td className="p-2">Clinical Operations & Administration</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Employment Type</td><td className="p-2">Full-Time / Part-Time / Internship</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Location</td><td className="p-2">Klinik Awfa, Bangi</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Reports To</td><td className="p-2">Clinic Manager / Doctor-in-Charge</td></tr>
              <tr><td className="p-2 font-medium border-r">Document Version</td><td className="p-2">v1.0 — March 2026</td></tr>
            </tbody>
          </table>

          <h4 className="font-bold mt-4">01 POSITION OVERVIEW & MISSION STATEMENT</h4>
          <p>Klinik Awfa is a primary healthcare clinic committed to providing quality, accessible, and compassionate medical care to the community. The Clinic Staff / Healthcare Assistant plays a vital role in ensuring smooth daily clinic operations — from patient registration and front desk management to clinical assistance and pharmacy support.</p>
          <p><strong>Mission:</strong> To deliver excellent patient care through efficient clinic operations, compassionate service, and professional conduct at all times.</p>

          <h4 className="font-bold">02 CORE DUTIES & RESPONSIBILITIES</h4>

          <h5 className="font-semibold">A | Patient Registration & Front Desk</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Greet and register patients upon arrival; verify personal and insurance details.</li>
            <li>Manage appointment scheduling, walk-in queues, and patient flow.</li>
            <li>Answer phone calls, respond to enquiries, and manage clinic communications.</li>
            <li>Handle patient billing, payment processing, and receipt issuance.</li>
            <li>Maintain accurate patient records in the clinic management system.</li>
          </ul>

          <h5 className="font-semibold">B | Clinical Assistance</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Prepare consultation rooms and ensure all equipment is ready before each session.</li>
            <li>Take and record patient vitals (blood pressure, temperature, weight, height).</li>
            <li>Assist doctors during examinations and minor procedures as directed.</li>
            <li>Ensure proper sterilisation and disposal of medical instruments and waste.</li>
            <li>Maintain cleanliness and hygiene standards in all clinical areas.</li>
          </ul>

          <h5 className="font-semibold">C | Pharmacy & Medication Support</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Assist in dispensing medications as prescribed and under supervision.</li>
            <li>Manage medication inventory — stock checks, expiry monitoring, and reordering.</li>
            <li>Label and package medications with correct dosage instructions.</li>
            <li>Educate patients on proper medication usage and storage.</li>
          </ul>

          <h5 className="font-semibold">D | Record Keeping & Administration</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Maintain comprehensive and accurate patient medical records.</li>
            <li>File and organise documents according to clinic protocols.</li>
            <li>Assist with insurance claims, medical reports, and referral letters.</li>
            <li>Update daily logs and task board as required.</li>
          </ul>

          <h5 className="font-semibold">E | Clinic Maintenance & Safety</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ensure the clinic is clean, tidy, and welcoming at all times.</li>
            <li>Report any equipment malfunction or maintenance needs promptly.</li>
            <li>Follow infection control and waste disposal protocols strictly.</li>
            <li>Maintain stock of consumables (gloves, masks, cotton, dressings, etc.).</li>
          </ul>

          <h4 className="font-bold">03 SKILLS & QUALIFICATIONS</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h6 className="font-semibold text-sm">Clinical / Technical</h6>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Basic clinical skills (vitals, wound care)</li>
                <li>Understanding of pharmacy operations</li>
                <li>Knowledge of infection control</li>
                <li>Familiarity with clinic management systems</li>
                <li>Medical record management</li>
              </ul>
            </div>
            <div>
              <h6 className="font-semibold text-sm">Administrative</h6>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Patient billing and insurance processing</li>
                <li>Appointment scheduling</li>
                <li>Stock and inventory management</li>
                <li>Basic computer proficiency</li>
                <li>Filing and documentation</li>
              </ul>
            </div>
            <div>
              <h6 className="font-semibold text-sm">Soft Skills</h6>
              <ul className="list-disc pl-5 text-sm space-y-1">
                <li>Compassionate and patient-friendly</li>
                <li>Good communication (Malay & English)</li>
                <li>Attention to detail</li>
                <li>Ability to work under pressure</li>
                <li>Team player</li>
              </ul>
            </div>
          </div>

          <h4 className="font-bold">04 DECISION-MAKING AUTHORITY</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-semibold">🟢 Autonomous</p>
              <ul className="list-disc pl-5"><li>Patient registration</li><li>Queue management</li><li>Routine cleaning & restocking</li><li>Daily log updates</li></ul>
            </div>
            <div>
              <p className="font-semibold">🟡 Notify Manager</p>
              <ul className="list-disc pl-5"><li>Patient complaints</li><li>Stock running low</li><li>Equipment issues</li><li>Schedule changes</li></ul>
            </div>
            <div>
              <p className="font-semibold">🔴 Full Approval Required</p>
              <ul className="list-disc pl-5"><li>Medication dispensing decisions</li><li>Procurement / ordering</li><li>Handling patient data externally</li><li>Leave or schedule swap</li></ul>
            </div>
          </div>

          <h4 className="font-bold">05 KEY PERFORMANCE INDICATORS (KPIs)</h4>
          <table className="w-full text-sm border">
            <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">KPI</th><th className="p-2 text-left">Target</th><th className="p-2 text-left">Frequency</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-2 border-r">Patient Wait Time</td><td className="p-2 border-r">Average &lt; 15 minutes</td><td className="p-2">Daily</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Patient Satisfaction</td><td className="p-2 border-r">≥ 4.5 / 5.0 rating</td><td className="p-2">Monthly</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Attendance & Punctuality</td><td className="p-2 border-r">≥ 95% on-time arrival</td><td className="p-2">Monthly</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Medication Accuracy</td><td className="p-2 border-r">Zero dispensing errors</td><td className="p-2">Daily</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Record Completeness</td><td className="p-2 border-r">100% records filed same day</td><td className="p-2">Daily</td></tr>
              <tr><td className="p-2 border-r">Clinic Cleanliness</td><td className="p-2 border-r">Passes daily checklist audit</td><td className="p-2">Daily</td></tr>
            </tbody>
          </table>

          <div className="mt-4 p-3 bg-muted/50 rounded text-sm">
            <p><strong>Acknowledgement:</strong> This Job Description outlines the primary responsibilities, authority levels, and success metrics for the Clinic Staff / Healthcare Assistant role at Klinik Awfa. This is a living document and will be reviewed periodically as the clinic evolves.</p>
          </div>
        </div>

        {/* Acknowledge */}
        <div className="mt-6 space-y-4 not-prose">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} />
            <span className="text-sm">I have read and understood this Job Description document. <span className="text-destructive">*</span></span>
          </label>
          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={!agreed || saving}>
              {saving ? 'Saving...' : 'Acknowledge & Continue →'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
