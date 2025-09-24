import React, { useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
}

declare global {
  interface Window {
    google: any;
    initGoogleMaps?: () => void;
  }
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Search for Boulder area locations...",
  label = "Location",
  required = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Load Google Maps script
  useEffect(() => {
    const loadGoogleMapsScript = () => {
      if (window.google && window.google.maps && window.google.maps.places) {
        setIsLoaded(true);
        return;
      }

      // Check if script is already loading
      const existingScript = document.querySelector(
        'script[src*="maps.googleapis.com"]',
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => setIsLoaded(true));
        return;
      }

      const script = document.createElement("script");
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        console.warn(
          "Google Maps API key not found. Location autocomplete will use fallback.",
        );
        return;
      }

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps`;
      script.async = true;
      script.defer = true;

      window.initGoogleMaps = () => {
        setIsLoaded(true);
      };

      script.onerror = () => {
        console.error("Failed to load Google Maps API");
        toast.error("Location autocomplete unavailable");
      };

      document.head.appendChild(script);
    };

    loadGoogleMapsScript();
  }, []);

  // Initialize autocomplete when Google Maps is loaded
  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    try {
      // Create autocomplete instance with strict Boulder area restrictions
      const autocomplete = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ["establishment", "geocode", "street_address"],
          componentRestrictions: { country: "us" },
          fields: ["formatted_address", "geometry", "name"],
        },
      );

      // Strongly restrict results to Boulder and immediate surrounding areas
      const boulder = new window.google.maps.LatLng(40.015, -105.2705);

      // Create a tight bounds around Boulder (roughly covers Boulder County)
      const bounds = new window.google.maps.LatLngBounds(
        new window.google.maps.LatLng(39.9142, -105.483), // Southwest corner
        new window.google.maps.LatLng(40.2614, -105.0174), // Northeast corner
      );

      // Use strictBounds to restrict results to this area only
      autocomplete.setBounds(bounds);
      autocomplete.setOptions({
        strictBounds: true, // This is key - it restricts results to the bounds
        origin: boulder, // Also set origin for ranking
      });

      // Handle place selection
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place && place.formatted_address) {
          // Use name if available, otherwise formatted address
          const locationString =
            place.name && !place.formatted_address.startsWith(place.name)
              ? `${place.name}, ${place.formatted_address}`
              : place.formatted_address;
          onChange(locationString);
        }
      });

      autocompleteRef.current = autocomplete;
    } catch (error) {
      console.error("Error initializing Google Places Autocomplete:", error);
    }
  }, [isLoaded, onChange]);

  // Handle manual input changes
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor="location">
          {label}
          {required && " *"}
        </Label>
      )}
      <Input
        ref={inputRef}
        id="location"
        type="text"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        required={required}
        className="w-full"
      />
      {!isLoaded && (
        <p className="text-xs text-muted-foreground">
          Location autocomplete is loading...
        </p>
      )}
    </div>
  );
};
