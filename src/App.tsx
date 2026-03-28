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
import StaffAdminDashboard from "./pages/staff/admin/Dashboard";
import AdminEmployees from "./pages/staff/admin/Employees";
import AdminZones from "./pages/staff/admin/Zones";
import AdminAssignments from "./pages/staff/admin/Assignments";
import AdminRequests from "./pages/staff/admin/Requests";

// Website Management (formerly /admin)
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
              <Route path="/video-call" element={<VideoCall />} />
              <Route path="/video-call/staff" element={<VideoCallStaff />} />

              {/* Staff Portal Routes */}
              <Route path="/staff" element={<StaffLayout />}>
                <Route index element={<Navigate to="/staff/dashboard" replace />} />
                <Route path="dashboard" element={<StaffDashboard />} />
                <Route path="punch" element={<StaffPunch />} />
                <Route path="history" element={<StaffHistory />} />
                <Route path="calendar" element={<StaffCalendar />} />
                <Route path="leave" element={<StaffLeaveRequest />} />
                <Route path="documents" element={<StaffDocuments />} />
                <Route path="appraisal" element={<PerformanceAppraisal />} />
                <Route path="appraisal/:id" element={<AppraisalForm />} />
                <Route path="admin" element={<StaffAdminDashboard />} />
                <Route path="admin/employees" element={<AdminEmployees />} />
                <Route path="admin/zones" element={<AdminZones />} />
                <Route path="admin/assignments" element={<AdminAssignments />} />
                <Route path="admin/requests" element={<AdminRequests />} />
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
