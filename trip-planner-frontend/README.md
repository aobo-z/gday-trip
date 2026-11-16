# G’Day Trip — frontend

React 19 + TypeScript + Vite single-page app for the Spring Boot backend in `../trip-planner-backend`.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, talks to http://<same host>:8080/api
npm run build      # type-check + production build into dist/
npm run lint
npm test           # unit tests in tests/
npm run test:coverage   # coverage report in coverage/
```

Set `VITE_API_URL` to point at another backend. The trip map needs `VITE_GOOGLE_MAPS_KEY` and
`VITE_GOOGLE_MAP_ID` in `.env.local` (see `.env.example`) when an admin picks Google Maps; with
OpenStreetMap no key is needed.

## Routes

| Route | Page |
| --- | --- |
| `/login`, `/register` | Sign in / create an account |
| `/join/:code` | Invite link or QR: preview a trip and join it |
| `/` | Redirects to the nearest upcoming trip, or to `/trips` |
| `/trip/:tripId/overview` | Hero, spending bubbles, stats, activities, travellers, calendar and timeline, recent activity |
| `/trip/:tripId/vote` | Activities, voting, approval threshold, turning pending or rejected activities into branches |
| `/trip/:tripId/schedule` | Drag-to-schedule timeline, branch plans, calendar view, `.ics` export |
| `/trip/:tripId/map` | Pinned stops (Google Maps or OpenStreetMap) |
| `/trip/:tripId/expenses` | Track, add/edit (equal, custom, by item), balances and settlements |
| `/trips` | All trips, invitations, join with code |
| `/ai` | AI planner: brief → draft → save as a trip |
| `/community` | Published trips; copy a place into your trip |
| `/reviews`, `/profile`, `/settings` | Reviews, own profile, account / theme / admin |

## Layout of `src/`

- `api/` — typed clients for each backend controller.
- `lib/` — session and data providers (`stores.ts`, `DataProviders.tsx`), formatting, domain rules
  that mirror the backend (idea status, clash checks, lifecycle), themes and the WebGL backgrounds.
- `ui/` — icons, small components, the sliding segmented control, dialogs/drawer/toast.
- `parts/` — shared trip pieces (shell, timeline, drawers, forms, map canvases).
- `pages/` — one file per route.
- `styles.css` — design tokens and every component style.

Trips without an uploaded cover show a picture from `public/covers/` (the destination's own when
there is one, otherwise a stable random pick per trip).
