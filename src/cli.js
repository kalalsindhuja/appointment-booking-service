import { BookingService } from './booking-service.js';

const service = new BookingService();
const request = {
  providerId: 'provider-101',
  start: '2026-11-02T09:00:00Z',
  end: '2026-11-02T09:30:00Z'
};

const booking = service.book(request);
console.log('Booking:', booking);
console.log('Overlapping booking:', service.book({
  ...request,
  start: '2026-11-02T09:15:00Z',
  end: '2026-11-02T09:45:00Z'
}));
if (booking.ok) {
  console.log('Cancellation:', service.cancel(booking.appointment.id));
  console.log('Rebooking released slot:', service.book(request));
}
