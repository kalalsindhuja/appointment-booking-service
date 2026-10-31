# Design Specification — Appointment Booking Service

## Scope and boundary

The solution has two layers: a small domain service (`BookingService`) that owns validation, conflict detection and appointment lifecycle; and a thin Node.js HTTP adapter that exposes the service to dynamic clients. The HTTP layer does not contain booking rules. There is no frontend, authentication, notification, recurring availability, calendar integration or external database.

## Data model

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique appointment identifier (UUID by default) |
| `providerId` | string | Provider whose time is reserved |
| `start` | ISO-8601 UTC string | Inclusive start instant, normalized to `Z` |
| `end` | ISO-8601 UTC string | Exclusive end instant, normalized to `Z` |
| `status` | `active \| cancelled` | Whether the appointment blocks time |
| `createdAt` | ISO-8601 UTC string | Creation time |
| `cancelledAt` | ISO-8601 UTC string or `null` | Cancellation time |

Records are stored in a `Map` keyed by appointment ID. Stored records are immutable snapshots; reads return copies. Cancellation replaces the stored snapshot rather than deleting history.

## API contract

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/appointments` | Validate and create appointment |
| `GET` | `/appointments` | List; optional `providerId` and `status` filters |
| `GET` | `/appointments/:id` | Read one appointment |
| `DELETE` | `/appointments/:id` | Cancel an active appointment |
| `GET` | `/health` | Process health check |
| `GET` | `/` | API discovery document listing supported routes |

All routes also accept optional `/api` or `/api/v1` prefixes and a trailing slash. `OPTIONS` is supported for browser CORS preflight. Unsupported methods on known routes return `405 METHOD_NOT_ALLOWED`.

Create body: `{ "providerId": "...", "start": "...", "end": "...", "appointmentId": "optional" }`. The API returns JSON with stable error codes. `409 Conflict` is used for booking overlap, duplicate IDs and already-cancelled records; `400` for invalid input; `404` for missing records.

## Booking invariant

For every two active appointments A and B belonging to the same provider, their half-open time intervals must not overlap:

`A.start < B.end && A.end > B.start` must be false.

The service compares the requested interval against active appointments for that provider. The strict inequalities mean that an appointment ending at 10:00 and another beginning at 10:00 are adjacent and valid. Cancelled records are excluded from conflict checks.

## Validation and time

- Identifiers must be non-empty strings; IDs are trimmed before use.
- Timestamps must be full ISO-8601 date-times with seconds, up to millisecond fractional precision, and an explicit `Z` or numeric UTC offset. Calendar dates, clock ranges and offsets are validated; timezone-less and malformed values are rejected.
- Accepted offsets are converted to epoch instants and serialized as UTC `Z` timestamps.
- `end` must be strictly later than `start`.
- Validation and conflict failures return before modifying the repository.
- Request bodies are capped at 16 KB and malformed JSON is handled as a client error. The root route advertises the API routes to make the service discoverable, and route-prefix normalization supports common reverse-proxy mounts (`/api` and `/api/v1`).

## Persistence and concurrency

The fallback store is in-memory as explicitly allowed by the assignment. The domain method's validation, conflict scan and insert are synchronous and contain no `await`, so a single Node.js event loop cannot interleave another request handler inside that critical section. HTTP body reads may be asynchronous, but each request enters the synchronous booking operation only after parsing completes. The focused concurrency test verifies that overlapping calls within one process cannot both succeed.

This is not a distributed lock, durability, or multi-process guarantee. Data is lost on restart and separate processes have separate Maps. For production, use a shared database and enforce the invariant at the persistence boundary using a serializable transaction plus provider-scoped locking, or a database-native range/exclusion constraint where supported. A plain read-then-insert transaction under weak isolation is not sufficient. Any retry policy must distinguish a genuine conflict from a transient transaction failure.

## Dynamic data and scale tradeoffs

Requests can create, read, list and cancel appointments while the process is running; subsequent requests observe those changes immediately. The current conflict scan is O(n) over all stored appointments. A provider-indexed repository or database index can reduce lookup work, but indexing alone does not solve cross-instance races. The bounded assignment favors transparent correctness over premature infrastructure.

## Limitations / follow-up risks

- No durable persistence, replication, distributed locking or horizontal scaling.
- No authentication/authorization; callers can currently book or cancel any identifier.
- No idempotency key for safe client retries after network timeouts.
- No pagination or retention policy for long-lived appointment history.
- No recurring schedules, provider working hours, buffers, capacity greater than one, or daylight-saving business rules; timestamps represent instants, not local wall-clock schedules.
- Conflict search is linear and suitable only for a small in-memory prototype.
