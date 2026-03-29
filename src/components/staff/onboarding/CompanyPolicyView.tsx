import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface CompanyPolicyViewProps {
  userId: string;
  onComplete: () => void;
}

export function CompanyPolicyView({ userId, onComplete }: CompanyPolicyViewProps) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff_onboarding' as any)
        .update({ company_policy_acknowledged: true, is_completed: true } as any)
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Onboarding complete! Welcome to Klinik Awfa.');
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
        <CardTitle className="text-lg">Step 4: Company Policy — Read & Acknowledge</CardTitle>
        <p className="text-sm text-muted-foreground">Please read the entire document below, then confirm at the bottom.</p>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none dark:prose-invert">
        <div className="bg-muted/30 rounded-lg p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold">KLINIK AWFA</h2>
            <h3 className="text-lg font-bold mt-2">CLINIC POLICY 2026</h3>
            <p className="text-sm text-muted-foreground">Effective from 1 January 2026</p>
          </div>

          <h4 className="font-bold">AUTHORIZATION AND AMENDMENT AUTHORITY</h4>
          <p>This handbook is titled the Klinik Awfa Clinic Policy. Any previous directives, guidelines, or manuals that conflict with this document are revoked to the extent of such conflict.</p>
          <p>The Clinic Director has full authority to amend, revoke, cancel, add to, or implement any part of this policy in stages according to operational needs, regulatory compliance, and the current state of the clinic.</p>

          <h4 className="font-bold">INTRODUCTION</h4>
          <p>Welcome to Klinik Awfa. This document serves as the official guide to help you understand the work culture, operational structure, employment benefits, compliance, disciplinary procedures, and professional standards practised within the clinic.</p>
          <p>Every employee shall read, understand, and comply with all terms and conditions contained in this policy.</p>

          <h4 className="font-bold">CLINIC BACKGROUND</h4>
          <p>Klinik Awfa is a primary healthcare clinic dedicated to providing quality, accessible, and compassionate medical care. The clinic serves the local community with general practice consultations, minor procedures, pharmacy services, and health screenings.</p>
          <p><strong>Vision:</strong> To be the trusted neighbourhood clinic delivering excellent patient care through professional, compassionate, and accessible healthcare services.</p>

          <h4 className="font-bold">CULTURE AND EMPLOYEE VALUES</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Compassionate</strong> — Treat every patient with empathy, dignity, and respect.</li>
            <li><strong>Professional</strong> — Maintain the highest standards of conduct, appearance, and service.</li>
            <li><strong>Trustworthy</strong> — Handle patient data, medications, and clinic resources with integrity.</li>
            <li><strong>Safe</strong> — Follow infection control, waste disposal, and safety protocols at all times.</li>
            <li><strong>Accountable</strong> — Take responsibility for your duties and communicate proactively.</li>
            <li><strong>Team-Oriented</strong> — Support colleagues and contribute to a positive work environment.</li>
          </ul>

          <h4 className="font-bold">PART 1: GENERAL TERMS AND CONDITIONS OF EMPLOYMENT</h4>

          <h5 className="font-semibold">1. Compliance with Terms and Conditions</h5>
          <p>During the period of service, every employee is required to comply with all terms and conditions of service, clinic SOPs, safety instructions, patient confidentiality requirements, and any written directives issued by the clinic.</p>

          <h5 className="font-semibold">2. Employee Categories</h5>
          <ol className="list-decimal pl-5 space-y-1">
            <li><strong>Permanent Employee</strong> — hired on a permanent basis with a minimum probation period of three (3) months.</li>
            <li><strong>Contract Employee</strong> — hired for a specific period or project.</li>
            <li><strong>Part-Time Employee</strong> — hired according to current operational needs.</li>
            <li><strong>Trainee / Intern</strong> — a student or industrial training participant placed for a specific period.</li>
          </ol>

          <h5 className="font-semibold">3. Probation Period</h5>
          <ol className="list-decimal pl-5 space-y-1">
            <li>All new employees are subject to a minimum probation period of three (3) months.</li>
            <li>Performance evaluation during probation is based on discipline, clinical skills, patient interaction, attitude, and job suitability.</li>
            <li>The probation period may be extended, shortened, or terminated depending on evaluation results.</li>
            <li>Employees who pass the evaluation will be confirmed through written notification.</li>
          </ol>

          <h5 className="font-semibold">4. Salary Rate and Payment</h5>
          <ol className="list-decimal pl-5 space-y-1">
            <li>The salary period is monthly.</li>
            <li>Salary payments are credited directly to the employee's bank account.</li>
            <li>Salary payment date is typically no later than the 7th of the following month.</li>
          </ol>

          <h5 className="font-semibold">5. Other Provisions</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Tax, EPF, SOCSO, EIS</strong> — Every employee is subject to the relevant laws at current rates.</li>
            <li><strong>Attendance Records</strong> — All employees must record attendance through the designated system. Manipulating attendance records is serious misconduct.</li>
            <li><strong>Working Hours</strong> — Work schedules are determined by the roster and clinic operating hours.</li>
            <li><strong>Termination/Resignation Notice</strong> — According to the period stated in the appointment letter. All resignations must be in writing.</li>
            <li><strong>Personal Information Changes</strong> — Any changes must be reported immediately.</li>
          </ul>

          <table className="w-full text-sm border mt-4">
            <caption className="text-left font-semibold mb-2">Clinic Operating Hours</caption>
            <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">Day</th><th className="p-2 text-left">Hours</th><th className="p-2 text-left">Notes</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-2 border-r">Monday – Friday</td><td className="p-2 border-r">8:30 AM – 9:30 PM</td><td className="p-2">Split shift as per roster</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Saturday</td><td className="p-2 border-r">8:30 AM – 5:00 PM</td><td className="p-2">As per roster</td></tr>
              <tr><td className="p-2 border-r">Sunday & Public Holidays</td><td className="p-2 border-r">Closed / On-call</td><td className="p-2">As directed</td></tr>
            </tbody>
          </table>

          <h4 className="font-bold mt-6">PART 2: EMPLOYMENT BENEFITS</h4>

          <h5 className="font-semibold">1. Sick Leave</h5>
          <table className="w-full text-sm border">
            <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">Length of Service</th><th className="p-2 text-left">Sick Leave Days</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-2 border-r">Less than 2 years</td><td className="p-2">14</td></tr>
              <tr className="border-b"><td className="p-2 border-r">2 years to less than 5 years</td><td className="p-2">18</td></tr>
              <tr><td className="p-2 border-r">5 years or more</td><td className="p-2">22</td></tr>
            </tbody>
          </table>

          <h5 className="font-semibold">2. Annual Leave</h5>
          <table className="w-full text-sm border">
            <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">Category</th><th className="p-2 text-left">&lt; 2 Years</th><th className="p-2 text-left">2-4 Years</th><th className="p-2 text-left">5+ Years</th></tr></thead>
            <tbody>
              <tr className="border-b"><td className="p-2 border-r">Clinical Staff</td><td className="p-2 border-r">8</td><td className="p-2 border-r">12</td><td className="p-2">16</td></tr>
              <tr className="border-b"><td className="p-2 border-r">Administrative</td><td className="p-2 border-r">10</td><td className="p-2 border-r">14</td><td className="p-2">18</td></tr>
              <tr><td className="p-2 border-r">Trainee / Intern</td><td className="p-2 border-r" colSpan={3}>As per offer letter</td></tr>
            </tbody>
          </table>

          <h5 className="font-semibold">3. Other Benefits</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Medical Benefits</strong> — Staff and immediate family receive subsidised consultations at Klinik Awfa.</li>
            <li><strong>Maternity Leave</strong> — As per Malaysian law.</li>
            <li><strong>Paternity Leave</strong> — As per current legislation.</li>
            <li><strong>Compassionate Leave</strong> — Up to 3 days for the death of an immediate family member.</li>
            <li><strong>Emergency Leave</strong> — For unavoidable situations; notify supervisor immediately.</li>
          </ul>

          <h4 className="font-bold mt-6">PATIENT CONFIDENTIALITY & DATA PROTECTION</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>All patient information, medical records, and consultation details are strictly confidential.</li>
            <li>Employees must comply with PDPA (Personal Data Protection Act 2010) at all times.</li>
            <li>Patient data must never be shared, copied, photographed, or discussed outside the clinic without proper authorisation.</li>
            <li>Any breach of patient confidentiality is considered serious misconduct and may result in immediate termination and legal action.</li>
          </ul>

          <h4 className="font-bold mt-6">INFECTION CONTROL & CLINICAL SAFETY</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Follow hand hygiene protocols strictly — wash hands before and after every patient contact.</li>
            <li>Wear appropriate PPE (gloves, mask, gown) as required by the procedure.</li>
            <li>Dispose of sharps, clinical waste, and biohazard materials according to clinic SOP.</li>
            <li>Report any needlestick injuries, exposure incidents, or safety hazards immediately.</li>
            <li>Maintain cleanliness and disinfection of all clinical areas between patients.</li>
          </ul>

          <h4 className="font-bold mt-6">DRESS CODE & APPEARANCE</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>Wear the prescribed clinic uniform or scrubs during working hours.</li>
            <li>Maintain a clean, neat, and professional appearance at all times.</li>
            <li>Name tags must be worn visibly during duty.</li>
            <li>Closed-toe shoes are mandatory in clinical areas.</li>
            <li>Attire must be modest and appropriate for a healthcare setting.</li>
          </ul>

          <h4 className="font-bold mt-6">EXAMPLES OF MISCONDUCT</h4>
          <h5 className="font-semibold">Minor Misconduct:</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Arriving late, leaving early, or not adhering to break times without permission.</li>
            <li>Failing to complete work records, patient logs, or attendance entries.</li>
            <li>Excessive use of personal phone during working hours.</li>
            <li>Not wearing prescribed uniform or PPE.</li>
            <li>Negligence causing minor disruption to clinic operations.</li>
          </ul>
          <h5 className="font-semibold">Serious Misconduct:</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Breaching patient confidentiality or sharing medical records without authorisation.</li>
            <li>Theft, fraud, falsifying records, or manipulating data.</li>
            <li>Intentionally damaging clinic property or through serious negligence.</li>
            <li>Refusing to comply with safety or infection control instructions.</li>
            <li>Sexual harassment, threats, fighting, or immoral conduct.</li>
            <li>Dispensing medications without proper authorisation.</li>
          </ul>

          <h4 className="font-bold mt-6">DISCIPLINARY PROCEDURES</h4>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Verbal warning or counselling for minor cases.</li>
            <li>Show cause letter to obtain the employee's explanation.</li>
            <li>First, second, or final written warning as required.</li>
            <li>Internal investigation for serious or recurring cases.</li>
            <li>Punishment decision based on investigation findings.</li>
          </ol>
          <h5 className="font-semibold">Forms of Punishment:</h5>
          <ul className="list-disc pl-5 space-y-1">
            <li>Warning / counselling</li>
            <li>Written warning</li>
            <li>Work suspension</li>
            <li>Demotion or position transfer</li>
            <li>Termination of service or dismissal</li>
          </ul>

          <h4 className="font-bold mt-6">TRAINING AND DEVELOPMENT</h4>
          <p>Klinik Awfa encourages continuous professional development. Training categories include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Internal training on clinic SOPs, safety protocols, and systems.</li>
            <li>On-the-job training (OJT) for clinical and administrative tasks.</li>
            <li>CPD (Continuing Professional Development) courses and certifications.</li>
            <li>External training, seminars, or workshops as approved.</li>
            <li>Compliance training — infection control, data protection, workplace safety.</li>
          </ul>

          <div className="mt-4 p-3 bg-muted/50 rounded text-sm">
            <p><strong>EMPLOYEE ACKNOWLEDGEMENT:</strong> I acknowledge that I have read, understood, and agree to comply with the Klinik Awfa Clinic Policy and any amendments made from time to time.</p>
          </div>
        </div>

        {/* Acknowledge */}
        <div className="mt-6 space-y-4 not-prose">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} />
            <span className="text-sm">I have read and understood this Clinic Policy. <span className="text-destructive">*</span></span>
          </label>
          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={!agreed || saving}>
              {saving ? 'Saving...' : 'Complete Onboarding ✓'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
