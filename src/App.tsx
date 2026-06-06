import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";

// Pages
import Index from "./pages/Index";
import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";
import Doctors from "./pages/Doctors";
import Appointment from "./pages/Appointment";
import Gallery from "./pages/Gallery";
import HealthTips from "./pages/HealthTips";
import Auth from "./pages/Auth";
import LocumRegister from "./pages/auth/LocumRegister";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import BlogPost from "./pages/BlogPost";
import VideoCall from "./pages/VideoCall";
import VideoCallStaff from "./pages/VideoCallStaff";

// Staff Portal
import { StaffLayout } from "./components/staff/StaffLayout";
import StaffDashboard from "./pages/staff/Dashboard";
import StaffPunch from "./pages/staff/Punch";
import StaffHistory from "./pages/staff/History";
import StaffCalendar from "./pages/staff/Calendar";
import StaffLeaveRequest from "./pages/staff/LeaveRequest";
import StaffDocuments from "./pages/staff/Documents";
import PerformanceAppraisal from "./pages/staff/PerformanceAppraisal";
import AppraisalForm from "./pages/staff/AppraisalForm";
import DrRosterView from "./pages/staff/DrRosterView";
import StaffRosterView from "./pages/staff/StaffRosterView";
import StaffAdminDashboard from "./pages/staff/admin/Dashboard";
import AdminEmployees from "./pages/staff/admin/Employees";
import AdminAttendanceReview from "./pages/staff/admin/AttendanceReview";
import AdminProfileApprovals from "./pages/staff/admin/ProfileApprovals";
import StaffAttendanceReview from "./pages/staff/AttendanceReview";
import StaffProfile from "./pages/staff/Profile";
import StaffSettings from "./pages/staff/Settings";
import AdminZones from "./pages/staff/admin/Zones";
import AdminAssignments from "./pages/staff/admin/Assignments";
import AdminRequests from "./pages/staff/admin/Requests";
import AdminRoster from "./pages/staff/admin/Roster";
import AdminOnboarding from "./pages/staff/admin/Onboarding";
import PayrollSummary from "./pages/staff/admin/PayrollSummary";
import PayrollProfiles from "./pages/staff/admin/PayrollProfiles";
import DailyTaskReview from "./pages/staff/admin/DailyTaskReview";
import CircularNotices from "./pages/staff/admin/CircularNotices";
import PunchSettings from "./pages/staff/admin/PunchSettings";
import LandingPages from "./pages/staff/admin/LandingPages";
import StaffInbox from "./pages/staff/Inbox";

// Website Management (formerly /admin)
// Clinic Portal
import { ClinicProtectedRoute } from "./components/ClinicProtectedRoute";
import { ClinicLayout } from "./components/clinic/ClinicLayout";
import QueueBoard from "./pages/clinic/QueueBoard";
import PatientsList from "./pages/clinic/PatientsList";
import Consultation from "./pages/clinic/Consultation";
import ConsultationDetail from "./pages/clinic/ConsultationDetail";
import Procurement from "./pages/clinic/Procurement";
import ProcurementDashboard from "./pages/clinic/ProcurementDashboard";
import SeasonalForecast from "./pages/clinic/SeasonalForecast";
import Dispensary from "./pages/clinic/Dispensary";
import DispenseCheckout from "./pages/clinic/DispenseCheckout";
import VisitDetail from "./pages/clinic/VisitDetail";
import Billings from "./pages/clinic/Billings";
import PanelClaims from "./pages/clinic/PanelClaims";
import Inventory from "./pages/clinic/Inventory";
import RestockReview from "./pages/clinic/RestockReview";
import OweSlips from "./pages/clinic/OweSlips";
import Receivables from "./pages/clinic/Receivables";
import VoidedRecords from "./pages/clinic/VoidedRecords";
import Insight from "./pages/clinic/Insight";
import SettingsPage from "./pages/clinic/settings/SettingsPage";
import ClinicProfile from "./pages/clinic/settings/ClinicProfile";
import InClinicSettings from "./pages/clinic/settings/InClinicSettings";
import UserManagementSettings from "./pages/clinic/settings/UserManagementSettings";
import LocumRegistration from "./pages/clinic/settings/LocumRegistration";
import InventorySettings from "./pages/clinic/settings/InventorySettings";
import DiagnosisSweeper from "./pages/clinic/settings/DiagnosisSweeper";
import PanelsSettings from "./pages/clinic/settings/PanelsSettings";
import DrugLabelSettings from "./pages/clinic/settings/DrugLabelSettings";
import ChargesSettings from "./pages/clinic/settings/ChargesSettings";
import DocumentSettings from "./pages/clinic/settings/DocumentSettings";
import DocumentTemplates from "./pages/clinic/settings/DocumentTemplates";
import QueueSettings from "./pages/clinic/settings/QueueSettings";
import ProcurementSettings from "./pages/clinic/settings/ProcurementSettings";
import Appointments from "./pages/clinic/Appointments";
import QueueTV from "./pages/tv/QueueTV";

import LeadsManagement from "./pages/admin/LeadsManagement";
import BlogManagement from "./pages/admin/BlogManagement";
import BlogEditor from "./pages/admin/BlogEditor";
import GalleryManagement from "./pages/admin/GalleryManagement";
import TeamManagement from "./pages/admin/TeamManagement";
import TeamEditor from "./pages/admin/TeamEditor";
import VideoCallManagement from "./pages/admin/VideoCallManagement";
import ReviewsManagement from "./pages/admin/ReviewsManagement";
import AdminSettings from "./pages/admin/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:slug" element={<ServiceDetail />} />
              <Route path="/doctors" element={<Doctors />} />
              <Route path="/appointment" element={<Appointment />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/health-tips" element={<HealthTips />} />
              <Route path="/health-tips/:slug" element={<BlogPost />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/locum-register" element={<LocumRegister />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/video-call" element={<VideoCall />} />
              <Route path="/video-call/staff" element={<VideoCallStaff />} />
              <Route path="/tv" element={<QueueTV />} />

              {/* Staff Portal Routes */}
              <Route path="/staff" element={<StaffLayout />}>
                <Route index element={<Navigate to="/staff/dashboard" replace />} />
                <Route path="dashboard" element={<StaffDashboard />} />
                <Route path="punch" element={<StaffPunch />} />
                <Route path="history" element={<StaffHistory />} />
                <Route path="calendar" element={<StaffCalendar />} />
                <Route path="leave" element={<StaffLeaveRequest />} />
                <Route path="dr-roster" element={<DrRosterView />} />
                <Route path="staff-roster" element={<StaffRosterView />} />
                <Route path="documents" element={<StaffDocuments />} />
                <Route path="inbox" element={<StaffInbox />} />
                <Route path="attendance-review" element={<StaffAttendanceReview />} />
                <Route path="profile" element={<StaffProfile />} />
                <Route path="settings" element={<StaffSettings />} />
                <Route path="appraisal" element={<PerformanceAppraisal />} />
                <Route path="appraisal/:id" element={<AppraisalForm />} />
                <Route path="admin" element={<StaffAdminDashboard />} />
                <Route path="admin/employees" element={<AdminEmployees />} />
                <Route path="admin/zones" element={<AdminZones />} />
                <Route path="admin/assignments" element={<AdminAssignments />} />
                <Route path="admin/requests" element={<AdminRequests />} />
                <Route path="admin/roster" element={<AdminRoster />} />
                <Route path="admin/onboarding" element={<AdminOnboarding />} />
                <Route path="admin/attendance-review" element={<AdminAttendanceReview />} />
                <Route path="admin/profile-approvals" element={<AdminProfileApprovals />} />
                <Route path="admin/payroll-summary" element={<PayrollSummary />} />
                <Route path="admin/payroll-profiles" element={<PayrollProfiles />} />
                <Route path="admin/daily-tasks" element={<DailyTaskReview />} />
                <Route path="admin/notices" element={<CircularNotices />} />
                <Route path="admin/punch-settings" element={<PunchSettings />} />
                {/* Website Management */}
                <Route path="website/leads" element={<LeadsManagement />} />
                <Route path="website/team" element={<TeamManagement />} />
                <Route path="website/team/:id" element={<TeamEditor />} />
                
                <Route path="website/blog" element={<BlogManagement />} />
                <Route path="website/blog/:id" element={<BlogEditor />} />
                <Route path="website/gallery" element={<GalleryManagement />} />
                <Route path="website/reviews" element={<ReviewsManagement />} />
                <Route path="website/settings" element={<AdminSettings />} />
              </Route>

              {/* Clinic Portal Routes */}
              <Route
                path="/clinic"
                element={
                  <ClinicProtectedRoute requiredRole="any_staff">
                    <ClinicLayout />
                  </ClinicProtectedRoute>
                }
              >
                <Route index element={<Navigate to="queue" replace />} />
                <Route path="queue" element={<QueueBoard />} />
                <Route path="appointments" element={<Appointments />} />
                <Route
                  path="video-calls"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <VideoCallManagement />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="patients"
                  element={
                    <ClinicProtectedRoute requiredRole="clinical_staff">
                      <PatientsList />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="consultation"
                  element={
                    <ClinicProtectedRoute requiredRole="clinical">
                      <Consultation />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="consultation/:queueEntryId"
                  element={
                    <ClinicProtectedRoute requiredRole="clinical">
                      <ConsultationDetail />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="dispensary"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <Dispensary />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="procurement"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <Procurement />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="procurement-dashboard"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <ProcurementDashboard />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="seasonal-forecast"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <SeasonalForecast />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="queue/checkout/:queueEntryId"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <DispenseCheckout />
                    </ClinicProtectedRoute>
                  }
                />
                <Route path="visits/:queueEntryId" element={<VisitDetail />} />
                <Route
                  path="billings"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <Billings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="panel-claims"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <PanelClaims />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="receivables"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <Receivables />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="inventory"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <Inventory />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="inventory/restock-review"
                  element={
                    <ClinicProtectedRoute>
                      <RestockReview />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="owe-slips"
                  element={
                    <ClinicProtectedRoute>
                      <OweSlips />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="insight"
                  element={
                    <ClinicProtectedRoute requiredRole="insights">
                      <Insight />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <SettingsPage />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/clinic-profile"
                  element={
                    <ClinicProtectedRoute requiredRole="admin">
                      <ClinicProfile />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/preferences"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <InClinicSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/users"
                  element={
                    <ClinicProtectedRoute requiredRole="admin">
                      <UserManagementSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/locum-registration"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <LocumRegistration />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/inventory"
                  element={
                    <ClinicProtectedRoute>
                      <InventorySettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/diagnoses"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <DiagnosisSweeper />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/panels"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <PanelsSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/drug-label"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <DrugLabelSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/documents"
                  element={
                    <ClinicProtectedRoute requiredRole="admin">
                      <DocumentSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/document-templates"
                  element={
                    <ClinicProtectedRoute requiredRole="admin">
                      <DocumentTemplates />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/charges"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <ChargesSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/queue"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <QueueSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="settings/procurement-rules"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <ProcurementSettings />
                    </ClinicProtectedRoute>
                  }
                />
                <Route
                  path="voided"
                  element={
                    <ClinicProtectedRoute requiredRole="special_admin">
                      <VoidedRecords />
                    </ClinicProtectedRoute>
                  }
                />
              </Route>

              {/* Redirect old /admin routes */}
              <Route path="/admin/*" element={<Navigate to="/staff/admin" replace />} />

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
