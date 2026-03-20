import { addDays } from 'date-fns';

import { listAppointments, listAvailableSlots } from '@/lib/appointments';
import { prisma } from '@/lib/prisma';

export async function getDashboardData() {
  const [appointments, services] = await Promise.all([
    listAppointments(),
    prisma.service.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ]);

  const availabilityWindowStart = new Date();
  const availabilityWindowEnd = addDays(availabilityWindowStart, 7);

  const availabilityByService = await Promise.all(
    services.map(async (service) => {
      const slots = await listAvailableSlots({
        serviceId: service.id,
        from: availabilityWindowStart,
        to: availabilityWindowEnd,
      });

      return {
        service: {
          id: service.id,
          name: service.name,
          description: service.description,
          durationMinutes: service.durationMinutes,
        },
        slots: slots.slice(0, 3),
      };
    }),
  );

  const serializedAppointments = appointments.map((appointment) => ({
    id: appointment.id,
    appointmentStart: appointment.appointmentStart.toISOString(),
    appointmentEnd: appointment.appointmentEnd.toISOString(),
    status: appointment.status,
    notes: appointment.notes,
    contact: {
      name: appointment.contact.name,
      phone: appointment.contact.phone,
    },
    service: appointment.service
      ? {
          id: appointment.service.id,
          name: appointment.service.name,
          description: appointment.service.description,
          durationMinutes: appointment.service.durationMinutes,
        }
      : null,
  }));

  const serializedServices = services.map((service) => ({
    id: service.id,
    name: service.name,
    description: service.description,
    durationMinutes: service.durationMinutes,
  }));

  return {
    appointments: serializedAppointments,
    services: serializedServices,
    availabilityByService,
  };
}
