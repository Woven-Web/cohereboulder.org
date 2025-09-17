# COhere Boulder - Next Steps & Evolution Plan

## Vision Evolution: From Event to Living Process

### The New COhere Framework

COhere Boulder is evolving from a one-time 10-day event into an ongoing community weaving process with a repeatable blueprint. This framework creates a living rhythm for community resilience building.

**The Three Phases:**
1. **Invitation** (Sept 24, 2025) - Core contributors gather to vision and commit
2. **Invocation** (Oct 16, 2025) - Community-wide launch, speaking vision into being
3. **Integration** (Oct 26, 2025) - Reflection, deepening bonds, future commitments

**Key Principles:**
- The cycle is repeatable (currently yearly, could adapt to quarterly/bi-yearly)
- The 10-day Invocation→Integration period creates focused community activity
- The "COhere spirit" persists year-round, not just during focused periods
- Discovery of what the COhere spirit is remains part of the journey

## Website Evolution Roadmap

### Priority 1: Invitation Materials (By February 2025)

**Create Invitation Page (`/invitation-2025`):**
```
Content Needs:
- Clear articulation of COhere as ongoing community endeavor
- The three-phase process explained
- What it means to be a core contributor
- Commitment expectations
- RSVP/interest form (Google Form initially, Airtable later)
- Date/time/location for Sept 24 gathering
```

**Invitation Document:**
- Downloadable/shareable PDF or web page
- Vision statement for resilient Boulder
- How COhere creates the blueprint
- Call to action for core contributors

### Priority 2: Historical Archive (By March 2025)

**Create Archive Section (`/archive` or `/history`):**

1. **2024 Event Page (`/archive/2024`):**
   - Move current homepage content
   - Embed YouTube video
   - Event photos/documentation
   - Learnings and reflections
   - "What we discovered" summary

2. **Archive Navigation:**
   - Timeline of past COheres
   - Key outcomes from each cycle
   - Evolution of the vision

### Priority 3: Homepage Redesign (By April 2025)

**New Homepage Structure:**

```jsx
<Hero>
  - "Weaving a More Resilient Boulder"
  - Brief description of ongoing process
  - Current phase indicator (visual)
  - Primary CTA based on current phase
</Hero>

<ThreePhases>
  - Visual representation of cycle
  - Where we are now
  - Next gathering date
</ThreePhases>

<SpiritOfCOhere>
  - What we've learned about COhere spirit
  - Values/principles (from existing content)
  - How it manifests year-round
</SpiritOfCOhere>

<Participate>
  - Different levels of engagement
  - Current opportunities
  - Newsletter signup
</Participate>

<EcosystemMap>
  - Living map concept
  - Current PDF embed
  - "Add yourself" CTA (future)
</EcosystemMap>

<LatestNews>
  - Recent gatherings
  - Upcoming events
  - Community highlights
</LatestNews>
```

## Technical Implementation Plan

### Phase 1: Content & Structure (Q1 2025)

**Week 1-2:**
- [ ] Create invitation page component
- [ ] Set up archive section structure
- [ ] Move 2024 content to archive
- [ ] Create phase indicator component

**Week 3-4:**
- [ ] Design new homepage layout
- [ ] Update navigation to include Archive
- [ ] Create "Spirit of COhere" content section
- [ ] Implement invitation RSVP form

### Phase 2: Data Integration (Q2 2025)

**Airtable Setup:**
```
Tables needed:
- Participants (levels of engagement)
- Events (calendar items)
- Ecosystem Nodes (organizations/projects)
- Gatherings (Invitation/Invocation/Integration records)
- Contributions (what people offer)
```

**Integration Points:**
- Form submissions → Airtable
- Calendar data ← Airtable
- Ecosystem map data ← Airtable
- Email automation triggers

### Phase 3: Interactive Features (Q3 2025)

**Before September Invitation:**
- [ ] Dynamic calendar from Airtable
- [ ] Participant dashboard (optional)
- [ ] Ecosystem map submissions
- [ ] Resource library
- [ ] Story collection system

## Content Strategy

### Immediate Content Needs

1. **Vision Statement** (refined for ongoing process)
2. **Three-Phase Description** (clear, inspiring, actionable)
3. **Core Contributor Invitation** (what, why, how)
4. **Spirit of COhere** exploration
5. **Blueprint Documentation** (for other communities)

### Content Migration Map

| Current Location | New Location | Action | Priority |
|-----------------|--------------|---------|-----------|
| Homepage 2024 content | /archive/2024 | Move | High |
| YouTube video | /archive/2024 | Embed | High |
| Ecosystem map | /ecosystem | Feature | Medium |
| Calendar | /participate/calendar | Enhance | Medium |
| Values section | /about/spirit | Expand | Low |

### New Content Creation

**The Spirit of COhere Page (`/about/spirit`):**
- Draw from existing values section
- Add emerging understanding
- Include quotes from participants
- Visual representation of the spirit

**Blueprint Page (`/blueprint`):**
- How to implement COhere model
- Adaptable framework
- Resources and tools
- Connection to wider movement

## Timeline & Milestones

### January 2025
- [ ] Create invitation page
- [ ] Draft invitation materials
- [ ] Begin archive section setup

### February 2025
- [ ] Complete invitation materials
- [ ] Launch invitation page
- [ ] Begin outreach to core contributors

### March 2025
- [ ] Complete archive migration
- [ ] Start homepage redesign
- [ ] Plan Airtable structure

### April-May 2025
- [ ] Launch new homepage
- [ ] Implement basic Airtable integration
- [ ] Create participant forms

### June-August 2025
- [ ] Build out ecosystem mapping
- [ ] Enhance calendar features
- [ ] Test and refine systems

### September 2025
- [ ] **Sept 24: Invitation Gathering**
- [ ] Capture and share outcomes
- [ ] Open broader participation

### October 2025
- [ ] **Oct 16: Invocation**
- [ ] Support 10-day experience
- [ ] **Oct 26: Integration**

## Key Decisions Needed

1. **Domain/Hosting:**
   - Keep cohereboulder.org?
   - Hosting for React app vs WordPress?

2. **Data Management:**
   - Airtable account setup
   - API integration approach
   - Privacy/data policies

3. **Design System:**
   - Keep current earth/nature theme?
   - Align more with WordPress design?
   - Create new visual identity?

4. **Content Governance:**
   - Who manages updates?
   - Editorial process?
   - Community contribution guidelines?

## Success Metrics

**For Invitation (Sept 24):**
- 20-30 core contributors engaged
- Clear vision alignment
- Committed offerings for Invocation

**For Website:**
- Clear communication of ongoing vision
- Easy participation pathways
- Living documentation of community web
- Replicable blueprint for other communities

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Confusion about shift from event to process | Clear messaging, FAQ, historical context |
| Technical complexity of integrations | Phase approach, start simple |
| Maintaining engagement year-round | Regular touchpoints, newsletter, small gatherings |
| Scope creep on website features | Clear priorities, MVP approach |

## Next Actions

### This Week:
1. Review and refine invitation materials copy
2. Set up basic invitation page structure
3. Create archive section folders
4. Draft "Spirit of COhere" content

### This Month:
1. Complete Priority 1 items
2. Begin stakeholder outreach
3. Plan Airtable structure
4. Gather 2024 documentation for archive

### Ongoing:
1. Weekly check-ins on progress
2. Community feedback loops
3. Documentation of decisions
4. Testing with target users

## Resources Needed

**Human:**
- Developer time (20-30 hours/month)
- Content writer/editor
- Community outreach coordinator
- Airtable administrator

**Technical:**
- Airtable account ($20-45/month)
- Hosting for React app
- Email service (current: Beehiiv)
- Form handling (current: Google Forms)

**Financial:**
- Estimated budget: $500-1000/month for tools
- Developer costs if not volunteer
- Design assets creation

## Conclusion

The evolution of COhere from a 10-day event to an ongoing community weaving process requires thoughtful website changes that honor the past while enabling the future. By focusing on the immediate need for invitation materials, then building out the archive and updating the homepage, we can support the September 2025 cycle while laying groundwork for a sustainable, repeatable process that can inspire communities beyond Boulder.
