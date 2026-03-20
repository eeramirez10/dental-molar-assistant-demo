import { addDays, format } from 'date-fns';

import { listAppointments, listAvailableSlots } from '@/lib/appointments';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function badgeColor(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'rgba(76, 175, 80, 0.18)';
    case 'CANCELLED':
      return 'rgba(244, 67, 54, 0.18)';
    case 'RESCHEDULED':
      return 'rgba(255, 193, 7, 0.18)';
    case 'COMPLETED':
      return 'rgba(33, 150, 243, 0.18)';
    default:
      return 'rgba(115, 149, 255, 0.18)';
  }
}

export default async function Home() {
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
        service,
        slots: slots.slice(0, 3),
      };
    }),
  );

  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(72, 98, 170, 0.28), transparent 28%), #07111f',
        color: '#f3f7ff',
      }}
    >
      <section
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '56px 24px 72px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 20,
            alignItems: 'flex-end',
            marginBottom: 32,
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-flex',
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(115, 149, 255, 0.14)',
                border: '1px solid rgba(115, 149, 255, 0.3)',
                marginBottom: 18,
                fontSize: 14,
              }}
            >
              Dental La Molar · Demo panel
            </div>

            <h1
              style={{
                fontSize: 'clamp(2.4rem, 6vw, 4.6rem)',
                lineHeight: 0.96,
                margin: '0 0 14px',
                maxWidth: 760,
              }}
            >
              Panel base para agenda y disponibilidad.
            </h1>

            <p
              style={{
                maxWidth: 800,
                color: '#b5c0d8',
                fontSize: 18,
                lineHeight: 1.7,
              }}
            >
              Ya no es pura fe y README. Este panel enseña las citas actuales, el catálogo de
              servicios y los próximos slots disponibles para que la demo se vea como producto y
              no como promesa con autoestima alta.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))',
              gap: 14,
              minWidth: 'min(100%, 360px)',
            }}
          >
            <article
              style={{
                padding: 18,
                borderRadius: 22,
                background: 'rgba(12, 23, 42, 0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 13, color: '#8ea0c7', marginBottom: 8 }}>Citas</div>
              <strong style={{ fontSize: 30 }}>{appointments.length}</strong>
            </article>
            <article
              style={{
                padding: 18,
                borderRadius: 22,
                background: 'rgba(12, 23, 42, 0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ fontSize: 13, color: '#8ea0c7', marginBottom: 8 }}>Servicios</div>
              <strong style={{ fontSize: 30 }}>{services.length}</strong>
            </article>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.3fr 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <section
            style={{
              padding: 24,
              borderRadius: 28,
              background: 'rgba(12, 23, 42, 0.88)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 24, marginBottom: 8 }}>Próximas citas</h2>
                <p style={{ color: '#9db0d6', lineHeight: 1.6 }}>
                  Vista rápida de la agenda actual.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {appointments.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 20,
                    background: 'rgba(255,255,255,0.04)',
                    color: '#b5c0d8',
                  }}
                >
                  No hay citas registradas todavía.
                </div>
              ) : (
                appointments.map((appointment) => (
                  <article
                    key={appointment.id}
                    style={{
                      padding: 18,
                      borderRadius: 22,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 12,
                      }}
                    >
                      <div>
                        <h3 style={{ fontSize: 18, marginBottom: 4 }}>
                          {appointment.contact.name}
                        </h3>
                        <p style={{ color: '#8ea0c7' }}>{appointment.contact.phone}</p>
                      </div>
                      <span
                        style={{
                          alignSelf: 'start',
                          padding: '8px 12px',
                          borderRadius: 999,
                          background: badgeColor(appointment.status),
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: 12,
                          letterSpacing: 0.4,
                        }}
                      >
                        {appointment.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gap: 6, color: '#d7e2ff' }}>
                      <div>
                        <strong>Servicio:</strong> {appointment.service?.name ?? 'Sin servicio'}
                      </div>
                      <div>
                        <strong>Inicio:</strong>{' '}
                        {format(appointment.appointmentStart, "dd/MM/yyyy '·' hh:mm a")}
                      </div>
                      <div>
                        <strong>Fin:</strong>{' '}
                        {format(appointment.appointmentEnd, "dd/MM/yyyy '·' hh:mm a")}
                      </div>
                      {appointment.notes ? (
                        <div>
                          <strong>Notas:</strong> {appointment.notes}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <div style={{ display: 'grid', gap: 20 }}>
            <section
              style={{
                padding: 24,
                borderRadius: 28,
                background: 'rgba(12, 23, 42, 0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              }}
            >
              <h2 style={{ fontSize: 24, marginBottom: 8 }}>Catálogo de servicios</h2>
              <p style={{ color: '#9db0d6', lineHeight: 1.6, marginBottom: 18 }}>
                Duraciones activas del demo para agenda inteligente.
              </p>

              <div style={{ display: 'grid', gap: 12 }}>
                {services.map((service) => (
                  <article
                    key={service.id}
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 6,
                      }}
                    >
                      <strong>{service.name}</strong>
                      <span style={{ color: '#8ea0c7', fontSize: 14 }}>
                        {service.durationMinutes} min
                      </span>
                    </div>
                    <p style={{ color: '#b5c0d8', lineHeight: 1.5 }}>
                      {service.description ?? 'Sin descripción.'}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <section
              style={{
                padding: 24,
                borderRadius: 28,
                background: 'rgba(12, 23, 42, 0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              }}
            >
              <h2 style={{ fontSize: 24, marginBottom: 8 }}>Próximos slots</h2>
              <p style={{ color: '#9db0d6', lineHeight: 1.6, marginBottom: 18 }}>
                Primeros espacios detectados en los próximos 7 días.
              </p>

              <div style={{ display: 'grid', gap: 14 }}>
                {availabilityByService.map(({ service, slots }) => (
                  <article
                    key={service.id}
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: 10 }}>{service.name}</strong>
                    {slots.length === 0 ? (
                      <p style={{ color: '#b5c0d8' }}>Sin espacios detectados en esta ventana.</p>
                    ) : (
                      <ul style={{ display: 'grid', gap: 8, paddingLeft: 18, color: '#d7e2ff' }}>
                        {slots.map((slot) => (
                          <li key={slot.start}>
                            {format(new Date(slot.start), "dd/MM '·' hh:mm a")} →{' '}
                            {format(new Date(slot.end), 'hh:mm a')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
