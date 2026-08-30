import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScrollToTop } from "@/components/ScrollToTop";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Index from "./pages/Index";
import About from "./pages/About";
import CoCreate from "./pages/CoCreate";
import Calendar from "./pages/Calendar";
import EventDetail from "./pages/EventDetail";
import Registration from "./pages/Registration";
import Join2025 from "./pages/Join2025";
import Invitation2025 from "./pages/Invitation2025";
import Archive from "./pages/Archive";
import Archive2024 from "./pages/Archive2024";
import PressKit from "./pages/PressKit";
import Telegram from "./pages/Telegram";
import NotFound from "./pages/NotFound";

// Sign-in, the admin portal, and unsubscribe all live in the Worker now
// (see workers/email-signup). The site itself has no backend of its own — it
// posts to the Worker's public form endpoints and is otherwise static.

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
            {/* Portable link shape — the same path scenius.social uses */}
            <Route path="/events/:did/:rkey" element={<EventDetail />} />
            <Route path="/register" element={<Registration />} />
            <Route path="/telegram" element={<Telegram />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/archive/2024" element={<Archive2024 />} />
            {/* 2025 pages, kept as history and linked from the archive */}
            <Route path="/join-2025" element={<Join2025 />} />
            <Route path="/invitation-2025" element={<Invitation2025 />} />
            <Route path="/presskit" element={<PressKit />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
