import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type CoherePhase = "invocation" | "cohering" | "integration" | "between";

interface PhaseIndicatorProps {
  currentPhase?: CoherePhase;
  showDates?: boolean;
  className?: string;
}

export const PhaseIndicator = ({
  currentPhase = "invocation",
  showDates = true,
  className
}: PhaseIndicatorProps) => {
  const phases = [
    {
      id: "invocation",
      name: "Invocation",
      date: "Oct 16, 2025",
      description: "Opening ceremony launch",
      color: "border-nature-teal text-nature-teal",
      bgColor: "bg-nature-teal/10"
    },
    {
      id: "cohering",
      name: "Cohering",
      date: "Oct 16-26, 2025",
      description: "Community gathering period",
      color: "border-community-orange text-community-orange",
      bgColor: "bg-community-orange/10"
    },
    {
      id: "integration",
      name: "Integration",
      date: "Oct 26, 2025",
      description: "Reflection & commitments",
      color: "border-nature-green text-nature-green",
      bgColor: "bg-nature-green/10"
    }
  ];

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile view - vertical */}
      <div className="md:hidden space-y-4">
        {phases.map((phase, index) => (
          <div key={phase.id} className="relative">
            {index < phases.length - 1 && (
              <div className="absolute left-6 top-14 w-0.5 h-12 bg-border"></div>
            )}
            <div className={cn(
              "flex items-start gap-4",
              currentPhase === phase.id && "scale-105"
            )}>
              <div className={cn(
                "w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold",
                currentPhase === phase.id ? phase.color : "border-border text-muted-foreground",
                currentPhase === phase.id && phase.bgColor
              )}>
                {index + 1}
              </div>
              <div className="flex-1">
                <h3 className={cn(
                  "font-semibold",
                  currentPhase === phase.id ? "text-foreground" : "text-muted-foreground"
                )}>
                  {phase.name}
                  {currentPhase === phase.id && (
                    <Badge className="ml-2" variant="outline">Current</Badge>
                  )}
                </h3>
                {showDates && (
                  <p className="text-xs text-muted-foreground">{phase.date}</p>
                )}
                <p className="text-sm text-muted-foreground">{phase.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop view - horizontal */}
      <div className="hidden md:flex items-center justify-between relative">
        {/* Connection line */}
        <div className="absolute top-8 left-0 right-0 h-0.5 bg-border z-0"></div>

        {phases.map((phase, index) => (
          <div
            key={phase.id}
            className={cn(
              "relative z-10 flex flex-col items-center text-center",
              "transition-transform duration-200",
              currentPhase === phase.id && "scale-110"
            )}
          >
            <div className={cn(
              "w-16 h-16 rounded-full border-2 flex items-center justify-center font-bold mb-3",
              "bg-background",
              currentPhase === phase.id ? phase.color : "border-border text-muted-foreground",
              currentPhase === phase.id && phase.bgColor
            )}>
              {index + 1}
            </div>
            <h3 className={cn(
              "font-semibold text-sm mb-1",
              currentPhase === phase.id ? "text-foreground" : "text-muted-foreground"
            )}>
              {phase.name}
            </h3>
            {currentPhase === phase.id && (
              <Badge className="mb-1 text-xs" variant="outline">Current</Badge>
            )}
            {showDates && (
              <p className="text-xs text-muted-foreground mb-1">{phase.date}</p>
            )}
            <p className="text-xs text-muted-foreground max-w-[120px]">
              {phase.description}
            </p>
          </div>
        ))}
      </div>

      {/* Between cycles message */}
      {currentPhase === "between" && (
        <Card className="mt-6 p-4 bg-muted/30 border-dashed">
          <p className="text-center text-muted-foreground">
            We are currently between COhere cycles. The spirit of COhere continues year-round
            as we prepare for the next Invitation.
          </p>
        </Card>
      )}
    </div>
  );
};
