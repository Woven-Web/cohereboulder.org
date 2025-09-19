import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import About from "./pages/About";
import CoCreate from "./pages/CoCreate";
import Calendar from "./pages/Calendar";
import Join2025 from "./pages/Join2025";
import Invitation2025 from "./pages/Invitation2025";
import Archive from "./pages/Archive";
import Archive2024 from "./pages/Archive2024";
import GetInvolved from "./pages/GetInvolved";
import Registration from "./pages/Registration";
import Auth from "./pages/Auth";
import VerificationSuccess from "./pages/VerificationSuccess";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <ScrollToTop />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/about" element={<About />} />
              <Route path="/co-create" element={<CoCreate />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/join-2025" element={<Join2025 />} />
              <Route path="/invitation-2025" element={<Invitation2025 />} />
              <Route path="/get-involved" element={<GetInvolved />} />
              <Route path="/register" element={<Registration />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/verification-success" element={<VerificationSuccess />} />
              <Route path="/archive" element={<Archive />} />
              <Route path="/archive/2024" element={<Archive2024 />} />
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
