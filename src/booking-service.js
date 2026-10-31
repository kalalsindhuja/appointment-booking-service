import { randomUUID } from 'node:crypto';

/**
 * In-memory booking domain service.
 *
 * The validation, overlap check, and insert are deliberately synchronous. In a
 * single Node.js process this critical section cannot be interleaved with
 * another request handler. This does NOT protect multiple processes/instances.
 */
export class BookingService {
  #appointments = new Map();
  #idFactory;

  constructor({ idFactory = randomUUID } = {}) {
    if (typeof idFactory !== 'function') {
      throw new TypeError('idFactory must be a function.');
    }
    this.#idFactory = idFactory;
  }

  book(input = {}) {
    if (!isRecord(input)) return failure('INVALID_REQUEST', 'Request body must be a JSON object.');

    const providerId = normalizeIdentifier(input.providerId);
    if (!providerId) return failure('INVALID_PROVIDER_ID', 'providerId is required and must be a non-empty string.');

    const startMs = parseTimestamp(input.start);
    const endMs = parseTimestamp(input.end);
    if (startMs === null || endMs === null) {
      return failure('INVALID_TIMESTAMP', 'start and end must be valid ISO-8601 timestamps with Z or an explicit UTC offset.');
    }
    if (endMs <= startMs) {
      return failure('INVALID_DURATION', 'Appointment end must be later than start.');
    }

    let id;
    if (input.appointmentId !== undefined) {
      id = normalizeIdentifier(input.appointmentId);
      if (!id) return failure('INVALID_APPOINTMENT_ID', 'appointmentId must be a non-empty string when supplied.');
    } else {
      id = this.#idFactory();
      if (!normalizeIdentifier(id)) {
        return failure('INVALID_APPOINTMENT_ID', 'The appointment ID generator returned an invalid identifier.');
      }
      id = id.trim();
    }

    if (this.#appointments.has(id)) {
      return failure('DUPLICATE_APPOINTMENT_ID', `Appointment ID '${id}' already exists.`);
    }

    // Half-open intervals [start, end): exact adjacency is allowed.
    // Cancelled records are retained for lifecycle/history but do not block time.
    for (const existing of this.#appointments.values()) {
      if (
        existing.status === 'active' &&
        existing.providerId === providerId &&
        startMs < Date.parse(existing.end) &&
        endMs > Date.parse(existing.start)
      ) {
        return failure('BOOKING_CONFLICT', `Requested time overlaps active appointment '${existing.id}'.`, {
          conflictingAppointmentId: existing.id
        });
      }
    }

    const appointment = Object.freeze({
      id,
      providerId,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      status: 'active',
      createdAt: new Date().toISOString(),
      cancelledAt: null
    });
    this.#appointments.set(id, appointment);
    return { ok: true, appointment: { ...appointment } };
  }

  cancel(appointmentId) {
    const id = normalizeIdentifier(appointmentId);
    if (!id) return failure('INVALID_APPOINTMENT_ID', 'appointmentId is required and must be a non-empty string.');

    const existing = this.#appointments.get(id);
    if (!existing) return failure('APPOINTMENT_NOT_FOUND', `Appointment '${id}' was not found.`);
    if (existing.status === 'cancelled') {
      return failure('ALREADY_CANCELLED', `Appointment '${id}' is already cancelled.`);
    }

    const cancelled = Object.freeze({
      ...existing,
      status: 'cancelled',
      cancelledAt: new Date().toISOString()
    });
    this.#appointments.set(id, cancelled);
    return { ok: true, appointment: { ...cancelled } };
  }

  get(appointmentId) {
    const id = normalizeIdentifier(appointmentId);
    if (!id) return null;
    const appointment = this.#appointments.get(id);
    return appointment ? { ...appointment } : null;
  }

  list({ providerId, status } = {}) {
    let appointments = [...this.#appointments.values()];
    if (providerId !== undefined) {
      const normalizedProviderId = normalizeIdentifier(providerId);
      if (!normalizedProviderId) return [];
      appointments = appointments.filter((item) => item.providerId === normalizedProviderId);
    }
    if (status !== undefined) {
      appointments = appointments.filter((item) => item.status === status);
    }
    return appointments.map((item) => ({ ...item }));
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeIdentifier(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function failure(code, error, details = {}) {
  return { ok: false, code, error, ...details };
}

/** Strict ISO timestamp parser; accepts millisecond precision, Z or offsets, and returns epoch ms. */
function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, , , , , zone, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  // Validate calendar date independently; Date.parse alone can normalize invalid dates.
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) return null;

  if (zone !== 'Z') {
    const offsetHours = Number(offsetHourText);
    const offsetMinutes = Number(offsetMinuteText);
    if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return null;
  }

  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}
