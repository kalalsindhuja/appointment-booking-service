# Development Notes – Appointment Booking Service

## AI-assisted development record

I used AI assistance during development to understand the requirements, work through the booking logic, identify edge cases, and review the implementation.

The following are the main prompts and development tasks covered during the process.

### 1. Understanding the requirements

> Review the appointment booking assignment and identify the required functionality, API operations, validation rules, and important edge cases. Keep the implementation within the scope of the assignment.

### 2. Appointment conflict handling

> Help me implement the appointment overlap check. A provider should not have two active appointments at the same time. Back-to-back appointments should be allowed, and appointments for different providers should not conflict. Explain the logic with examples.

### 3. Implementing the booking service

> Implement the appointment booking functionality using Node.js. Support creating, listing, retrieving, and cancelling appointments. Keep the implementation simple and avoid unnecessary dependencies.

### 4. Input validation

> Review the appointment creation logic and handle missing fields, invalid provider IDs, invalid timestamps, and cases where the end time is earlier than or equal to the start time. Ensure invalid requests do not modify the stored data.

### 5. Date and time handling

> Ensure appointment timestamps are handled consistently. Support timestamps containing UTC (`Z`) or an explicit time-zone offset. Compare appointments based on their actual time and reject invalid timestamp values.

### 6. Writing test cases

> Write test cases covering successful appointment creation, retrieving appointments, listing appointments, cancellation, overlapping appointments, adjacent appointments, different providers, invalid inputs, and unknown appointment IDs. Also verify that cancelled appointments do not block future bookings.

### 7. Implementing HTTP endpoints

> Expose the appointment service through HTTP endpoints for health checks, creating appointments, listing appointments, retrieving an appointment by ID, and cancelling an appointment. Return appropriate HTTP status codes and JSON error messages.

### 8. Code review

> Review the implementation for potential issues in the booking conflict logic, input validation, date handling, duplicate IDs, cancellation behaviour, and API responses. Identify missing edge cases and suggest improvements without introducing unnecessary complexity.

### 9. Documentation

> Prepare the project documentation with setup instructions, API endpoint details, request examples, validation rules, assumptions, and instructions for running the tests. Include the limitations of using in-memory storage.

## Implementation decisions

- Appointment times are compared using their actual timestamps.
- Input timestamps must include `Z` or an explicit UTC offset.
- Appointment intervals follow the `[start, end)` convention. This allows one appointment to start exactly when another appointment ends.
- The overlap condition for appointments belonging to the same provider is:

```js
newStart < existingEnd && newEnd > existingStart
```

- Cancelled appointments are excluded from conflict checks.
- Appointment data is currently maintained in an in-memory store.

## Scope and limitations

This implementation is a prototype intended to demonstrate the appointment booking workflow and API behaviour.

The current version does not include database persistence, authentication, notifications, recurring appointments, or deployment configuration.

Since the application uses in-memory storage, appointment data will be lost when the server restarts. A production implementation would require persistent storage and database-level transaction handling to prevent conflicting bookings across multiple server instances.

## Final verification

- Run the test command mentioned in the README.
- Verify that all test cases pass.
- Check that the API endpoint paths and request examples match the implementation.
- Verify the setup instructions from a fresh checkout.
- Ensure no credentials, tokens, or sensitive environment files are committed.
