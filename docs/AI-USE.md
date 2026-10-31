# AI Assistance and Verification Record

## How AI was used

AI was used as an engineering assistant for requirement decomposition, API-boundary design, edge-case review, test planning, and documentation. The implementation was not accepted solely because AI proposed it: the code was inspected, edge cases were added to automated tests, and the test suite was executed locally.

No credentials, secrets, or personal data were included in prompts.

## Prompt record and decisions

The following records describe the prompts actually submitted in this ChatGPT work session. The first prompt was the full Appointment B assignment brief supplied by the candidate; it is summarized here to keep this record readable.

### Prompt 1 — Assignment brief and implementation request

**Prompt submitted:** The complete Appointment B assignment brief, followed by: "understand the completed problem and do everything that they are asking to do".

**Relevant AI response summary:** Decompose the feature into a small booking domain service, an in-memory repository, a booking/cancellation lifecycle, UTC timestamp validation, the half-open interval conflict rule, focused automated tests, a design specification, setup instructions, an AI-use record, and documented limitations. Do not add a frontend or database when using the no-starter fallback.

**Decision:** Accepted the bounded service boundary, half-open interval rule, in-memory fallback, and required deliverable checklist. Implemented in `src/booking-service.js`, `src/server.js`, `test/`, `docs/DESIGN.md`, and `README.md`.

### Prompt 2 — Dynamic service behavior

**Prompt submitted:** "Give me the best possible solution. which works in all the possible cases and works for dynamic realtime data"

**Relevant AI response summary:** A thin HTTP API would allow requests to create, list, retrieve, and cancel appointments while the process is running. The booking rules should remain in a separate domain service. Dynamic in-process updates do not imply durable storage or multi-instance coordination.

**Decision:** Accepted a built-in Node.js HTTP adapter so the service can be exercised with curl or HTTP clients. Kept the permitted in-memory store and added explicit documentation that it loses data on restart and is not safe across multiple independent processes. No database, frontend, or third-party dependency was added. Implemented in `src/server.js` and `test/http-api.test.js`.

### Prompt 3 — Edge-case and correctness review

**Prompt submitted:** "Review the completed appointment booking service against the acceptance criteria. Identify subtle correctness gaps in timestamp parsing, overlap boundaries, cancellation, invalid-input mutation, and concurrency. Recommend only changes that stay within the assignment scope."

**Relevant AI response summary:** Timestamp precision must match the representation used for comparisons. Accepting more fractional precision than JavaScript `Date` can preserve would silently collapse distinct instants. Invalid requests should be tested against a store that already contains an appointment, not only an empty store. Oversized HTTP payloads and live API state transitions are useful boundary tests.

**Decision:** Accepted these findings. Restricted fractional timestamp precision to milliseconds, documented that assumption, added tests for exact millisecond adjacency and rejected sub-millisecond input, added a no-mutation-on-failure test with an existing record, and added an HTTP payload-size test. Updated `src/booking-service.js`, `README.md`, `docs/DESIGN.md`, `test/booking-service.test.js`, and `test/http-api.test.js`.

## Verification evidence

Commands executed from the project root:

```bash
node --version
npm test
npm run test:coverage
npm run demo
```

The final focused test suite contains 23 automated tests. It covers:

- successful booking and UTC normalization from an explicit offset;
- partial, contained, and encompassing same-provider overlaps;
- exact adjacency on both sides;
- overlapping appointments for different providers;
- cancellation, slot release, missing IDs, and repeated cancellation;
- missing/blank/non-string identifiers and duplicate appointment IDs;
- malformed, timezone-less, impossible-date, invalid-offset, and over-precision timestamps;
- zero/negative duration and no mutation on rejected requests;
- detached read results and filtered listing;
- overlapping calls through the domain service and HTTP server within one process;
- live HTTP create/read/list/conflict/cancel/rebook flow;
- malformed JSON, missing resources, unknown routes, and oversized request bodies.

The HTTP tests start a real local server on an ephemeral port and call it using `fetch`; they verify the network boundary, status codes, response payloads, and state changes. The concurrency tests establish the single-process behavior only. They do not claim distributed locking or multi-process correctness.

## Independent review and limitations

AI suggestions were treated as review input, not proof. The final code was checked against the acceptance criteria and all tests were executed. The in-memory implementation has a synchronous validation/check/insert critical section, which cannot be interleaved by another request handler on the same Node.js event loop. This guarantee does not extend across worker processes, containers, or machines. Production deployment would require a shared persistent store and atomic database-level enforcement of the provider/time invariant.


### Prompt 4 — Route-not-found troubleshooting and API discoverability

**Prompt submitted:** The candidate shared a screenshot showing `{ "ok": false, "code": "ROUTE_NOT_FOUND", "error": "Route was not found." }` and asked: "resolve this issue and give me the end to end working".

**Relevant AI response summary:** The screenshot alone does not identify the exact URL or HTTP method, so the precise original cause cannot be proven. A likely usability gap was that the service had no root discovery route and accepted only canonical paths. The API was updated to return a route directory at `GET /`, accept common `/api` and `/api/v1` prefixes and trailing slashes, answer CORS `OPTIONS` preflight requests, and return `405 METHOD_NOT_ALLOWED` when a known route is called with the wrong method. Unknown paths continue to return a clear 404.

**Decision:** Accepted these bounded API usability improvements. No booking-domain behavior or persistence model was changed. Added HTTP integration tests for root discovery, prefixed paths, trailing slashes, CORS preflight, and unsupported methods. Updated `src/server.js`, `test/http-api.test.js`, `README.md`, and `docs/DESIGN.md`.

**Verification:** `npm test` passed all 23 tests. `npm run test:coverage` also passed all 23 tests and reported 96.63% overall line coverage. The route error is therefore handled for the documented routes and common prefixes; the exact cause of the candidate's original request still depends on the URL and method they used.
