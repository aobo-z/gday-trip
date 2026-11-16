# G'Day Trip

G'Day Trip is a collaborative trip-planning web application. A group plans one trip together:
members propose and vote on activities, schedule them on a shared calendar, share announcements and
files, and record and settle shared expenses in several currencies.

Built as a five-person team project at the University of Sydney (2026).

| Part | Technology |
|---|---|
| Backend | Java 17, Spring Boot (REST API, Spring Security with JWT, Spring Data JPA) |
| Database | MySQL 8, schema created by Hibernate and maintained with Flyway |
| Frontend | React 19, TypeScript, Vite, React Router, Axios, Leaflet |
| Testing | JUnit 5, Mockito, H2 and JaCoCo (383 backend tests, 93% instruction coverage); Vitest and React Testing Library (142 frontend tests) |

```
trip-planner-backend/    Spring Boot application (Maven)
trip-planner-frontend/   React single-page application (npm)
Jenkinsfile              CI pipeline: backend tests, frontend lint and build
```

## Functionalities

**Accounts and administration**
- Register, sign in (JWT) and sign out; edit profile, change email or password, and choose a colour theme.
- Administrators manage users (disable or re-enable accounts), view and delete any trip, switch each
  external service on or off, choose the map provider and test the connection to each service.

**Trips and members**
- Create, edit, start, archive and delete trips with a destination, dates, cover photo, planned budget,
  base currency and voting threshold.
- Generate a full trip plan with AI from a short brief, then edit it and save it as a new trip.
- Invite members by email, invite code, link or QR code; accept or decline invitations; leave a trip.
- Owners manage members and roles, including making another member an owner.
- Trip announcements and shared trip files (upload, preview, download).
- Post-trip reviews of travel companions.

**Activities and voting**
- Propose activities by hand or by searching real places (Google Places) with photos.
- Ask for an AI recommendation that explains why a place suits the trip.
- Vote to approve or reject proposals; a proposal is approved when it reaches the trip's voting threshold.
- Comment on activities and attach photos; withdraw a vote.

**Scheduling**
- Set preferred times for an activity; schedule approved activities on a day-by-day calendar
  by drag and drop; group activities cannot overlap.
- Branch plans: alternative activities in the same time slot, so the group can split up; members join
  or leave a branch.
- View the trip on a map (Google Maps or OpenStreetMap).
- Export my schedule as an iCalendar (.ics) file.
- Update history of changes made to the trip.

**Budget, expenses and settlement**
- Record expenses in one of ten currencies (AUD, USD, CNY, EUR, GBP, JPY, NZD, CAD, SGD, HKD),
  converted to the trip's base currency at the day's rate.
- Split equally, by custom amounts or item by item; attach a receipt; link an expense to an activity.
- Set a personal budget and track spending against it.
- View who owes whom, get suggested settlements, record and void payments.

**Community**
- Share a trip to the community (and take it back), browse shared trips, like and comment on them,
  and copy a shared place into one of your own trips.

## Libraries and versions

### Backend (`trip-planner-backend/pom.xml`)

| Library | Version | Used for |
|---|---|---|
| Spring Boot (parent and starters: webmvc, data-jpa, security, validation, json, flyway) | 4.1.1 | Application framework |
| Spring Framework (Web MVC) | 7.0.9 | REST controllers |
| Spring Security | 7.1.1 | Authentication and authorisation |
| Hibernate ORM | 7.4.5.Final | JPA implementation |
| Flyway (core, mysql) | 12.4.0 | Database migrations |
| MySQL Connector/J | 9.7.0 | MySQL driver |
| JJWT (api, impl, jackson) | 0.12.6 | JSON Web Tokens |
| Jackson Databind | 3.1.5 | JSON serialisation |
| Apache Tomcat (embedded) | 11.0.24 | Web server |
| Lombok | 1.18.46 | Boilerplate generation |
| JUnit Jupiter | 6.0.3 | Tests |
| Mockito | 5.23.0 | Mocks in unit tests |
| AssertJ | 3.27.7 | Test assertions |
| H2 Database | 2.4.240 | In-memory database for tests |
| JaCoCo Maven plugin | 0.8.12 | Test coverage report |

### Frontend (`trip-planner-frontend/package.json`)

| Library | Version | Used for |
|---|---|---|
| React / React DOM | 19.2.8 | User interface |
| React Router DOM | 7.18.3 | Client-side routing |
| Axios | 1.20.0 | HTTP calls to the REST API |
| Leaflet | 1.9.4 | OpenStreetMap trip map |
| qrcode.react | 4.2.0 | QR codes for trip invitations |
| TypeScript | 6.0.3 | Type checking |
| Vite | 8.2.2 | Dev server and build |
| @vitejs/plugin-react | 6.1.1 | React support for Vite |
| Vitest | 5.0.2 | Unit tests |
| @vitest/coverage-v8 | 5.0.2 | Test coverage |
| Testing Library (react / jest-dom / user-event) | 16.3.0 / 6.6.3 / 14.6.1 | Component tests |
| jsdom | 26.1.0 | Browser environment for tests |
| oxlint | 1.80.0 | Linting |

### External services

| Service | Used for | Key needed |
|---|---|---|
| Google Places API (New) | Place search and place photos | `GOOGLE_PLACES_API_KEY` (backend) |
| Google Gemini API | AI trip plans and place recommendations | `GEMINI_API_KEY` (backend) |
| Google Maps JavaScript API | Trip map when "Google" is the map provider | `VITE_GOOGLE_MAPS_KEY`, `VITE_GOOGLE_MAP_ID` (frontend) |
| OpenStreetMap tiles | Trip map when "OpenStreetMap" is the map provider (default) | None |
| fawazahmed0 currency-api | Daily exchange rates | None |

## Running the application

### Prerequisites

- JDK 17 or later
- Node.js 20.19+ or 22.12+ (tested with 22.18) and npm
- MySQL 8 with an empty database, for example `CREATE DATABASE tripplanner;`
- API keys for the external services you want to use (see below)

### 1. Get the API keys

The backend starts without them, but place search, place photos and the AI features return an error
until the keys are set. To enable those features, create the following keys:

- **Google Places API key**: in the [Google Cloud Console](https://console.cloud.google.com/), create a
  project, enable **Places API (New)**, and create an API key under *APIs & Services > Credentials*.
- **Gemini API key**: create one in [Google AI Studio](https://aistudio.google.com/app/apikey).
- **Google Maps key and Map ID** (optional): enable **Maps JavaScript API** in the same Google Cloud
  project, create a browser key restricted to your frontend's origin, and create a JavaScript (vector)
  Map ID under *Google Maps Platform > Map management*. Without them, use OpenStreetMap.

The backend reads its keys from environment variables (step 2) and the frontend reads its keys from
`trip-planner-frontend/.env.local` (step 3).

### 2. Start the backend

Set these environment variables:

| Variable | Required | Description |
|---|---|---|
| `DB_URL` | Yes | JDBC URL, e.g. `jdbc:mysql://localhost:3306/tripplanner?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC` |
| `DB_USERNAME` | Yes | MySQL user |
| `DB_PASSWORD` | Yes | MySQL password |
| `JWT_SECRET` | Yes | Any random string of at least 32 characters, used to sign login tokens |
| `GOOGLE_PLACES_API_KEY` | For place search and photos | Google Places API key |
| `GEMINI_API_KEY` | For AI features | Gemini API key |
| `APP_CORS_ALLOWED_ORIGINS` | No | Frontend origins allowed to call the API, comma-separated. Default `http://localhost:5173` |

PowerShell:
```powershell
$env:DB_URL="jdbc:mysql://localhost:3306/tripplanner?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
$env:DB_USERNAME="root"; $env:DB_PASSWORD="..."; $env:JWT_SECRET="..."
$env:GOOGLE_PLACES_API_KEY="..."; $env:GEMINI_API_KEY="..."
cd trip-planner-backend
.\mvnw spring-boot:run
```

macOS / Linux:
```bash
export DB_URL="jdbc:mysql://localhost:3306/tripplanner?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC"
export DB_USERNAME="root" DB_PASSWORD="..." JWT_SECRET="..."
export GOOGLE_PLACES_API_KEY="..." GEMINI_API_KEY="..."
cd trip-planner-backend
chmod +x mvnw   # first time only
./mvnw spring-boot:run
```

In IntelliJ IDEA, open `trip-planner-backend` as a Maven project, add the variables above under
*Run/Debug Configurations > Environment variables*, and run `TripPlannerBackendApplication`.

The API starts at `http://localhost:8080/api`. On first start Hibernate creates the tables in the empty
database. To make an account an administrator, register it in the app and then run
`UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';`.

### 3. Start the frontend

```bash
cd trip-planner-frontend
npm install
npm run dev
```

Open `http://localhost:5173`. By default the frontend calls the backend on port 8080 of the same host,
for example `http://localhost:8080/api`.
To use Google Maps or another backend address, copy `.env.example` to `.env.local` and set
`VITE_GOOGLE_MAPS_KEY`, `VITE_GOOGLE_MAP_ID` or `VITE_API_URL`.

## Tests and coverage

Backend tests use an in-memory H2 database and mocked external services, so they need no database,
keys or network:

```bash
cd trip-planner-backend
./mvnw test        # Windows: .\mvnw test
```

JaCoCo writes the coverage report to `trip-planner-backend/target/site/jacoco/index.html`.

Frontend:

```bash
cd trip-planner-frontend
npm test                # run the tests
npm run test:coverage   # report in trip-planner-frontend/coverage/index.html
npm run lint
```
