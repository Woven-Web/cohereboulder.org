import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Download,
  CalendarIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface Event {
  id?: string;
  title: string;
  description?: string | null;
  start_date: string;
  end_date: string;
  location?: string | null;
  category: string | null;
  is_public: boolean | null;
  created_at?: string;
}

export const EventsManagement = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [formData, setFormData] = useState<Partial<Event>>({
    title: "",
    description: "",
    location: "",
    category: "general",
    is_public: true,
  });
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // Common Boulder locations for autocomplete
  const commonLocations = [
    "Boulder Theater",
    "Chautauqua Auditorium",
    "Pearl Street Mall",
    "Boulder Public Library - Main Branch",
    "Boulder Creek Path",
    "University of Colorado Boulder",
    "Boulder Museum of Contemporary Art",
    "Rayback Collective",
    "The Riverside",
    "eTown Hall",
    "Boulder County Fairgrounds",
    "East Boulder Community Center",
    "North Boulder Recreation Center",
    "South Boulder Recreation Center",
    "Dairy Arts Center",
    "Boulder Shambhala Center",
    "Naropa University",
    "Flatirons Park",
    "Avalon Ballroom",
    "Trident Booksellers & Cafe",
    "St Julien Hotel & Spa",
    "Hotel Boulderado",
    "Boulder Farmers Market",
    "Central Park",
    "Scott Carpenter Park",
    "Valmont Bike Park",
    "NOAA David Skaggs Research Center",
    "Fiske Planetarium",
    "Colorado Chautauqua National Historic Landmark",
  ];

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-events", {
        body: { action: "GET" },
      });

      if (error) throw error;

      setEvents(data || []);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate || !endDate || !formData.title) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const startDateTime = new Date(startDate);
      const [startHours, startMinutes] = startTime.split(":");
      startDateTime.setHours(parseInt(startHours), parseInt(startMinutes));

      const endDateTime = new Date(endDate);
      const [endHours, endMinutes] = endTime.split(":");
      endDateTime.setHours(parseInt(endHours), parseInt(endMinutes));

      // Validate that end time is after start time
      if (endDateTime <= startDateTime) {
        toast.error("End date/time must be after start date/time");
        return;
      }

      const eventData = {
        ...formData,
        start_date: startDateTime.toISOString(),
        end_date: endDateTime.toISOString(),
      };

      const { data, error } = await supabase.functions.invoke("manage-events", {
        body: {
          action: editingEvent ? "PUT" : "POST",
          ...eventData,
          ...(editingEvent && { id: editingEvent.id }),
        },
      });

      if (error) throw error;

      toast.success(
        editingEvent
          ? "Event updated successfully"
          : "Event created successfully",
      );

      // Update events list immediately with the returned data for better UX
      if (data) {
        if (editingEvent) {
          setEvents((prev) => prev.map((e) => (e.id === data.id ? data : e)));
        } else {
          setEvents((prev) =>
            [...prev, data].sort(
              (a, b) =>
                new Date(a.start_date).getTime() -
                new Date(b.start_date).getTime(),
            ),
          );
        }
      }

      resetForm();
    } catch (error) {
      console.error("Error saving event:", error);
      toast.error("Failed to save event");
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description,
      location: event.location,
      category: event.category,
      is_public: event.is_public,
    });

    const startDateTime = new Date(event.start_date);
    const endDateTime = new Date(event.end_date);

    setStartDate(startDateTime);
    setEndDate(endDateTime);
    setStartTime(format(startDateTime, "HH:mm"));
    setEndTime(format(endDateTime, "HH:mm"));
    setShowForm(true);
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
      const { data, error } = await supabase.functions.invoke("manage-events", {
        body: {
          action: "DELETE",
          id: eventId,
        },
      });

      if (error) throw error;

      toast.success("Event deleted successfully");
      // Remove from state immediately for better UX
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (error) {
      console.error("Error deleting event:", error);
      toast.error("Failed to delete event");
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      location: "",
      category: "general",
      is_public: true,
    });
    setStartDate(undefined);
    setEndDate(undefined);
    setStartTime("09:00");
    setEndTime("17:00");
    setEditingEvent(null);
    setShowForm(false);
    setShowLocationSuggestions(false);
  };

  // Handle start date change - auto-set end date
  const handleStartDateChange = (date: Date | undefined) => {
    setStartDate(date);
    if (date && !endDate) {
      // Auto-set end date to same day, 2 hours later by default
      const autoEndDate = new Date(date);
      setEndDate(autoEndDate);

      // Calculate end time (2 hours after start time)
      const [hours, minutes] = startTime.split(":").map(Number);
      const endHours = (hours + 2) % 24;
      setEndTime(
        `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
      );
    } else if (date && endDate && date > endDate) {
      // If start date is after end date, update end date to match
      setEndDate(date);
    }
  };

  // Handle end date change - ensure it's not before start date
  const handleEndDateChange = (date: Date | undefined) => {
    if (date && startDate && date < startDate) {
      toast.error("End date cannot be before start date");
      return;
    }
    setEndDate(date);
  };

  // Handle start time change - adjust end time if needed
  const handleStartTimeChange = (time: string) => {
    setStartTime(time);
    if (
      startDate &&
      endDate &&
      startDate.toDateString() === endDate.toDateString()
    ) {
      // If same day, ensure end time is after start time
      const [startHours, startMinutes] = time.split(":").map(Number);
      const [endHours, endMinutes] = endTime.split(":").map(Number);

      if (
        startHours >= endHours ||
        (startHours === endHours && startMinutes >= endMinutes)
      ) {
        // Set end time to 2 hours after start
        const newEndHours = (startHours + 2) % 24;
        setEndTime(
          `${newEndHours.toString().padStart(2, "0")}:${startMinutes.toString().padStart(2, "0")}`,
        );
      }
    }
  };

  // Handle location input with autocomplete
  const handleLocationChange = (value: string) => {
    setFormData((prev) => ({ ...prev, location: value }));

    if (value.length > 0) {
      const filtered = commonLocations.filter((loc) =>
        loc.toLowerCase().includes(value.toLowerCase()),
      );
      setLocationSuggestions(filtered);
      setShowLocationSuggestions(filtered.length > 0);
    } else {
      setShowLocationSuggestions(false);
    }
  };

  const selectLocation = (location: string) => {
    setFormData((prev) => ({ ...prev, location }));
    setShowLocationSuggestions(false);
  };

  const exportEvents = () => {
    if (events.length === 0) return;

    const csvContent = [
      "Title,Description,Start Date,End Date,Location,Category,Public",
      ...events.map((event) =>
        [
          `"${event.title}"`,
          `"${event.description || ""}"`,
          `"${format(new Date(event.start_date), "yyyy-MM-dd HH:mm")}"`,
          `"${format(new Date(event.end_date), "yyyy-MM-dd HH:mm")}"`,
          `"${event.location || ""}"`,
          `"${event.category || ""}"`,
          event.is_public ? "Yes" : "No",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cohere-events.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        Loading events...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Events Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage calendar events and announcements
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportEvents}
            disabled={events.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Event
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {editingEvent ? "Edit Event" : "Create New Event"}
              <Button variant="outline" size="sm" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    placeholder="Event title"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category || "general"}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, category: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="cohere">COhere</SelectItem>
                      <SelectItem value="workshop">Workshop</SelectItem>
                      <SelectItem value="community">Community</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Event description"
                  rows={3}
                />
              </div>

              <div className="space-y-2 relative">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location || ""}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onFocus={() => {
                    if (formData.location && formData.location.length > 0) {
                      handleLocationChange(formData.location);
                    }
                  }}
                  onBlur={() => {
                    // Delay hiding to allow clicking on suggestions
                    setTimeout(() => setShowLocationSuggestions(false), 200);
                  }}
                  placeholder="Event location (start typing for suggestions)"
                />
                {showLocationSuggestions && locationSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {locationSuggestions.map((location, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100 text-sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectLocation(location)}
                      >
                        {location}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date & Time *</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate
                            ? format(startDate, "MMM dd, yyyy")
                            : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={startDate}
                          onSelect={handleStartDateChange}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>End Date & Time *</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate
                            ? format(endDate, "MMM dd, yyyy")
                            : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={endDate}
                          onSelect={handleEndDateChange}
                          className="pointer-events-auto"
                          disabled={(date) =>
                            startDate ? date < startDate : false
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_public"
                  checked={formData.is_public || false}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      is_public: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <Label htmlFor="is_public">Make this event public</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  <Save className="h-4 w-4 mr-2" />
                  {editingEvent ? "Update Event" : "Create Event"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {events.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h4 className="text-lg font-semibold mb-2">No events yet</h4>
              <p className="text-muted-foreground">
                Create your first event to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          events.map((event) => (
            <Card key={event.id}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{event.title}</h4>
                      <Badge
                        variant={
                          event.category === "cohere" ? "default" : "secondary"
                        }
                      >
                        {event.category}
                      </Badge>
                      {event.is_public && (
                        <Badge variant="outline">Public</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(
                        new Date(event.start_date),
                        "MMM dd, yyyy h:mm a",
                      )}{" "}
                      - {format(new Date(event.end_date), "h:mm a")}
                    </p>
                    {event.location && (
                      <p className="text-sm text-muted-foreground">
                        📍 {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="text-sm">{event.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(event)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(event.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
