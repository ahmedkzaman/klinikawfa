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

// Admin
import { AdminLayout } from "./components/admin";
import {
  AdminDashboard,
  LeadsManagement,
  BlogManagement,
  BlogEditor,
  GalleryManagement,
  TeamManagement,
  TeamEditor,
  VideoCallManagement,
  ReviewsManagement,
  AdminSettings,
} from "./pages/admin";

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
              
              {/* Admin Routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="leads" element={<LeadsManagement />} />
                <Route path="team" element={<TeamManagement />} />
                <Route path="team/:id" element={<TeamEditor />} />
                <Route path="video-calls" element={<VideoCallManagement />} />
                <Route path="blog" element={<BlogManagement />} />
                <Route path="blog/:id" element={<BlogEditor />} />
                <Route path="gallery" element={<GalleryManagement />} />
                <Route path="reviews" element={<ReviewsManagement />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

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
              </Route>

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
