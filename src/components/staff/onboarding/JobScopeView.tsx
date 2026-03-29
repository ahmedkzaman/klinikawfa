import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface JobScopeViewProps {
  userId: string;
  onComplete: () => void;
}

export function JobScopeView({ userId, onComplete }: JobScopeViewProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff_onboarding' as any)
        .update({ job_scope_acknowledged: true } as any)
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Job Scope acknowledged!');
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
        <CardTitle className="text-lg">Step 3: Job Scope — Read & Acknowledge</CardTitle>
        <p className="text-sm text-muted-foreground">Please read the entire document below, then confirm at the bottom.</p>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none dark:prose-invert">
        <div className="bg-muted/30 rounded-lg p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">KLINIK AWFA</h2>
            <h3 className="text-lg font-bold mt-2">JOB SCOPE DOCUMENT</h3>
          </div>

          <table className="w-full text-sm border">
            <tbody>
              <tr className="border-b"><td className="p-2 font-medium border-r">Position</td><td className="p-2">Clinic Staff / Healthcare Assistant</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Department</td><td className="p-2">Clinical Operations & Administration</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Employment Type</td><td className="p-2">Full-Time / Part-Time / Internship</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Location</td><td className="p-2">Klinik Awfa, Bangi</td></tr>
              <tr className="border-b"><td className="p-2 font-medium border-r">Reports To</td><td className="p-2">Clinic Manager / Doctor-in-Charge</td></tr>
              <tr><td className="p-2 font-medium border-r">Version</td><td className="p-2">v1.0 — March 2026</td></tr>
            </tbody>
          </table>

          <h4 className="font-bold">01 PRIMARY GOAL & MISSION</h4>
          <p>This role exists to ensure Klinik Awfa delivers seamless, high-quality healthcare services to every patient. The Clinic Staff / Healthcare Assistant supports clinical operations, manages patient flow, assists with pharmacy operations, and maintains the clinic environment — ensuring patients receive prompt, professional, and compassionate care.</p>

          <h4 className="font-bold">02 CORE DUTIES & RESPONSIBILITIES</h4>

          <h5 className="font-semibold">A. Patient Registration & Reception</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Register patients accurately in the clinic system; verify IC, insurance, and contact details.</li>
            <li>Manage patient queue and minimise waiting times.</li>
            <li>Handle phone enquiries, appointment bookings, and follow-up reminders.</li>
            <li>Process patient payments and issue receipts.</li>
          </ul>

          <h5 className="font-semibold">B. Clinical Assistance</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Take and record patient vitals (BP, temperature, weight, SpO2).</li>
            <li>Prepare consultation rooms with required instruments and supplies.</li>
            <li>Assist doctors during examinations and minor procedures.</li>
            <li>Perform basic wound dressing, injections (if certified), and sample collection as directed.</li>
            <li>Ensure sterilisation of instruments and proper medical waste disposal.</li>
          </ul>

          <h5 className="font-semibold">C. Pharmacy & Dispensing Support</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Assist in dispensing prescribed medications under doctor supervision.</li>
            <li>Monitor stock levels, expiry dates, and reorder as needed.</li>
            <li>Label medications correctly with dosage and patient instructions.</li>
            <li>Counsel patients on proper medication usage.</li>
          </ul>

          <h5 className="font-semibold">D. Record Keeping & Documentation</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Maintain accurate patient medical records and filing systems.</li>
            <li>Process insurance claims, MC issuance, and referral letters.</li>
            <li>Update daily operational logs and inventory records.</li>
          </ul>

          <h5 className="font-semibold">E. Clinic Maintenance & Safety</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Ensure clinic cleanliness, hygiene, and a welcoming environment.</li>
            <li>Follow infection control protocols and proper waste segregation.</li>
            <li>Report equipment malfunctions and safety hazards immediately.</li>
            <li>Maintain stock of consumables (gloves, masks, dressings, etc.).</li>
          </ul>

          <h4 className="font-bold">03 BOUNDARIES & SCOPE DEFINITION</h4>
          <p className="font-semibold text-sm">✔ In-Scope:</p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>Patient registration, billing, and insurance processing</li>
            <li>Vital signs measurement and clinical assistance</li>
            <li>Pharmacy dispensing support and stock management</li>
            <li>Medical records management and documentation</li>
            <li>Clinic cleanliness and safety compliance</li>
            <li>Patient communication and follow-up coordination</li>
          </ul>
          <p className="font-semibold text-sm mt-2">✘ Out-of-Scope:</p>
          <ul className="list-disc pl-5 text-sm space-y-1">
            <li>Medical diagnosis or prescribing medications</li>
            <li>Financial approvals or procurement sign-off</li>
            <li>HR decisions — hiring, termination, salary adjustments</li>
            <li>Handling patient data outside the clinic system</li>
          </ul>

          <h4 className="font-bold">04 DECISION-MAKING AUTHORITY</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-semibold">Autonomous</p>
              <ul className="list-disc pl-5"><li>Patient registration & queue management</li><li>Routine cleaning & restocking</li><li>Daily log updates</li><li>Basic patient enquiry responses</li></ul>
            </div>
            <div>
              <p className="font-semibold">Needs Manager Acknowledgement</p>
              <ul className="list-disc pl-5"><li>Patient complaints escalation</li><li>Stock reorder requests</li><li>Schedule change requests</li><li>Equipment maintenance needs</li></ul>
            </div>
            <div>
              <p className="font-semibold">Requires Full Approval</p>
              <ul className="list-disc pl-5"><li>Procurement / purchasing</li><li>Patient data sharing externally</li><li>Leave or schedule swap</li><li>Any clinical procedure beyond scope</li></ul>
            </div>
          </div>

          <h4 className="font-bold">05 SUCCESS METRICS & KPIs</h4>
          <table className="w-full text-sm border">
            <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">KPI</th><th className="p-2 text-left">Target</th><th className="p-2 text-left">Frequency</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-2 border-r">Patient Wait Time</td><td className="p-2 border-r">Average &lt; 15 minutes</td><td className="p-2">Daily</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Patient Satisfaction</td><td className="p-2 border-r">≥ 4.5 / 5.0</td><td className="p-2">Monthly</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Attendance & Punctuality</td><td className="p-2 border-r">≥ 95%</td><td className="p-2">Monthly</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Medication Accuracy</td><td className="p-2 border-r">Zero dispensing errors</td><td className="p-2">Daily</td></tr>
              <tr><td className="p-2 border-r">Record Completeness</td><td className="p-2 border-r">100% same-day filing</td><td className="p-2">Daily</td></tr>
            </tbody>
          </table>

          <h4 className="font-bold">06 WEEKLY RHYTHM & TIME ALLOCATION</h4>
          <table className="w-full text-sm border">
            <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">Focus Area</th><th className="p-2 text-left">Key Activities</th><th className="p-2 text-left">Est. Time</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-2 border-r">Patient Care & Clinical</td><td className="p-2 border-r">Vitals, assisting doctors, wound care</td><td className="p-2">~40%</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Front Desk & Registration</td><td className="p-2 border-r">Check-in, billing, phone calls</td><td className="p-2">~25%</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Pharmacy Support</td><td className="p-2 border-r">Dispensing, stock checks, labelling</td><td className="p-2">~20%</td></tr>
              <tr><td className="p-2 border-r">Admin & Maintenance</td><td className="p-2 border-r">Filing, cleaning, restocking</td><td className="p-2">~15%</td></tr>
            </tbody>
          </table>

          <div className="mt-4 p-3 bg-muted/50 rounded text-sm">
            <p><strong>Acknowledgement:</strong> This job scope document outlines the primary responsibilities, authority levels, and success metrics for this position at Klinik Awfa. It is intended as a living document and may be revised as the clinic evolves. Both parties should review and sign upon onboarding.</p>
          </div>
        </div>

        {/* Acknowledge */}
        <div className="mt-6 space-y-4 not-prose">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} />
            <span className="text-sm">I have read and understood this Job Scope document. <span className="text-destructive">*</span></span>
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
