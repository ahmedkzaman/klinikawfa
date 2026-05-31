import { Link } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { bento, pageInner, pageShell } from '@/lib/clinic/bentoTokens';
import { LocumRegistrationForm } from '@/components/clinic/settings/LocumRegistrationForm';

export default function LocumRegistration() {
  const { isOpsStaff, isAdmin, isSpecialAdmin } = useAuth();
  const allowed = isOpsStaff || isAdmin || isSpecialAdmin;

  if (!allowed) {
    return (
      <div className="max-w-xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Access required</AlertTitle>
          <AlertDescription>
            You need front-desk (Ops Staff) or admin privileges to register a locum.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className={pageInner}>
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100">
            <Link to="/clinic/settings">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Settings
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-primary" />
            Register Locum Doctor
          </h1>
          <p className="text-sm text-slate-500">
            Create a Locum account so the doctor can log in immediately.
          </p>
        </div>

        <Card className={bento}>
          <CardContent className="p-6 max-w-xl">
            <LocumRegistrationForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
