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
  placeholder = "Search for a location...",
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
      // Create autocomplete instance with Boulder bias
      const autocomplete = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          // Don't specify types to get all results (businesses, addresses, etc.)
          // This allows both establishment and geocode results
          componentRestrictions: { country: "us" },
          fields: ["formatted_address", "geometry", "name", "types"],
        },
      );

      // Bias results to Boulder, Colorado (but don't strictly restrict)
      const boulder = new window.google.maps.LatLng(40.015, -105.2705);

      // Create broader bounds around Boulder/Denver metro area
      const bounds = new window.google.maps.LatLngBounds(
        new window.google.maps.LatLng(39.5, -105.5), // Southwest corner (covers Denver)
        new window.google.maps.LatLng(40.3, -104.9), // Northeast corner (covers Boulder/Longmont)
      );

      // Use bounds to bias (not restrict) and set origin for ranking
      autocomplete.setBounds(bounds);
      autocomplete.setOptions({
        strictBounds: false, // Allow results outside bounds if relevant
        origin: boulder, // Rank results by distance from Boulder
      });

      // Handle place selection
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place) {
          let locationString = "";

          // Check if it's a business/establishment
          const isEstablishment = place.types?.some((type) =>
            [
              "establishment",
              "point_of_interest",
              "store",
              "restaurant",
              "cafe",
              "museum",
              "park",
              "stadium",
              "university",
              "school",
              "bar",
              "gym",
              "library",
              "church",
              "hospital",
              "shopping_mall",
              "art_gallery",
              "movie_theater",
              "night_club",
              "spa",
              "lodging",
            ].includes(type),
          );

          if (place.name && isEstablishment) {
            // For businesses, prioritize the name
            // Only add the full address if it provides useful context
            const hasStreetAddress =
              place.formatted_address && /\d/.test(place.formatted_address); // Check if address has numbers (street address)

            if (
              hasStreetAddress &&
              !place.formatted_address.startsWith(place.name)
            ) {
              // Include address for specific street locations
              locationString = `${place.name}, ${place.formatted_address}`;
            } else {
              // Just use the business name for well-known places
              locationString = place.name;
            }
          } else if (place.formatted_address) {
            // For regular addresses, use the formatted address
            locationString = place.formatted_address;
          } else if (place.name) {
            // Fallback to just name if nothing else
            locationString = place.name;
          }

          if (locationString) {
            onChange(locationString);
          }
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
