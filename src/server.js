import { createServer } from 'node:http';
import { BookingService } from './booking-service.js';

const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = 16 * 1024;

const STATUS_BY_CODE = {
  INVALID_REQUEST: 400,
  INVALID_PROVIDER_ID: 400,
  INVALID_TIMESTAMP: 400,
  INVALID_DURATION: 400,
  INVALID_APPOINTMENT_ID: 400,
  DUPLICATE_APPOINTMENT_ID: 409,
  BOOKING_CONFLICT: 409,
  APPOINTMENT_NOT_FOUND: 404,
  ALREADY_CANCELLED: 409
};

export function createBookingServer({ service = new BookingService() } = {}) {
  return createServer(async (request, response) => {
    setCommonHeaders(response);
    const url = new URL(request.url ?? '/', 'http://localhost');
    // Accept the canonical paths and common reverse-proxy prefixes.
    // This avoids ROUTE_NOT_FOUND when a host mounts the API under /api or /api/v1.
    const routePath = normalizeRoutePath(url.pathname);
    const segments = routePath.split('/').filter(Boolean);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      return response.end();
    }

    try {
      if (request.method === 'GET' && routePath === '/') {
        return sendJson(response, 200, {
          name: 'Appointment Booking Service',
          status: 'ok',
          message: 'API is running. Use one of the supported endpoints below.',
          endpoints: [
            { method: 'GET', path: '/health', description: 'Health check' },
            { method: 'POST', path: '/appointments', description: 'Create an appointment' },
            { method: 'GET', path: '/appointments', description: 'List appointments' },
            { method: 'GET', path: '/appointments/:id', description: 'Get an appointment' },
            { method: 'DELETE', path: '/appointments/:id', description: 'Cancel an appointment' }
          ]
        });
      }

      if (request.method === 'GET' && routePath === '/health') {
        return sendJson(response, 200, { status: 'ok' });
      }

      if (request.method === 'POST' && routePath === '/appointments') {
        const body = await readJsonBody(request);
        const result = service.book(body);
        return result.ok
          ? sendJson(response, 201, result)
          : sendJson(response, STATUS_BY_CODE[result.code] ?? 400, result);
      }

      if (request.method === 'GET' && routePath === '/appointments') {
        const providerId = url.searchParams.get('providerId') ?? undefined;
        const status = url.searchParams.get('status') ?? undefined;
        if (status !== undefined && !['active', 'cancelled'].includes(status)) {
          return sendJson(response, 400, { ok: false, code: 'INVALID_STATUS', error: 'status must be active or cancelled.' });
        }
        if (providerId !== undefined && providerId.trim() === '') {
          return sendJson(response, 400, { ok: false, code: 'INVALID_PROVIDER_ID', error: 'providerId cannot be empty.' });
        }
        return sendJson(response, 200, { ok: true, appointments: service.list({ providerId, status }) });
      }

      if (segments[0] === 'appointments' && segments.length === 2 && request.method === 'GET') {
        const appointmentId = decodePathSegment(segments[1]);
        if (appointmentId === null) return sendJson(response, 400, { ok: false, code: 'INVALID_APPOINTMENT_ID', error: 'Appointment ID is not valid URL encoding.' });
        const appointment = service.get(appointmentId);
        return appointment
          ? sendJson(response, 200, { ok: true, appointment })
          : sendJson(response, 404, { ok: false, code: 'APPOINTMENT_NOT_FOUND', error: 'Appointment was not found.' });
      }

      if (segments[0] === 'appointments' && segments.length === 2 && request.method === 'DELETE') {
        const appointmentId = decodePathSegment(segments[1]);
        if (appointmentId === null) return sendJson(response, 400, { ok: false, code: 'INVALID_APPOINTMENT_ID', error: 'Appointment ID is not valid URL encoding.' });
        const result = service.cancel(appointmentId);
        return result.ok
          ? sendJson(response, 200, result)
          : sendJson(response, STATUS_BY_CODE[result.code] ?? 400, result);
      }

      const knownPath = routePath === '/' || routePath === '/health' || routePath === '/appointments' || (segments[0] === 'appointments' && segments.length === 2);
      if (knownPath) {
        response.setHeader('allow', routePath === '/appointments' ? 'GET, POST, OPTIONS' : segments.length === 2 ? 'GET, DELETE, OPTIONS' : 'GET, OPTIONS');
        return sendJson(response, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'HTTP method is not supported for this route.' });
      }
      return sendJson(response, 404, { ok: false, code: 'ROUTE_NOT_FOUND', error: 'Route was not found. Open GET / for the API route list.' });
    } catch (error) {
      const status = error.statusCode ?? 500;
      const code = status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'INVALID_JSON' : 'INTERNAL_ERROR';
      return sendJson(response, status, {
        ok: false,
        code,
        error: status === 500 ? 'An unexpected server error occurred.' : error.message
      });
    }
  });
}

function normalizeRoutePath(pathname) {
  let path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/api' || path === '/api/v1') return '/';
  if (path.startsWith('/api/v1/')) path = path.slice('/api/v1'.length);
  else if (path.startsWith('/api/')) path = path.slice('/api'.length);
  return path || '/';
}

function decodePathSegment(value) {
  try { return decodeURIComponent(value); }
  catch { return null; }
}

function setCommonHeaders(response) {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
}

function sendJson(response, status, payload) {
  response.writeHead(status);
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body exceeds 16 KB.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    const error = new Error('Request body is required.');
    error.statusCode = 400;
    throw error;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must contain valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }
  const server = createBookingServer();
  server.listen(port, () => {
    const address = server.address();
    console.log(`Appointment API listening on http://localhost:${address.port}`);
  });
}
