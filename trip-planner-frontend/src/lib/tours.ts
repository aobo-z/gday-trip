/* The "next step" tips shown over each page: what each area is for, one short line each. Targets are CSS
   selectors; a step whose target isn't on screen (no activities yet, a read-only trip) is skipped. */
export interface TourStep { target: string; title: string; body: string }

/** When tips open by themselves: once per page per account, after the page has had time to draw. Tests turn
    `auto` on only where they exercise it. */
export const tipsConfig = { auto: import.meta.env.MODE !== "test", delay: 900 };

export const TOURS: Record<string, TourStep[]> = {
  overview: [
    { target: "nav.nav", title: "Your trip, page by page", body: "Trip pages work on the trip you have open. A number marks something waiting for you." },
    { target: ".top .trip-btn", title: "Switch trips", body: "Jump to another trip. The one under way comes first, then the soonest to start." },
    { target: ".stat:has(.steps-line)", title: "Where the trip is", body: "Planning, Ongoing, Archived, Shared. Owners move it on with the button in the cover." },
    { target: ".stat:has(.pipe-key)", title: "Planning progress", body: "Scheduled, waiting for a time, still voting and rejected at a glance. Branches count with scheduled or waiting." },
    { target: ".mem-card", title: "Travellers", body: "Invite with a code, link or QR. Owners switch roles here; anyone can leave." },
    { target: "[data-tour='help']", title: "Tips any time", body: "Open these tips again for whichever page you're on." },
  ],
  vote: [
    { target: "[data-tour='discover']", title: "Discover places", body: "Search real places near the destination, with a map and an AI note on why each fits." },
    { target: "[data-tour='add-idea']", title: "Add an activity", body: "Enter one by hand. Everyone then votes on it." },
    { target: ".thr-card", title: "How many must approve", body: "Owners tap a figure to set the approvals an activity needs." },
    { target: "[data-seg='voteFilter']", title: "Filter by state", body: "Needs my vote shows only what's waiting on you." },
    { target: ".grid > .tcard", title: "An activity", body: "One cell per traveller's vote; tap your vote again to take it back. A tick means it has enough approvals. Open it for photos, comments and your preferred times." },
  ],
  schedule: [
    { target: ".days", title: "Pick a day", body: "Dots show how many plans each day has. Drop a plan on a day to move it there." },
    { target: ".tl", title: "The day's timeline", body: "Drag a plan to move it, drag its bottom edge to change its length, click it for details. Drop it on the bin to delete it, or send a branch back to voting." },
    { target: "[data-pool-drop='ideas']", title: "Waiting for a time", body: "Approved activities. Drag one onto the timeline; everyone's preferred times appear while you drag." },
    { target: "[data-pool-drop='branches']", title: "Branches", body: "Activities only some of you do, no vote needed. Start one from a voting or rejected activity with +. Going to a branch skips whatever group plan it overlaps." },
    { target: "[data-tour='export']", title: "Export", body: "Download the plans you're going to as a calendar file for your phone or computer." },
  ],
  map: [
    { target: ".trip-map", title: "The trip on a map", body: "Numbered pins are stops in time order. Click a pin for its photo, address and time; Open shows the full activity." },
    { target: ".map-wrap .col > section", title: "Every pinned place", body: "Click a row to find it on the map. A place without a pin can be put on the map from the card below." },
  ],
  expenses: [
    { target: "[data-seg='expTab']", title: "Track, add, settle up", body: "Record spending, split it, then see who owes whom under Balances." },
    { target: "[data-seg='expScope']", title: "Trip or just you", body: "Personal shows only your share against your own budget." },
    { target: ".ex-cur", title: "Display currency", body: "Show amounts in another currency. Records stay in the trip's currency." },
  ],
  trips: [
    { target: "[data-seg='tripFilter']", title: "Upcoming and past", body: "Upcoming counts down to each trip, soonest first." },
    { target: ".grid > .tcard", title: "A trip", body: "The chip says how far off it is. Click to open its overview." },
    { target: "[data-tour='join']", title: "Join a friend's trip", body: "Enter the invite code they sent you." },
  ],
  ai: [
    { target: ".interest-grid", title: "Tell it what you like", body: "Pick up to eight interests, the days, travellers and pace." },
    { target: "[data-tour='plan']", title: "Get a plan", body: "The AI drafts each day and a budget. You can edit everything before creating the trip." },
  ],
  community: [
    { target: "[data-tour='community-tools']", title: "Browse shared trips", body: "Sort by popular or newest, or search by city." },
    { target: ".grid > .tcard", title: "A shared trip", body: "Open it to see each day and copy places into your own trip." },
  ],
  reviews: [
    { target: "[data-seg='reviewTab']", title: "Reviews", body: "Rate fellow travellers once a trip is archived, see what you wrote and what others said about you." },
  ],
};
