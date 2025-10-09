import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default function CalendarPage() {

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Community Calendar
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Join us for events and gatherings throughout Boulder's
              regenerative journey.
            </p>
            <Button
              asChild
              variant="community"
              size="lg"
              className="gap-2"
            >
              <a
                href="https://lu.ma/cohere-boulder"
                target="_blank"
                rel="noopener noreferrer"
              >
                Subscribe to Calendar
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>

          {/* Luma Calendar Embed */}
          <div className="w-full flex justify-center">
            <iframe
              src="https://luma.com/embed/calendar/cal-cMHRL58OxzwDCw7/events"
              className="w-full max-w-6xl rounded-lg border border-border"
              style={{ 
                minHeight: '600px',
                height: 'calc(100vh - 300px)',
              }}
              frameBorder="0"
              allowFullScreen
              aria-hidden="false"
              tabIndex={0}
            />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
