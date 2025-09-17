# COhere Boulder - WordPress to React Migration Comparison & Plan

## Overview
This document compares the live WordPress site at cohereboulder.org with our React implementation, identifying gaps and required changes to achieve feature parity.

## Current State Analysis

### WordPress Site Structure (Live Site)

#### 1. Global Elements

**Header Banner:**
- ✅ "[CO]Here has Completed and continues!"
- ✅ Newsletter subscription link to wovenweb.beehiiv.com
- **Status:** Partially implemented in React (missing top banner)

**Navigation:**
- Logo linking to homepage
- Three main menu items: Tell Me More | Co-Create With Us | Calendar
- **Status:** ✅ Fully implemented

**Footer:**
- "Explore our Map" link to Kumu
- "Get in Touch" with email: Hello@WovenWeb.org
- COhere logo
- **Status:** ✅ Mostly implemented (missing Kumu map link)

#### 2. Homepage Content

**Hero Section:**
- Title: "[CO]here"
- Tagline: "A 10-day immersive game about people, place & cross-pollination"
- Spanish translation included
- Date: "October 17-26th, 2025 across Boulder"
- Registration button (Google Forms link)
- Spanish registration link
- **Status:** ✅ Mostly implemented

**Map Section:**
- Full-width ecosystem map image
- Climatique partnership mention
- Telegram community link
- **Status:** ✅ Implemented

**YouTube Video:**
- Embedded video: "COhere Boulder 2024 10/11-10/20"
- **Status:** ✅ Implemented

**Newsletter CTA:**
- "[CO]here 2024 is complete" heading
- "& the community cultivation continues" subheading
- Newsletter signup link
- **Status:** ✅ Implemented

**Mission Section:**
- "We're at a pivotal point..." content
- "connect community to create a regenerative, resilient future" highlighted
- Game description with honeycomb lattice image
- "What does joining this game look like?" list
- **Status:** ✅ Implemented

**Timeline Section:**
- Timeline image/visualization
- Link to "Tell Me More" page
- "This is for you if..." bullet points
- **Status:** ⚠️ Partially implemented (missing actual timeline visual)

**Support Section:**
- Donation information
- Venmo and PayPal links
- Tax-deductible 501(c)(3) mention
- **Status:** ✅ Implemented

**Values Section:**
- Six values with numbers and descriptions
- Two-column layout
- **Status:** ✅ Implemented

**Map Progress Section:**
- "Which parts of the Boulder web excite you?"
- Link to Kumu interactive map
- **Status:** ⚠️ Partially implemented (missing Kumu link integration)

#### 3. Tell Me More Page

**Content Sections:**
- "A Game You Say?" with spider web metaphor
- Spider web image
- "Choose Your Own Path" section
- Game structure image
- Calendar link emphasis
- Honeycomb timeline image
- "Where is this coming from?" section with yellow background
- Links to partner organizations
- "Why now?" and FAQ sections
- **Status:** ⚠️ Partially implemented (missing images and some content)

#### 4. Co-Create Page

**Main Content:**
- "Have something to share?" heading
- "What gifts do you want to weave into community?" highlighted
- Event hosting instructions with form links
- Community dinner hosting opportunity
- Lightning talk application
- **Status:** ⚠️ Basic structure exists, missing form links

**Event Cards:**
- Five featured events with dates, titles, and locations
- Card-based layout with date badges
- **Status:** ❌ Not implemented in current React version

#### 5. Calendar Page

**Calendar Features:**
- Embedded Google Calendar widget showing September 2025
- Print calendar button
- Google Calendar and iCal subscription links
- "Want More?" section with community calendar links
- **Status:** ❌ Current React has placeholder, needs actual calendar integration

## Gap Analysis & Implementation Plan

### Priority 1: Critical Missing Features

1. **Top Banner Implementation**
   - Add persistent banner with completion message and newsletter link
   - Should be dismissible with cookie storage

2. **Calendar Integration**
   - Replace placeholder with actual Google Calendar embed
   - Add subscription links (Google Calendar & iCal)
   - Implement print functionality

3. **Form Integration**
   - Registration forms (English & Spanish)
   - Event hosting form
   - Community dinner hosting form
   - Lightning talk application form

4. **External Links**
   - Kumu interactive map integration
   - Venmo/PayPal donation links
   - Partner organization links

### Priority 2: Content Completeness

1. **Tell Me More Page**
   - Add missing images (spider web, game structure, timeline)
   - Complete "Where is this coming from?" section with yellow background
   - Add all partner organization links
   - Include FAQ section

2. **Co-Create Page**
   - Implement event cards section
   - Add all form links and descriptions
   - Style date badges and event cards

3. **Homepage Refinements**
   - Add actual timeline visualization (currently placeholder)
   - Ensure all external links are functional

### Priority 3: Visual & UX Enhancements

1. **Styling Consistency**
   - Match WordPress color scheme more closely
   - Yellow highlight backgrounds for emphasis
   - Card shadows and hover effects

2. **Responsive Design**
   - Ensure calendar displays properly on mobile
   - Test form embeds across devices

3. **Animations & Interactions**
   - Smooth scroll to sections
   - Hover effects on cards and buttons
   - Loading states for embedded content

## Technical Implementation Notes

### Required Dependencies
```json
{
  "react-google-calendar-embed": "For calendar integration",
  "react-iframe": "For form embeds",
  "js-cookie": "For banner dismissal"
}
```

### New Components Needed
1. `TopBanner.tsx` - Dismissible announcement banner
2. `EventCard.tsx` - Reusable event card component
3. `CalendarEmbed.tsx` - Google Calendar integration
4. `FormEmbed.tsx` - Google Forms wrapper

### API/External Integrations
1. Google Calendar API for event data
2. Google Forms embeds
3. Kumu map API/embed
4. Payment processor links (Venmo/PayPal)

## Migration Checklist

### Phase 1: Core Functionality (Week 1)
- [ ] Implement top announcement banner
- [ ] Add Google Calendar embed
- [ ] Create event cards for Co-Create page
- [ ] Add all missing form links
- [ ] Implement calendar subscription links

### Phase 2: Content Completion (Week 2)
- [ ] Add all missing images to Tell Me More
- [ ] Complete partner organization links
- [ ] Add FAQ section
- [ ] Implement timeline visualization
- [ ] Add print calendar functionality

### Phase 3: Polish & Testing (Week 3)
- [ ] Cross-browser testing
- [ ] Mobile responsiveness verification
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] External link verification

## Color Palette Comparison

### WordPress Site Colors
- Primary Blue: #2563eb (links, CTAs)
- Yellow Highlight: #fef3c7 (emphasis backgrounds)
- Dark Text: #1f2937
- Light Gray: #f3f4f6 (backgrounds)
- White: #ffffff

### Current React Implementation
- Uses custom earth/nature/community palette
- May need adjustment to match WordPress exactly

## Content Migration Status

| Page | Structure | Content | Styling | Functionality |
|------|-----------|---------|---------|---------------|
| Homepage | ✅ 90% | ✅ 85% | ✅ 80% | ⚠️ 60% |
| Tell Me More | ⚠️ 70% | ⚠️ 60% | ⚠️ 70% | ✅ 90% |
| Co-Create | ⚠️ 50% | ⚠️ 60% | ⚠️ 50% | ❌ 30% |
| Calendar | ❌ 20% | ❌ 10% | ❌ 20% | ❌ 10% |

## Recommendations

1. **Immediate Actions:**
   - Implement Google Calendar embed as it's completely missing
   - Add top announcement banner for consistency
   - Complete event cards on Co-Create page

2. **Short-term Goals:**
   - Achieve 100% content parity across all pages
   - Implement all external integrations (forms, maps, calendars)
   - Match WordPress visual design more closely

3. **Long-term Considerations:**
   - Consider CMS integration for easier content updates
   - Implement analytics to track engagement
   - Add admin panel for event management
   - Create backup/archive system for past events

## Conclusion

The React implementation has a solid foundation with approximately 60% feature parity with the WordPress site. The main gaps are in external integrations (calendar, forms), some missing content sections, and specific visual styling elements. With focused development following this plan, full parity can be achieved in approximately 2-3 weeks of development time.
