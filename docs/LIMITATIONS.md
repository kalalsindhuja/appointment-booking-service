# Limitations and Follow-up Risks

- **In-memory persistence:** Appointments are lost when the process stops. This is intentional under the assignment's no-starter fallback and in-memory-store scope.
- **Single-process concurrency only:** The check-and-insert operation is synchronous within one Node.js process. Multiple processes or service instances do not share the store and are not protected by this mechanism.
- **Production persistence:** A production deployment should use a shared transactional datastore and enforce the provider/time conflict invariant atomically (for example, a PostgreSQL exclusion constraint over provider ID and a half-open timestamp range, with cancelled rows excluded through an appropriate schema strategy).
- **No authentication or authorization:** Deliberately excluded by the assignment. A real service would need access controls before exposing appointment data or cancellation.
- **No availability rules:** The service only prevents collisions with existing active appointments. It does not model provider working hours, holidays, buffers, appointment types, or capacity greater than one.
- **No idempotency key:** A client retry after a network timeout may create a second appointment if it supplies a new appointment ID. Production API design should define idempotency behavior.
- **No notification or external calendar integration:** Deliberately outside scope.

These are explicit scope limitations, not capabilities claimed by the prototype.
