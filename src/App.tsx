import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import VideoCall from "./pages/VideoCall";
import VideoCallStaff from "./pages/VideoCallStaff";

// Admin
import { AdminLayout } from "./components/admin";
import {
  AdminDashboard,
  LeadsManagement,
  BlogManagement,
  BlogEditor,
  GalleryManagement,
  UserManagement,
  TeamManagement,
  TeamEditor,
  VideoCallManagement,
  AdminSettings,
} from "./pages/admin";

const queryClient = new QueryClient();

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
                <Route path="users" element={<UserManagement />} />
                <Route path="settings" element={<AdminSettings />} />
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
