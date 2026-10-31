import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingServer } from '../src/server.js';

async function withServer(run) {
  const server = createBookingServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await run(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const payload = (overrides = {}) => ({
  providerId: 'provider-http',
  start: '2026-11-02T09:00:00Z',
  end: '2026-11-02T09:30:00Z',
  ...overrides
});

test('HTTP API supports live create, read, list, conflict, cancel and rebook flow', async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);

    const createdResponse = await fetch(`${base}/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload())
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const id = created.appointment.id;

    const conflictResponse = await fetch(`${base}/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload({ start: '2026-11-02T09:10:00Z', end: '2026-11-02T09:40:00Z' }))
    });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json()).code, 'BOOKING_CONFLICT');

    const readResponse = await fetch(`${base}/appointments/${id}`);
    assert.equal(readResponse.status, 200);

    const listResponse = await fetch(`${base}/appointments?providerId=provider-http&status=active`);
    assert.equal((await listResponse.json()).appointments.length, 1);

    const cancelResponse = await fetch(`${base}/appointments/${id}`, { method: 'DELETE' });
    assert.equal(cancelResponse.status, 200);
    assert.equal((await cancelResponse.json()).appointment.status, 'cancelled');

    const rebookResponse = await fetch(`${base}/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload())
    });
    assert.equal(rebookResponse.status, 201);
  });
});

test('HTTP API returns useful errors for invalid JSON, missing records and unknown routes', async () => {
  await withServer(async (base) => {
    const invalid = await fetch(`${base}/appointments`, { method: 'POST', body: '{bad json' });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'INVALID_JSON');

    const missing = await fetch(`${base}/appointments/not-found`, { method: 'DELETE' });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, 'APPOINTMENT_NOT_FOUND');

    const unknown = await fetch(`${base}/not-a-route`);
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).code, 'ROUTE_NOT_FOUND');
  });
});


test('HTTP API serializes overlapping live requests within one process', async () => {
  await withServer(async (base) => {
    const send = (body) => fetch(`${base}/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const responses = await Promise.all([
      send(payload()),
      send(payload({ start: '2026-11-02T09:05:00Z', end: '2026-11-02T09:35:00Z' }))
    ]);
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [201, 409]);
    const list = await fetch(`${base}/appointments`);
    assert.equal((await list.json()).appointments.length, 1);
  });
});


test('HTTP API rejects invalid intervals without changing existing live data', async () => {
  await withServer(async (base) => {
    const send = (body) => fetch(`${base}/appointments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    const created = await send(payload());
    assert.equal(created.status, 201);

    const invalid = await send(payload({ end: '2026-11-02T09:00:00Z' }));
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'INVALID_DURATION');

    const list = await fetch(`${base}/appointments`);
    const data = await list.json();
    assert.equal(data.appointments.length, 1);
    assert.equal(data.appointments[0].status, 'active');
  });
});

test('HTTP API rejects oversized request bodies', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/appointments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(17 * 1024) })
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  });
});

test('root route describes the API instead of returning ROUTE_NOT_FOUND', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.name, 'Appointment Booking Service');
    assert.ok(body.endpoints.some((item) => item.path === '/appointments' && item.method === 'POST'));
  });
});

test('API accepts /api and /api/v1 prefixes and trailing slashes', async () => {
  await withServer(async (base) => {
    for (const path of ['/api/health', '/api/v1/health', '/health/']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, path);
      assert.equal((await response.json()).status, 'ok');
    }

    const created = await fetch(`${base}/api/v1/appointments/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload())
    });
    assert.equal(created.status, 201);
  });
});

test('API returns 405 and CORS preflight response for unsupported methods', async () => {
  await withServer(async (base) => {
    const wrongMethod = await fetch(`${base}/appointments`, { method: 'PUT' });
    assert.equal(wrongMethod.status, 405);
    assert.equal((await wrongMethod.json()).code, 'METHOD_NOT_ALLOWED');

    const preflight = await fetch(`${base}/appointments`, { method: 'OPTIONS' });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
  });
});
