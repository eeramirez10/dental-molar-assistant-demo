'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';

type ServiceItem = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
};

type AppointmentItem = {
  id: string;
  appointmentStart: string;
  appointmentEnd: string;
  status: string;
  notes: string | null;
  contact: {
    name: string;
    phone: string;
  };
  service: ServiceItem | null;
};

type SlotItem = {
  start: string;
  end: string;
};

type Props = {
  initialAppointments: AppointmentItem[];
  services: ServiceItem[];
  initialAvailabilityByService: Array<{
    service: ServiceItem;
    slots: SlotItem[];
  }>;
};

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

function toDatetimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function cardStyle() {
  return {
    padding: 24,
    borderRadius: 28,
    background: 'var(--card)',
    border: '1px solid var(--card-border)',
    boxShadow: 'var(--shadow)',
  } as const;
}

export default function DashboardClient({
  initialAppointments,
  services,
  initialAvailabilityByService,
}: Props) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [availabilityByService] = useState(initialAvailabilityByService);
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? '');
  const [selectedDateTime, setSelectedDateTime] = useState(toDatetimeLocalValue(new Date()));
  const [slotOptions, setSlotOptions] = useState<SlotItem[]>([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [rescheduleDateTime, setRescheduleDateTime] = useState(toDatetimeLocalValue(new Date()));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateQuery, setDateQuery] = useState('');

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services],
  );

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const matchesStatus = statusFilter === 'ALL' || appointment.status === statusFilter;
      const matchesDate =
        !dateQuery || appointment.appointmentStart.slice(0, 10) === dateQuery.trim();

      return matchesStatus && matchesDate;
    });
  }, [appointments, dateQuery, statusFilter]);

  async function refreshAppointments() {
    const response = await fetch('/api/appointments', { cache: 'no-store' });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? 'No se pudieron cargar las citas.');
    }

    setAppointments(payload.data);
  }

  async function fetchSlots() {
    if (!selectedServiceId || !selectedDateTime) {
      setError('Selecciona servicio y fecha para consultar disponibilidad.');
      return;
    }

    setLoadingSlots(true);
    setError(null);
    setMessage(null);

    try {
      const start = new Date(selectedDateTime);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const params = new URLSearchParams({
        serviceId: selectedServiceId,
        from: start.toISOString(),
        to: end.toISOString(),
      });

      const response = await fetch(`/api/availability?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo consultar disponibilidad.');
      }

      setSlotOptions(payload.data);

      if (payload.data.length === 0) {
        setMessage('No encontré slots para esa ventana. Toca probar otra fecha.');
      } else {
        setSelectedDateTime(toDatetimeLocalValue(new Date(payload.data[0].start)));
        setMessage('Slots cargados. Ya puedes escoger uno para crear la cita.');
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar slots.');
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleCreateAppointment() {
    if (!selectedServiceId) {
      setError('Elige un servicio antes de crear la cita.');
      return;
    }

    if (!selectedDateTime) {
      setError('Elige un horario para la cita.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            name: form.name,
            phone: form.phone,
            email: form.email || undefined,
          },
          serviceId: selectedServiceId,
          appointmentStart: new Date(selectedDateTime).toISOString(),
          notes: form.notes || undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo crear la cita.');
      }

      setMessage('Cita creada correctamente. Ya tenemos paciente en la agenda 😌');
      setForm({ name: '', phone: '', email: '', notes: '' });
      setSlotOptions([]);
      await refreshAppointments();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear la cita.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelAppointment(appointmentId: string) {
    if (!window.confirm('¿Cancelar esta cita?')) {
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'DELETE',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo cancelar la cita.');
      }

      setMessage('Cita cancelada. El sillón volvió a respirar.');
      await refreshAppointments();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar.');
    }
  }

  async function handleRescheduleAppointment(appointmentId: string) {
    if (!rescheduleDateTime) {
      setError('Elige nueva fecha y hora para reagendar.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentStart: new Date(rescheduleDateTime).toISOString(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo reagendar la cita.');
      }

      setMessage('Cita reagendada correctamente. Ahora sí cayó en un slot decente.');
      setRescheduleTargetId(null);
      await refreshAppointments();
    } catch (rescheduleError) {
      setError(
        rescheduleError instanceof Error ? rescheduleError.message : 'No se pudo reagendar.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', color: 'var(--foreground)' }}>
      <section style={{ maxWidth: 1380, margin: '0 auto', padding: '28px 24px 72px' }}>
        <section
          id="overview"
          style={{
            ...cardStyle(),
            marginBottom: 22,
            padding: 32,
            background:
              'linear-gradient(135deg, rgba(115,149,255,0.18), rgba(12,23,42,0.92) 40%, rgba(12,23,42,0.96))',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ maxWidth: 820 }}>
              <div
                style={{
                  display: 'inline-flex',
                  padding: '8px 14px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  marginBottom: 18,
                  fontSize: 14,
                }}
              >
                Dental La Molar · Demo panel interactivo
              </div>

              <h1
                style={{
                  fontSize: 'clamp(2.3rem, 6vw, 4.4rem)',
                  lineHeight: 0.96,
                  marginBottom: 14,
                }}
              >
                Agenda dental con navegación, header y mejor UX.
              </h1>

              <p style={{ maxWidth: 760, color: 'var(--muted)', fontSize: 18, lineHeight: 1.7 }}>
                El panel ya se siente más app y menos experimento suelto: navegación superior,
                resumen rápido, filtros para citas y flujo más cómodo para reservar.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))',
                gap: 14,
                minWidth: 'min(100%, 520px)',
              }}
            >
              <article style={{ ...cardStyle(), padding: 18, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Citas</div>
                <strong style={{ fontSize: 30 }}>{appointments.length}</strong>
              </article>
              <article style={{ ...cardStyle(), padding: 18, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Servicios</div>
                <strong style={{ fontSize: 30 }}>{services.length}</strong>
              </article>
              <article style={{ ...cardStyle(), padding: 18, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Slots vistos</div>
                <strong style={{ fontSize: 30 }}>{slotOptions.length}</strong>
              </article>
            </div>
          </div>
        </section>

        {message ? (
          <div
            style={{
              marginBottom: 18,
              padding: 14,
              borderRadius: 16,
              background: 'rgba(76, 175, 80, 0.15)',
              border: '1px solid rgba(76, 175, 80, 0.3)',
            }}
          >
            {message}
          </div>
        ) : null}
        {error ? (
          <div
            style={{
              marginBottom: 18,
              padding: 14,
              borderRadius: 16,
              background: 'rgba(244, 67, 54, 0.15)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <section id="appointments" style={cardStyle()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 14,
                marginBottom: 18,
                flexWrap: 'wrap',
                alignItems: 'end',
              }}
            >
              <div>
                <h2 style={{ fontSize: 24, marginBottom: 8 }}>Próximas citas</h2>
                <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                  Agenda viva del demo con filtros básicos.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>Estatus</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--foreground)',
                    }}
                  >
                    <option value="ALL">Todos</option>
                    <option value="SCHEDULED">Programadas</option>
                    <option value="RESCHEDULED">Reagendadas</option>
                    <option value="CANCELLED">Canceladas</option>
                    <option value="CONFIRMED">Confirmadas</option>
                    <option value="COMPLETED">Completadas</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 13 }}>Fecha</span>
                  <input
                    type="date"
                    value={dateQuery}
                    onChange={(event) => setDateQuery(event.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--foreground)',
                    }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {filteredAppointments.length === 0 ? (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 20,
                    background: 'var(--card-soft)',
                    color: '#b5c0d8',
                  }}
                >
                  No hay citas que coincidan con tus filtros.
                </div>
              ) : (
                filteredAppointments.map((appointment) => (
                  <article
                    key={appointment.id}
                    style={{
                      padding: 18,
                      borderRadius: 22,
                      background: 'var(--card-soft)',
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
                        <h3 style={{ fontSize: 18, marginBottom: 4 }}>{appointment.contact.name}</h3>
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

                    <div style={{ display: 'grid', gap: 6, color: '#d7e2ff', marginBottom: 14 }}>
                      <div>
                        <strong>Servicio:</strong> {appointment.service?.name ?? 'Sin servicio'}
                      </div>
                      <div>
                        <strong>Inicio:</strong>{' '}
                        {format(new Date(appointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}
                      </div>
                      <div>
                        <strong>Fin:</strong>{' '}
                        {format(new Date(appointment.appointmentEnd), "dd/MM/yyyy '·' hh:mm a")}
                      </div>
                      {appointment.notes ? (
                        <div>
                          <strong>Notas:</strong> {appointment.notes}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={() => handleCancelAppointment(appointment.id)}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(244,67,54,0.4)',
                          background: 'rgba(244,67,54,0.14)',
                          color: '#ffd6d6',
                          cursor: 'pointer',
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => {
                          setRescheduleTargetId(appointment.id);
                          setRescheduleDateTime(
                            toDatetimeLocalValue(new Date(appointment.appointmentStart)),
                          );
                        }}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 12,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#f3f7ff',
                          cursor: 'pointer',
                        }}
                      >
                        Reagendar
                      </button>

                      {rescheduleTargetId === appointment.id ? (
                        <>
                          <input
                            type="datetime-local"
                            value={rescheduleDateTime}
                            onChange={(event) => setRescheduleDateTime(event.target.value)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 12,
                              border: '1px solid rgba(255,255,255,0.14)',
                              background: 'var(--input-bg)',
                              color: '#f3f7ff',
                            }}
                          />
                          <button
                            onClick={() => handleRescheduleAppointment(appointment.id)}
                            disabled={submitting}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 12,
                              border: '1px solid rgba(115,149,255,0.4)',
                              background: 'rgba(115,149,255,0.18)',
                              color: '#f3f7ff',
                              cursor: 'pointer',
                            }}
                          >
                            Guardar cambio
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <div style={{ display: 'grid', gap: 20 }}>
            <section id="booking" style={cardStyle()}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'start',
                  flexWrap: 'wrap',
                  marginBottom: 18,
                }}
              >
                <div>
                  <h2 style={{ fontSize: 24, marginBottom: 8 }}>Crear cita</h2>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                    Selecciona servicio, busca disponibilidad y agenda desde el panel.
                  </p>
                </div>
                {selectedService ? (
                  <span
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      background: 'rgba(115,149,255,0.16)',
                      border: '1px solid rgba(115,149,255,0.32)',
                      color: '#dce6ff',
                      fontSize: 13,
                    }}
                  >
                    Activo: {selectedService.name}
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Servicio</span>
                  <select
                    value={selectedServiceId}
                    onChange={(event) => {
                      setSelectedServiceId(event.target.value);
                      setSlotOptions([]);
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: '#f3f7ff',
                    }}
                  >
                    <option value="">Selecciona un servicio</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Fecha para consultar slots</span>
                  <input
                    type="datetime-local"
                    value={selectedDateTime}
                    onChange={(event) => setSelectedDateTime(event.target.value)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: '#f3f7ff',
                    }}
                  />
                </label>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    onClick={fetchSlots}
                    disabled={loadingSlots}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid rgba(115,149,255,0.34)',
                      background: 'rgba(115,149,255,0.18)',
                      color: '#f3f7ff',
                      cursor: 'pointer',
                    }}
                  >
                    {loadingSlots ? 'Consultando slots...' : 'Consultar disponibilidad'}
                  </button>
                  <button
                    onClick={() => {
                      setForm({ name: '', phone: '', email: '', notes: '' });
                      setSlotOptions([]);
                      setMessage(null);
                      setError(null);
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#f3f7ff',
                      cursor: 'pointer',
                    }}
                  >
                    Limpiar formulario
                  </button>
                </div>

                {slotOptions.length > 0 ? (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#b5c0d8', fontSize: 14 }}>Slot sugerido</span>
                    <select
                      value={selectedDateTime}
                      onChange={(event) => setSelectedDateTime(event.target.value)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 14,
                        border: '1px solid var(--card-border)',
                        background: 'var(--input-bg)',
                        color: '#f3f7ff',
                      }}
                    >
                      {slotOptions.map((slot) => (
                        <option key={slot.start} value={toDatetimeLocalValue(new Date(slot.start))}>
                          {format(new Date(slot.start), "dd/MM/yyyy '·' hh:mm a")} →{' '}
                          {format(new Date(slot.end), 'hh:mm a')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--muted)',
                      border: '1px dashed rgba(255,255,255,0.08)',
                    }}
                  >
                    Consulta disponibilidad para ver opciones de horario aquí.
                  </div>
                )}

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Paciente</span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Nombre del paciente"
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: '#f3f7ff',
                    }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Teléfono</span>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    placeholder="+52..."
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: '#f3f7ff',
                    }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Email</span>
                  <input
                    value={form.email}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="paciente@example.com"
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: '#f3f7ff',
                    }}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Notas</span>
                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder="Primera visita, dolor, seguimiento..."
                    rows={4}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '1px solid var(--card-border)',
                      background: 'var(--input-bg)',
                      color: '#f3f7ff',
                      resize: 'vertical',
                    }}
                  />
                </label>

                <button
                  onClick={handleCreateAppointment}
                  disabled={submitting}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 14,
                    border: '1px solid rgba(76,175,80,0.34)',
                    background: 'rgba(76,175,80,0.18)',
                    color: '#f3f7ff',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                >
                  {submitting ? 'Guardando...' : 'Crear cita'}
                </button>
              </div>
            </section>

            <section id="services" style={cardStyle()}>
              <h2 style={{ fontSize: 24, marginBottom: 8 }}>Catálogo de servicios</h2>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
                Duraciones activas del demo y muestra rápida de espacios.
              </p>

              <div style={{ display: 'grid', gap: 14 }}>
                {availabilityByService.map(({ service, slots }) => (
                  <article
                    key={service.id}
                    style={{
                      padding: 16,
                      borderRadius: 20,
                      background: 'var(--card-soft)',
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
                    <p style={{ color: '#b5c0d8', lineHeight: 1.5, marginBottom: 10 }}>
                      {service.description ?? 'Sin descripción.'}
                    </p>
                    {slots.length === 0 ? (
                      <p style={{ color: '#b5c0d8' }}>Sin slots detectados en los próximos 7 días.</p>
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
                    <button
                      onClick={() => {
                        setSelectedServiceId(service.id);
                        setMessage(`Servicio seleccionado: ${service.name}`);
                      }}
                      style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(115,149,255,0.34)',
                        background: 'rgba(115,149,255,0.18)',
                        color: '#f3f7ff',
                        cursor: 'pointer',
                      }}
                    >
                      Usar este servicio
                    </button>
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
