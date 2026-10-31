# Appointment Booking Service

A bounded, runnable Node.js REST API for conflict-safe appointment booking and cancellation. It uses an in-memory repository as permitted by the assignment; no frontend, external packages, or database are required.

## Requirements

- Node.js 20 or newer
- npm (bundled with Node.js)

## Run locally

```bash
npm test
npm start
```

The API listens on `http://localhost:3000` by default. Set `PORT` to change the port. `PORT=0` asks the operating system to select an available port. Open `http://localhost:3000/` first for a JSON route directory; `/health` confirms the process is responding. The API also accepts `/api` and `/api/v1` prefixes (for example, `/api/v1/appointments`) and trailing slashes.

## API

### Create an appointment

```bash
curl -i -X POST http://localhost:3000/appointments \
  -H 'content-type: application/json' \
  -d '{"providerId":"provider-1","start":"2026-11-02T09:00:00Z","end":"2026-11-02T09:30:00Z"}'
```

Optional `appointmentId` can be supplied; otherwise a UUID is generated.

### List appointments

```bash
curl 'http://localhost:3000/appointments'
curl 'http://localhost:3000/appointments?providerId=provider-1&status=active'
```

### Get one appointment

```bash
curl http://localhost:3000/appointments/<appointment-id>
```

### Cancel an appointment

```bash
curl -i -X DELETE http://localhost:3000/appointments/<appointment-id>
```

### API discovery and health check

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```

The root route returns the supported endpoint list. `OPTIONS` requests receive a CORS preflight response. Unsupported HTTP methods on known routes return `405 METHOD_NOT_ALLOWED` rather than a generic route-not-found response.

## Behavior and assumptions

- Inputs must be ISO-8601 timestamps with `Z` or an explicit numeric UTC offset. Timezone-less timestamps are rejected. Accepted offsets are normalized and stored as UTC.
- Appointment intervals are half-open `[start, end)`: `start < existingEnd && end > existingStart` is a conflict. Exact adjacency is allowed.
- Only active appointments for the same provider block a booking. Cancelled appointments remain readable but no longer reserve time.
- `end` must be strictly later than `start`; identifiers must be non-empty strings.
- Invalid requests do not mutate stored appointments.
- In-memory data is live and shared by requests handled by the same running process, but is lost on restart. It is not shared across multiple processes or machines.
- The synchronous check-and-insert protects the invariant within this single Node.js process. A multi-instance production deployment must enforce the invariant atomically in a shared persistence layer (e.g. serializable transaction / exclusion constraint or provider-scoped locking). Do not scale this implementation horizontally as-is.
- Conflict lookup is O(n) over stored appointments. This is appropriate for the small in-memory assignment fallback; production scale should use a provider/time indexed persistence query while retaining atomic enforcement.

## HTTP status behavior

- `201`: appointment created
- `200`: read/list/cancel succeeded
- `400`: malformed request, timestamp, identifier, or filter
- `404`: appointment or route not found
- `405`: known route called with an unsupported HTTP method
- `409`: time conflict, duplicate ID, or already-cancelled appointment
- `413`: request body exceeds 16 KB
- `500`: unexpected server error (details are not leaked)

## Project structure

```text
src/
  booking-service.js   # domain rules and in-memory repository
  server.js            # HTTP adapter
  cli.js               # small command-line demonstration
test/
  booking-service.test.js
  http-api.test.js
docs/
  DESIGN.md
  AI-USE.md
```

## AI-use and design records

- `docs/DESIGN.md` describes the service boundary, API, invariant, persistence/concurrency model, assumptions, and risks.
- `docs/AI-USE.md` records the AI prompts and response summaries, accepted/changed decisions, files affected, and verification evidence.

## Scope note

No starter project was present in the supplied task context, so this repository uses the assignment's permitted small-service fallback. The REST API is only an interface to the bounded booking/cancellation slice; it is not a full scheduling product.
