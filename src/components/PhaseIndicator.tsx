import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

export type CoherePhase =
  | "invocation"
  | "cohering"
  | "integration"
  | "between"
  | "upcoming"
  | "concluded";

interface PhaseIndicatorProps {
  currentPhase?: CoherePhase;
  showDates?: boolean;
  className?: string;
}

// Helper function to determine current phase based on date
const getCurrentPhase = (): CoherePhase => {
  const now = new Date();
  const invocationDate = new Date("2025-10-16");
  const integrationDate = new Date("2025-10-26");
  const endOfIntegrationDate = new Date("2025-10-27"); // Day after integration

  // If we're before October 16, 2025
  if (now < invocationDate) {
    return "upcoming";
  }
  // If it's October 16, 2025
  else if (now.toDateString() === invocationDate.toDateString()) {
    return "invocation";
  }
  // If we're between October 17-25, 2025
  else if (now > invocationDate && now < integrationDate) {
    return "cohering";
  }
  // If it's October 26, 2025
  else if (now.toDateString() === integrationDate.toDateString()) {
    return "integration";
  }
  // If we're after October 26, 2025
  else if (now >= endOfIntegrationDate) {
    return "concluded";
  }

  return "upcoming";
};

export const PhaseIndicator = ({
  currentPhase,
  showDates = true,
  className,
}: PhaseIndicatorProps) => {
  // Use the provided phase or calculate it based on the current date
  const phase = useMemo(
    () => currentPhase ?? getCurrentPhase(),
    [currentPhase],
  );

  // Helper to get the right badge text
  const getBadgeText = (phaseId: string) => {
    if (phase === "upcoming" && phaseId === "invocation") return "Upcoming";
    if (phase === phaseId) return "Today";
    if (phase === "cohering" && phaseId === "cohering") return "Current";
    if (phase === "concluded") return "Completed";
    return null;
  };

  // Helper to check if a phase should be highlighted
  const isPhaseActive = (phaseId: string) => {
    if (phase === "upcoming" && phaseId === "invocation") return true;
    if (phase === phaseId) return true;
    if (phase === "cohering" && phaseId === "cohering") return true;
    if (phase === "concluded") return true;
    return false;
  };

  const phases = [
    {
      id: "invocation",
      name: "Invocation",
      date: "Oct 16, 2025",
      description: "Opening ceremony launch",
      color: "border-nature-teal text-nature-teal",
      bgColor: "bg-nature-teal/10",
    },
    {
      id: "cohering",
      name: "Cohering",
      date: "Oct 16-26, 2025",
      description: "Community gathering period",
      color: "border-community-orange text-community-orange",
      bgColor: "bg-community-orange/10",
    },
    {
      id: "integration",
      name: "Integration",
      date: "Oct 26, 2025",
      description: "Reflection & commitments",
      color: "border-nature-green text-nature-green",
      bgColor: "bg-nature-green/10",
    },
  ];

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile view - vertical */}
      <div className="md:hidden space-y-4">
        {phases.map((phaseItem, index) => (
          <div key={phaseItem.id} className="relative">
            {index < phases.length - 1 && (
              <div className="absolute left-6 top-14 w-0.5 h-12 bg-border"></div>
            )}
            <div
              className={cn(
                "flex items-start gap-4",
                isPhaseActive(phaseItem.id) && "scale-105",
              )}
            >
              <div
                className={cn(
                  "w-12 h-12 rounded-full border-2 flex items-center justify-center font-bold",
                  isPhaseActive(phaseItem.id)
                    ? phaseItem.color
                    : "border-border text-muted-foreground",
                  isPhaseActive(phaseItem.id) && phaseItem.bgColor,
                )}
              >
                {index + 1}
              </div>
              <div className="flex-1">
                <h3
                  className={cn(
                    "font-semibold",
                    isPhaseActive(phaseItem.id)
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {phaseItem.name}
                  {getBadgeText(phaseItem.id) && (
                    <Badge className="ml-2" variant="outline">
                      {getBadgeText(phaseItem.id)}
                    </Badge>
                  )}
                </h3>
                {showDates && (
                  <p className="text-xs text-muted-foreground">
                    {phaseItem.date}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {phaseItem.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop view - horizontal */}
      <div className="hidden md:flex items-center justify-between relative">
        {/* Connection line */}
        <div className="absolute top-8 left-0 right-0 h-0.5 bg-border z-0"></div>

        {phases.map((phaseItem, index) => (
          <div
            key={phaseItem.id}
            className={cn(
              "relative z-10 flex flex-col items-center text-center",
              "transition-transform duration-200",
              isPhaseActive(phaseItem.id) && "scale-110",
            )}
          >
            <div
              className={cn(
                "w-16 h-16 rounded-full border-2 flex items-center justify-center font-bold mb-3",
                "bg-background",
                isPhaseActive(phaseItem.id)
                  ? phaseItem.color
                  : "border-border text-muted-foreground",
                isPhaseActive(phaseItem.id) && phaseItem.bgColor,
              )}
            >
              {index + 1}
            </div>
            <h3
              className={cn(
                "font-semibold text-sm mb-1",
                isPhaseActive(phaseItem.id)
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {phaseItem.name}
            </h3>
            {getBadgeText(phaseItem.id) && (
              <Badge className="mb-1 text-xs" variant="outline">
                {getBadgeText(phaseItem.id)}
              </Badge>
            )}
            {showDates && (
              <p className="text-xs text-muted-foreground mb-1">
                {phaseItem.date}
              </p>
            )}
            <p className="text-xs text-muted-foreground max-w-[120px]">
              {phaseItem.description}
            </p>
          </div>
        ))}
      </div>

      {/* Status messages */}
      {phase === "upcoming" && (
        <Card className="mt-6 p-4 bg-muted/30 border-dashed">
          <p className="text-center text-muted-foreground">
            COhere Boulder 2025 begins October 16th. Join us for this 10-day
            immersive community experience.
          </p>
        </Card>
      )}
      {phase === "between" && (
        <Card className="mt-6 p-4 bg-muted/30 border-dashed">
          <p className="text-center text-muted-foreground">
            We are currently between COhere cycles. The spirit of COhere
            continues year-round as we prepare for the next Invitation.
          </p>
        </Card>
      )}
      {phase === "concluded" && (
        <Card className="mt-6 p-4 bg-primary/10 border-primary/20">
          <p className="text-center text-muted-foreground">
            COhere Boulder 2025 has concluded. Thank you for being part of this
            beautiful journey. The connections we've made continue to strengthen
            our community.
          </p>
        </Card>
      )}
    </div>
  );
};
