import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";

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
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join us for events and gatherings throughout Boulder's
              regenerative journey.
            </p>
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
