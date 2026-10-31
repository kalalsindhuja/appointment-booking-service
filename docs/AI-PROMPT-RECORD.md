# AI-Assisted Engineering Prompt Record

This file records the prompts used to guide the AI-assisted engineering workflow. The prompts below are consolidated, reproducible prompt records of the activities performed during the work; they are not represented as verbatim exports of separate chat messages. The implementation and test results were reviewed locally before submission.

## Prompt 1 — Requirement analysis and decomposition

> Analyze the Appointment B scheduling assignment before proposing code. Extract the functional requirements, scope boundaries, acceptance criteria, assumptions, service boundary, booking invariant, edge cases, and a small implementation plan. If no starter project is supplied, use the explicitly permitted in-memory service fallback. Do not add a frontend, database, authentication, notifications, recurring availability, or deployment.

**AI contribution:** Structured the requirements and highlighted the interval invariant, cancellation semantics, UTC requirement, and required verification evidence.

**Decision:** Accepted the bounded service approach. The solution stays within the fallback scope and does not add a database or frontend.

**Informed:** `README.md`, `docs/DESIGN.md`, service and test decomposition.

## Prompt 2 — Booking domain and conflict invariant

> Design and implement a small JavaScript appointment booking service using an in-memory repository. Validate non-empty provider and appointment identifiers, explicit-timezone ISO-8601 timestamps, and a strictly positive interval. Normalize instants to UTC. Reject duplicate appointment IDs. Prevent overlap only for active appointments belonging to the same provider. Use half-open intervals [start, end), with the conflict predicate `newStart < existingEnd && newEnd > existingStart`. Ensure a rejected operation does not mutate stored appointments. Explain the algorithm and its edge cases.

**AI contribution:** Suggested the half-open interval model and the standard overlap predicate.

**Decision:** Accepted the predicate and independently checked partial overlap, identical intervals, containment in both directions, and exact adjacency. Validation occurs before insertion.

**Informed:** `src/booking-service.js`, `docs/DESIGN.md`, `test/booking-service.test.js`.

## Prompt 3 — Cancellation behavior

> Add cancellation by appointment ID. Return a clear not-found result for an unknown ID and a clear already-cancelled result for a repeated cancellation. Retain the appointment record and cancellation status/timestamp for history. Ensure cancelled appointments are excluded from future conflict checks, so their time can be booked again. Do not delete the record.

**AI contribution:** Recommended a status transition rather than deleting the appointment.

**Decision:** Accepted. Cancellation retains the record and marks it cancelled; conflict detection considers active records only.

**Informed:** `src/booking-service.js`, cancellation tests, `docs/DESIGN.md`.

## Prompt 4 — Focused automated tests

> Create focused automated tests using the built-in Node.js test runner. Cover successful booking, same-provider overlap, adjacency, different providers, cancellation and rebooking, missing and already-cancelled IDs, missing identifiers, malformed or timezone-less timestamps, invalid intervals, duplicate IDs, no mutation on failure, and overlapping concurrent calls. Add HTTP integration tests for create, read, list, conflict, cancellation, rebooking, malformed JSON, invalid requests, and concurrent requests. Do not weaken the invariant to make a test pass.

**AI contribution:** Proposed a scenario matrix and test cases beyond the minimum acceptance list.

**Decision:** Accepted and expanded the test coverage. Tests were executed locally using `npm test`; the current suite reports 20 passing tests.

**Informed:** `test/booking-service.test.js`, `test/http-api.test.js`.

## Prompt 5 — Concurrency and persistence review

> Review the booking operation for check-then-insert race conditions. Explain precisely what synchronous in-memory check-and-insert guarantees within one Node.js process, and what it does not guarantee across processes or server instances. Keep the assignment implementation minimal. Recommend a focused concurrency test and document the production persistence/transaction requirement without claiming distributed safety.

**AI contribution:** Distinguished single-process synchronous execution from multi-instance concurrency and recommended documenting the boundary.

**Decision:** Accepted. The service performs conflict-check and insertion synchronously in one process. No distributed-locking or database infrastructure was added. The limitation is documented.

**Informed:** `src/booking-service.js`, `test/booking-service.test.js`, `test/http-api.test.js`, `docs/DESIGN.md`, `docs/LIMITATIONS.md`.

## Prompt 6 — Minimal HTTP interface

> Expose the same booking domain service through a minimal Node.js HTTP API. Support creating appointments, listing appointments, reading one appointment, and cancelling by ID. Keep business rules in the service, not in route handlers. Validate request bodies, return consistent JSON errors and appropriate HTTP status codes, handle malformed and oversized bodies, and do not introduce external dependencies or out-of-scope product features.

**AI contribution:** Suggested a thin HTTP adapter over the domain service.

**Decision:** Accepted with scope control. The API delegates booking decisions to the service and shares its in-memory repository. No frontend or third-party framework was introduced.

**Informed:** `src/server.js`, `test/http-api.test.js`, `README.md`.

## Prompt 7 — Independent review

> Act as an independent reviewer. Compare the implementation with every assignment acceptance criterion. Look for interval boundary errors, timezone parsing mistakes, invalid-input mutation, duplicate IDs, cancellation behavior, race-condition overclaims, API error handling, and scope creep. Separate confirmed defects from production follow-up risks. Do not assume passing tests prove correctness; identify additional adversarial tests.

**AI contribution:** Provided a review checklist and highlighted the need to state concurrency and persistence limitations accurately.

**Decision:** Used as a checklist rather than accepting suggestions blindly. Edge cases were checked against implementation and tests. The documented multi-instance limitation was retained.

**Informed:** Service, tests, `docs/DESIGN.md`, `docs/LIMITATIONS.md`.

## Prompt 8 — Documentation and run instructions

> Prepare concise reviewer-facing documentation for this bounded appointment feature. Include setup and run commands, API examples, service boundary, data model, booking invariant, UTC assumptions, persistence and concurrency approach, AI-use decisions, verification commands, and limitations. Only claim behavior that is present in the source and verified by tests.

**AI contribution:** Drafted documentation structure and explanations.

**Decision:** Edited documentation to match the actual code and test commands. Verification evidence is the local `npm test` run: 20 tests passed, 0 failed.

**Informed:** `README.md`, `docs/DESIGN.md`, this file, `docs/LIMITATIONS.md`.

## Verification evidence

Run from the repository root:

```bash
npm test
```

Observed local result at packaging time:

```text
1..20
# tests 20
# pass 20
# fail 0
```

The tests include unit-level booking/cancellation cases and HTTP integration cases. This evidence verifies the tested single-process behavior; it does not establish persistence across restarts or distributed concurrency across multiple service instances.


## Additional prompt — Resolve API route-not-found behavior

**Prompt:** The candidate provided a response screenshot with `ROUTE_NOT_FOUND` and asked for an end-to-end working solution. The URL and HTTP method were not visible, so the exact failing route could not be identified.

**AI response summary:** Improve API discoverability and compatibility without changing the booking scope: add `GET /` route discovery, support `/api` and `/api/v1` mount prefixes and trailing slashes, handle CORS preflight, and distinguish unsupported methods (405) from unknown paths (404).

**Decision:** Accepted. Implemented route normalization and discovery in `src/server.js`; added integration tests in `test/http-api.test.js`; documented the routes in `README.md` and `docs/DESIGN.md`.

**Verification evidence:** `npm test` — 23 tests passed. `npm run test:coverage` — 23 tests passed; 96.63% overall line coverage. The screenshot did not include the requested URL/method, so the original trigger cannot be confirmed, but the updated service exposes its routes and supports the common path variants.
