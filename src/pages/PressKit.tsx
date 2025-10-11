import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const PressKit = () => {
  const { toast } = useToast();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const copyToClipboard = (text: string, itemName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItem(itemName);
    toast({
      title: "Copied!",
      description: `${itemName} copied to clipboard`,
    });
    setTimeout(() => setCopiedItem(null), 2000);
  };

  const baseUrl = import.meta.env.BASE_URL;

  // Press Kit Resources
  const logoAssets = [
    {
      name: "COhere Logo (Primary)",
      description: "Main logo with branding elements",
      file: `${baseUrl}COHERE-Logo-Branding-2.webp`,
      format: "WebP",
    },
  ];

  const textResources = [
    {
      title: "Event Name",
      content: "[CO]here Boulder 2025",
      id: "event-name",
    },
    {
      title: "Tagline",
      content: "Weaving Our Resilience",
      id: "tagline",
    },
    {
      title: "Mission (Short)",
      content:
        "Connecting local community to create a regenerative, resilient future.",
      id: "mission-short",
    },
    {
      title: "Short Description (50 words)",
      content:
        "[CO]here Boulder stokes Boulder's culture and engagement by connecting residents, organizations, artists, leaders, and innovators during a 10-day container. Through values-aligned events and memorable gatherings, we strengthen community ties, highlight our city's vibrancy, and inspire action toward a more regenerative, resilient future.",
      id: "short-desc",
    },
    {
      title: "Medium Description (100 words)",
      content:
        "[CO]here Boulder celebrates Boulder's culture and creativity in connection. Over ten days, we bring together residents, organizations, artists, leaders, and innovators across six themes: Ecology & Food Systems, Arts & Culture, Wellness, Technology & Innovation, Governance & Business, and Villaging & Neighboring. Through a curated calendar of values-aligned events, memorable opening and closing gatherings, we deepen local connection, amplify local culture, catalyze regeneration, and spark inspiration. Operating on gift economy principles, [CO]here makes community participation memorable, meaningful, and accessible to all.",
      id: "medium-desc",
    },
    {
      title: "Long Description (200 words)",
      content:
        "[CO]here Boulder stokes Boulder's culture and engagement by connecting local community to create a regenerative, resilient future. For ten days each October, we create a container bringing together residents, organizations, artists, leaders, and innovators across six themes: Ecology & Food Systems, Arts & Culture, Wellness, Technology & Innovation, Governance & Business, and Villaging & Neighboring. Through a curated calendar of values-aligned events and memorable opening and closing gatherings, we strengthen community ties, highlight our city's vibrancy, and inspire action. We deepen local connection by building relationships across neighborhoods, disciplines, and generations. We amplify local culture by showcasing Boulder's creative identity through music, art, storytelling, and dialogue. We catalyze regeneration by highlighting projects advancing ecological health, social justice, and resilience. And we spark inspiration by making community participation memorable, meaningful, and accessible to all. The rhythm begins with an Invocation gathering to set collective intentions. Throughout the ten days, community-led events create space for meaningful exchange. We close with an Integration celebration, harvesting insights and commitments for the year ahead. [CO]here operates on gift economy principles, believing that when we weave our individual threads together, we create something far stronger than any of us could alone.",
      id: "long-desc",
    },
    {
      title: "Event Dates",
      content: "October 16-26, 2025",
      id: "dates",
    },
    {
      title: "Location",
      content: "Boulder, Colorado",
      id: "location",
    },
    {
      title: "Website",
      content: "https://cohereboulder.org",
      id: "website",
    },
    {
      title: "Contact Email",
      content: "cohere@wovenweb.org",
      id: "email",
    },
  ];

  const keyMessages = [
    "We deepen local connection by building relationships across neighborhoods, disciplines, and generations.",
    "We amplify local culture by showcasing Boulder's creative identity through music, art, storytelling, and dialogue.",
    "We catalyze regeneration by highlighting projects advancing ecological health, social justice, and resilience.",
    "We spark inspiration by making community participation memorable, meaningful, and accessible to all.",
    "[CO]here operates on gift economy principles—what we create together strengthens our community.",
  ];

  const hashtags = [
    "#COhereBoulder",
    "#COhere2025",
    "#RegenerativeCommunity",
    "#BoulderCO",
    "#CommunityWeaving",
    "#RegenerativeEcosystem",
  ];

  const socialMediaSamples = [
    {
      platform: "Short Post (Twitter/X)",
      content:
        "[CO]here Boulder is back Oct 16-26! 🎉\n\n10-day event series weaving together residents, organizations, artists, leaders, and innovators in celebration of Boulder's culture and community.\n\nFree to join. Nearly all events donation-based.\n\nRegister: cohereboulder.org\n\n#COhereBoulder",
    },
    {
      platform: "General Social Media / Group Chat",
      content:
        "[CO]here Boulder is back for its second year, and begins in less than a week! 🎉\n\n🌐 COhere is a 10-day event series that weaves together residents, organizations, artists, leaders, and innovators in celebration of our city's culture and community. Through memorable opening and closing gatherings and a curated calendar of values-aligned events, we strengthen community ties, highlight our city's vibrancy, and inspire action toward a more regenerative, resilient future.\n\n💸 COhere is free to join and nearly all events are offered in the spirit of the gift (donation-based).\n\n📣 Register at cohereboulder.org for updates, and mark your calendars for the Invocation on October 16 at The Riverside.",
    },
    {
      platform: "Short Opening Invitation",
      content:
        "We're excited to announce that COhere Boulder is back for its second year! We'd love to weave you in at the opening gathering on Thursday, Oct 16.\n\nRegister for free at cohereboulder.org/register",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="py-20">
        {/* Hero Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h1 className="text-4xl lg:text-5xl font-bold mb-6 text-center">
            [CO]here Boulder Press Kit
          </h1>
          <p className="text-xl text-muted-foreground text-center max-w-3xl mx-auto">
            Resources and materials for sharing about [CO]here Boulder. Feel
            free to use these assets in articles, social media posts, and
            promotional materials.
          </p>
        </section>

        {/* Quick Info Card */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <Card className="bg-gradient-to-br from-earth-light/30 to-transparent">
            <CardHeader>
              <CardTitle>Quick Reference</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                <strong>Event:</strong> [CO]here Boulder 2025
              </p>
              <p>
                <strong>Dates:</strong> October 16-26, 2025
              </p>
              <p>
                <strong>Location:</strong> Boulder, Colorado
              </p>
              <p>
                <strong>Website:</strong>{" "}
                <a
                  href="https://cohereboulder.org"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  cohereboulder.org
                </a>
              </p>
              <p>
                <strong>Contact:</strong>{" "}
                <a
                  href="mailto:cohere@wovenweb.org"
                  className="text-primary hover:underline"
                >
                  cohere@wovenweb.org
                </a>
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Logo Assets */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Logo & Visual Assets</h2>
          <div className="grid md:grid-cols-1 gap-6">
            {logoAssets.map((asset) => (
              <Card key={asset.name}>
                <CardHeader>
                  <CardTitle className="text-xl">{asset.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {asset.description}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="bg-white p-8 rounded-lg mb-4 flex items-center justify-center border">
                    <img
                      src={asset.file}
                      alt={asset.name}
                      className="max-h-32 w-auto"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(asset.file, "_blank")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download {asset.format}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Text Resources */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Text Resources</h2>
          <div className="space-y-4">
            {textResources.map((resource) => (
              <Card key={resource.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{resource.title}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(resource.content, resource.title)
                      }
                    >
                      {copiedItem === resource.title ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{resource.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Key Messages */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Key Messages</h2>
          <Card>
            <CardContent className="pt-6">
              <ul className="space-y-3">
                {keyMessages.map((message, index) => (
                  <li key={index} className="flex items-start">
                    <span className="text-primary mr-2 font-bold">•</span>
                    <span className="text-muted-foreground">{message}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Event Descriptions */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Event Descriptions</h2>
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Opening Invocation Description
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(
                      "Join us at the Riverside for the opening party to kickoff [CO]here Boulder 2025!\n\n🌐 COhere is a 10-day event series that weaves together residents, organizations, artists, leaders, and innovators in celebration of our city's culture and community. Through memorable opening and closing gatherings and a curated calendar of values-aligned events, we strengthen community ties, highlight our city's vibrancy, and inspire action toward a more regenerative, resilient future.\n\nAt the opening, we will meet one another, share delicious food, invoke the intentions of COhere, and orient everyone to the exciting week+ of events to come.\n\nBonus: Those who attend the Invocation will receive a special gift to support playful engagement and connection throughout the event and beyond!\n\nOutline for the evening:\n\n6:00 - 7:00: Arrival and Dinner. Delicious food made with fresh local ingredients will be served. Donations appreciated. Please try to arrive by 7:00\n7:15-7:45: Opening Invocation, orientation, and connection activities.\n7:45 - 8:30: Share from community leaders: Music, poetry, and more!\n8:30 - 10:00: DJ dance party + connection time.\n\nThroughout the evening, there will be local artists and organizations table-ing\n\nWe can't wait to see you there!\n\n💸 COhere is free to join and nearly all events are offered in the spirit of the gift (donation-based).\n\n📣 Register at cohereboulder.org/register for updates on all upcoming events\n\n📆 View the full calendar of events at cohereboulder.org/calendar\n\n🙏 If you are in a position to do so, please consider donating or sponsoring COhere.",
                      "Opening Invocation Description",
                    )
                  }
                >
                  {copiedItem === "Opening Invocation Description" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-line">
                Join us at the Riverside for the opening party to kickoff
                [CO]here Boulder 2025!
                {"\n\n"}
                🌐 COhere is a 10-day event series that weaves together
                residents, organizations, artists, leaders, and innovators in
                celebration of our city's culture and community. Through
                memorable opening and closing gatherings and a curated calendar
                of values-aligned events, we strengthen community ties,
                highlight our city's vibrancy, and inspire action toward a more
                regenerative, resilient future.
                {"\n\n"}
                At the opening, we will meet one another, share delicious food,
                invoke the intentions of COhere, and orient everyone to the
                exciting week+ of events to come.
                {"\n"}
                Bonus: Those who attend the Invocation will receive a special
                gift to support playful engagement and connection throughout the
                event and beyond!
                {"\n\n"}
                Outline for the evening:
                {"\n\n"}
                6:00 - 7:00: Arrival and Dinner. Delicious food made with fresh
                local ingredients will be served. Donations appreciated. Please
                try to arrive by 7:00
                {"\n"}
                7:15-7:45: Opening Invocation, orientation, and connection
                activities.
                {"\n"}
                7:45 - 8:30: Share from community leaders: Music, poetry, and
                more!
                {"\n"}
                8:30 - 10:00: DJ dance party + connection time.
                {"\n\n"}
                Throughout the evening, there will be local artists and
                organizations table-ing
                {"\n\n"}
                We can't wait to see you there!
                {"\n\n"}
                💸 COhere is free to join and nearly all events are offered in
                the spirit of the gift (donation-based).
                {"\n\n"}
                📣 Register at cohereboulder.org/register for updates on all
                upcoming events
                {"\n\n"}
                📆 View the full calendar of events at
                cohereboulder.org/calendar
                {"\n\n"}
                🙏 If you are in a position to do so, please consider donating
                or sponsoring COhere.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Social Media Samples */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Social Media Sample Posts</h2>
          <div className="space-y-4">
            {socialMediaSamples.map((sample) => (
              <Card key={sample.platform}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{sample.platform}</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(sample.content, sample.platform)
                      }
                    >
                      {copiedItem === sample.platform ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground whitespace-pre-line">
                    {sample.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Hashtags */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Hashtags</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-2">
                {hashtags.map((hashtag) => (
                  <Button
                    key={hashtag}
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(hashtag, hashtag)}
                  >
                    {hashtag}
                    {copiedItem === hashtag ? (
                      <CheckCircle2 className="ml-2 h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="ml-2 h-4 w-4" />
                    )}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Additional Resources */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
          <h2 className="text-3xl font-bold mb-8">Additional Resources</h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">2024 Recap Video</h3>
                <p className="text-muted-foreground mb-2">
                  Watch our 2024 event recap to get a feel for the [CO]here
                  experience
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      "https://www.youtube.com/watch?v=wMDpVsSGY5M",
                      "_blank",
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on YouTube
                </Button>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Ecosystem Map</h3>
                <p className="text-muted-foreground mb-2">
                  Explore Boulder's regenerative ecosystem map
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(`${baseUrl}Ecosystem.pdf`, "_blank")
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Ecosystem Map
                </Button>
              </div>

              <div>
                <h3 className="font-semibold mb-2">More Information</h3>
                <p className="text-muted-foreground mb-2">
                  Visit our main website for complete event details
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open("https://cohereboulder.org", "_blank")
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Visit cohereboulder.org
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Contact Section */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-br from-community-yellow/20 to-transparent">
            <CardContent className="pt-6 text-center">
              <h2 className="text-2xl font-bold mb-4">
                Questions or Need Additional Materials?
              </h2>
              <p className="text-muted-foreground mb-6">
                We're happy to provide additional information, high-resolution
                images, or arrange interviews.
              </p>
              <Button size="lg" variant="community">
                <a href="mailto:cohere@wovenweb.org">Contact Us</a>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PressKit;
