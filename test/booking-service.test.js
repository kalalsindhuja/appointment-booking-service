import test from 'node:test';
import assert from 'node:assert/strict';
import { BookingService } from '../src/booking-service.js';

const slot = (overrides = {}) => ({
  providerId: 'provider-A',
  start: '2026-11-02T09:00:00Z',
  end: '2026-11-02T09:30:00Z',
  ...overrides
});

test('books a valid appointment and normalizes offsets to UTC', () => {
  const service = new BookingService({ idFactory: () => 'apt-1' });
  const result = service.book(slot({ start: '2026-11-02T10:00:00+01:00', end: '2026-11-02T10:30:00+01:00' }));
  assert.equal(result.ok, true);
  assert.equal(result.appointment.id, 'apt-1');
  assert.equal(result.appointment.start, '2026-11-02T09:00:00.000Z');
  assert.equal(result.appointment.status, 'active');
  assert.equal(result.appointment.cancelledAt, null);
});

test('rejects partial, contained, and encompassing overlaps for same provider', () => {
  const service = new BookingService();
  assert.equal(service.book(slot()).ok, true);
  for (const candidate of [
    { start: '2026-11-02T09:10:00Z', end: '2026-11-02T09:20:00Z' },
    { start: '2026-11-02T08:50:00Z', end: '2026-11-02T09:10:00Z' },
    { start: '2026-11-02T09:20:00Z', end: '2026-11-02T09:40:00Z' },
    { start: '2026-11-02T08:50:00Z', end: '2026-11-02T09:40:00Z' }
  ]) assert.equal(service.book(slot(candidate)).code, 'BOOKING_CONFLICT');
  assert.equal(service.list().length, 1);
});

test('allows exact adjacency before and after an appointment', () => {
  const service = new BookingService();
  assert.equal(service.book(slot()).ok, true);
  assert.equal(service.book(slot({ start: '2026-11-02T08:30:00Z', end: '2026-11-02T09:00:00Z' })).ok, true);
  assert.equal(service.book(slot({ start: '2026-11-02T09:30:00Z', end: '2026-11-02T10:00:00Z' })).ok, true);
});

test('allows overlapping appointments for different providers', () => {
  const service = new BookingService();
  assert.equal(service.book(slot()).ok, true);
  assert.equal(service.book(slot({ providerId: 'provider-B' })).ok, true);
});

test('cancellation releases the slot and retains cancellation metadata', () => {
  let id = 0;
  const service = new BookingService({ idFactory: () => `apt-${++id}` });
  const first = service.book(slot());
  const cancelled = service.cancel(first.appointment.id);
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.appointment.status, 'cancelled');
  assert.ok(cancelled.appointment.cancelledAt);
  assert.equal(service.book(slot()).ok, true);
});

test('reports missing and already-cancelled appointments clearly', () => {
  const service = new BookingService();
  assert.equal(service.cancel('missing').code, 'APPOINTMENT_NOT_FOUND');
  const booking = service.book(slot());
  service.cancel(booking.appointment.id);
  assert.equal(service.cancel(booking.appointment.id).code, 'ALREADY_CANCELLED');
});

test('rejects missing, blank, non-string, and malformed identifiers without mutation', () => {
  const service = new BookingService();
  for (const providerId of [undefined, '', '   ', 123, null]) {
    const result = service.book(slot({ providerId }));
    assert.equal(result.ok, false);
  }
  assert.equal(service.list().length, 0);
  assert.equal(service.cancel(' ').code, 'INVALID_APPOINTMENT_ID');
});

test('rejects malformed timestamps, timezone-less values, rollover dates and invalid offsets', () => {
  const service = new BookingService();
  const invalid = [
    'not-a-date', '2026-11-02T09:00:00', '2026-02-30T09:00:00Z',
    '2026-11-02T24:00:00Z', '2026-11-02T09:60:00Z',
    '2026-11-02T09:00:00+14:01', '2026-11-02T09:00:00+99:99',
    '2026-11-02', '2026-11-02T09:00:00.123456Z', null, 123
  ];
  for (const start of invalid) assert.equal(service.book(slot({ start })).code, 'INVALID_TIMESTAMP');
  assert.equal(service.list().length, 0);
});

test('rejects zero and negative durations without mutation', () => {
  const service = new BookingService();
  assert.equal(service.book(slot({ end: '2026-11-02T09:00:00Z' })).code, 'INVALID_DURATION');
  assert.equal(service.book(slot({ end: '2026-11-02T08:59:00Z' })).code, 'INVALID_DURATION');
  assert.equal(service.list().length, 0);
});

test('rejects duplicate or invalid explicit appointment IDs', () => {
  const service = new BookingService({ idFactory: () => 'same-id' });
  assert.equal(service.book(slot({ appointmentId: ' ' })).code, 'INVALID_APPOINTMENT_ID');
  assert.equal(service.book(slot()).ok, true);
  assert.equal(service.book(slot()).code, 'DUPLICATE_APPOINTMENT_ID');
  assert.equal(service.list().length, 1);
});

test('rejects non-object request payloads', () => {
  const service = new BookingService();
  assert.equal(service.book(null).code, 'INVALID_REQUEST');
  assert.equal(service.book([]).code, 'INVALID_REQUEST');
  assert.equal(service.list().length, 0);
});

test('list supports provider and status filtering and returns detached records', () => {
  const service = new BookingService();
  const a = service.book(slot());
  service.book(slot({ providerId: 'provider-B' }));
  service.cancel(a.appointment.id);
  assert.equal(service.list({ providerId: 'provider-A' }).length, 1);
  assert.equal(service.list({ status: 'active' }).length, 1);
  const detached = service.get(a.appointment.id);
  detached.status = 'active';
  assert.equal(service.get(a.appointment.id).status, 'cancelled');
});

test('overlapping concurrent calls in one process cannot both succeed', async () => {
  let id = 0;
  const service = new BookingService({ idFactory: () => `apt-${++id}` });
  const results = await Promise.all([
    Promise.resolve().then(() => service.book(slot())),
    Promise.resolve().then(() => service.book(slot({ start: '2026-11-02T09:10:00Z', end: '2026-11-02T09:40:00Z' })))
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.code === 'BOOKING_CONFLICT').length, 1);
  assert.equal(service.list().length, 1);
});

test('failed booking attempts never mutate previously stored appointments', () => {
  const service = new BookingService({ idFactory: (() => { let n = 0; return () => `stable-${++n}`; })() });
  const original = service.book(slot());
  const before = service.list();

  const failures = [
    service.book(slot({ start: 'not-a-timestamp' })),
    service.book(slot({ end: '2026-11-02T09:00:00Z' })),
    service.book(slot({ providerId: ' ' })),
    service.book(slot({ start: '2026-11-02T09:10:00Z', end: '2026-11-02T09:20:00Z' }))
  ];

  assert.ok(failures.every((result) => result.ok === false));
  assert.deepEqual(service.list(), before);
  assert.equal(service.get(original.appointment.id).status, 'active');
});

test('accepts millisecond precision and compares exact millisecond boundaries', () => {
  const service = new BookingService();
  assert.equal(service.book(slot({
    start: '2026-11-02T09:00:00.125Z',
    end: '2026-11-02T09:00:00.500Z'
  })).ok, true);
  assert.equal(service.book(slot({
    start: '2026-11-02T09:00:00.500Z',
    end: '2026-11-02T09:00:00.750Z'
  })).ok, true);
});
