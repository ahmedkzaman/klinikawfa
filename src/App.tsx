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
import Dispensary from "./pages/clinic/Dispensary";
import DispenseCheckout from "./pages/clinic/DispenseCheckout";
import Billings from "./pages/clinic/Billings";
import PanelClaims from "./pages/clinic/PanelClaims";
import Inventory from "./pages/clinic/Inventory";
import Receivables from "./pages/clinic/Receivables";
import VoidedRecords from "./pages/clinic/VoidedRecords";
import Insight from "./pages/clinic/Insight";
import SettingsPage from "./pages/clinic/settings/SettingsPage";
import InClinicSettings from "./pages/clinic/settings/InClinicSettings";
import UserManagementSettings from "./pages/clinic/settings/UserManagementSettings";
import InventorySettings from "./pages/clinic/settings/InventorySettings";
import DiagnosisSweeper from "./pages/clinic/settings/DiagnosisSweeper";
import PanelsSettings from "./pages/clinic/settings/PanelsSettings";
import DrugLabelSettings from "./pages/clinic/settings/DrugLabelSettings";
import DocumentSettings from "./pages/clinic/settings/DocumentSettings";
import QueueSettings from "./pages/clinic/settings/QueueSettings";
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
                <Route path="website/video-calls" element={<VideoCallManagement />} />
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
                  <ClinicProtectedRoute>
                    <ClinicLayout />
                  </ClinicProtectedRoute>
                }
              >
                <Route index element={<Navigate to="queue" replace />} />
                <Route path="queue" element={<QueueBoard />} />
                <Route path="appointments" element={<Appointments />} />
                <Route path="patients" element={<PatientsList />} />
                <Route path="consultation" element={<Consultation />} />
                <Route path="consultation/:queueEntryId" element={<ConsultationDetail />} />
                <Route path="dispensary" element={<Dispensary />} />
                <Route path="procurement" element={<Procurement />} />
                <Route path="queue/checkout/:queueEntryId" element={<DispenseCheckout />} />
                <Route path="billings" element={<Billings />} />
                <Route path="panel-claims" element={<PanelClaims />} />
                <Route path="receivables" element={<Receivables />} />
                <Route path="inventory" element={<Inventory />} />
                <Route
                  path="insight"
                  element={
                    <ClinicProtectedRoute requiredRole="insights">
                      <Insight />
                    </ClinicProtectedRoute>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/preferences" element={<InClinicSettings />} />
                <Route
                  path="settings/users"
                  element={
                    <ClinicProtectedRoute requiredRole="admin">
                      <UserManagementSettings />
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
                  path="settings/queue"
                  element={
                    <ClinicProtectedRoute requiredRole="ops_or_admin">
                      <QueueSettings />
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
