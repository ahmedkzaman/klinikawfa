import { useState } from 'react';
import { CheckCircle2, Circle, FileText, ClipboardList, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OnboardingForm } from './OnboardingForm';
import { JobDescriptionView } from './JobDescriptionView';
import { JobScopeView } from './JobScopeView';
import { CompanyPolicyView } from './CompanyPolicyView';

interface OnboardingWizardProps {
  userId: string;
  existingData: {
    onboarding_data: Record<string, any>;
    job_description_acknowledged: boolean;
    job_scope_acknowledged: boolean;
    company_policy_acknowledged?: boolean;
  } | null;
  onComplete: () => void;
}

const steps = [
  { label: 'Onboarding Form', icon: ClipboardList },
  { label: 'Job Description', icon: FileText },
  { label: 'Job Scope', icon: FileText },
  { label: 'Company Policy', icon: Shield },
];

export function OnboardingWizard({ userId, existingData, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(() => {
    if (existingData?.onboarding_data && Object.keys(existingData.onboarding_data).length > 0) {
      if (existingData.job_scope_acknowledged) return 3;
      if (existingData.job_description_acknowledged) return 2;
      return 1;
    }
    return 0;
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Staff Onboarding</h1>
        <p className="text-muted-foreground">Please complete all 4 steps before accessing the dashboard.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
        {steps.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={step.label} className="flex items-center gap-1">
              {i > 0 && <div className={cn('h-px w-4 sm:w-10', done ? 'bg-primary' : 'bg-border')} />}
              <div className={cn(
                'flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors',
                done && 'text-primary',
                active && 'bg-primary/10 text-primary',
                !done && !active && 'text-muted-foreground'
              )}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {currentStep === 0 && (
        <OnboardingForm userId={userId} onComplete={() => setCurrentStep(1)} />
      )}
      {currentStep === 1 && (
        <JobDescriptionView userId={userId} onComplete={() => setCurrentStep(2)} />
      )}
      {currentStep === 2 && (
        <JobScopeView userId={userId} onComplete={() => setCurrentStep(3)} />
      )}
      {currentStep === 3 && (
        <CompanyPolicyView userId={userId} onComplete={onComplete} />
      )}
    </div>
  );
}
