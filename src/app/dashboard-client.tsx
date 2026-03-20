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

  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services],
  );

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
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(72, 98, 170, 0.28), transparent 28%), #07111f',
        color: '#f3f7ff',
      }}
    >
      <section style={{ maxWidth: 1380, margin: '0 auto', padding: '56px 24px 72px' }}>
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
              Dental La Molar · Demo panel interactivo
            </div>

            <h1 style={{ fontSize: 'clamp(2.4rem, 6vw, 4.6rem)', lineHeight: 0.96, marginBottom: 14 }}>
              Agenda demo con alta, cancelación y reagendado.
            </h1>

            <p style={{ maxWidth: 840, color: '#b5c0d8', fontSize: 18, lineHeight: 1.7 }}>
              Ahora sí ya puedes mover piezas desde la UI: consultar disponibilidad, crear citas y
              reagendar/cancelar sin invocar a Postman como sacerdote del backend.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: 14, minWidth: 'min(100%, 360px)' }}>
            <article style={{ padding: 18, borderRadius: 22, background: 'rgba(12, 23, 42, 0.88)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 13, color: '#8ea0c7', marginBottom: 8 }}>Citas</div>
              <strong style={{ fontSize: 30 }}>{appointments.length}</strong>
            </article>
            <article style={{ padding: 18, borderRadius: 22, background: 'rgba(12, 23, 42, 0.88)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 13, color: '#8ea0c7', marginBottom: 8 }}>Servicios</div>
              <strong style={{ fontSize: 30 }}>{services.length}</strong>
            </article>
          </div>
        </div>

        {message ? (
          <div style={{ marginBottom: 18, padding: 14, borderRadius: 16, background: 'rgba(76, 175, 80, 0.15)', border: '1px solid rgba(76, 175, 80, 0.3)' }}>
            {message}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: 18, padding: 14, borderRadius: 16, background: 'rgba(244, 67, 54, 0.15)', border: '1px solid rgba(244, 67, 54, 0.3)' }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20, alignItems: 'start' }}>
          <section style={{ padding: 24, borderRadius: 28, background: 'rgba(12, 23, 42, 0.88)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 24, marginBottom: 8 }}>Próximas citas</h2>
                <p style={{ color: '#9db0d6', lineHeight: 1.6 }}>Agenda viva del demo.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {appointments.length === 0 ? (
                <div style={{ padding: 18, borderRadius: 20, background: 'rgba(255,255,255,0.04)', color: '#b5c0d8' }}>
                  No hay citas registradas todavía.
                </div>
              ) : (
                appointments.map((appointment) => (
                  <article key={appointment.id} style={{ padding: 18, borderRadius: 22, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ fontSize: 18, marginBottom: 4 }}>{appointment.contact.name}</h3>
                        <p style={{ color: '#8ea0c7' }}>{appointment.contact.phone}</p>
                      </div>
                      <span style={{ alignSelf: 'start', padding: '8px 12px', borderRadius: 999, background: badgeColor(appointment.status), border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, letterSpacing: 0.4 }}>
                        {appointment.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gap: 6, color: '#d7e2ff', marginBottom: 14 }}>
                      <div><strong>Servicio:</strong> {appointment.service?.name ?? 'Sin servicio'}</div>
                      <div><strong>Inicio:</strong> {format(new Date(appointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}</div>
                      <div><strong>Fin:</strong> {format(new Date(appointment.appointmentEnd), "dd/MM/yyyy '·' hh:mm a")}</div>
                      {appointment.notes ? <div><strong>Notas:</strong> {appointment.notes}</div> : null}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button onClick={() => handleCancelAppointment(appointment.id)} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(244,67,54,0.4)', background: 'rgba(244,67,54,0.14)', color: '#ffd6d6', cursor: 'pointer' }}>
                        Cancelar
                      </button>
                      <button onClick={() => {
                        setRescheduleTargetId(appointment.id);
                        setRescheduleDateTime(toDatetimeLocalValue(new Date(appointment.appointmentStart)));
                      }} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#f3f7ff', cursor: 'pointer' }}>
                        Reagendar
                      </button>

                      {rescheduleTargetId === appointment.id ? (
                        <>
                          <input type="datetime-local" value={rescheduleDateTime} onChange={(event) => setRescheduleDateTime(event.target.value)} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: '#091426', color: '#f3f7ff' }} />
                          <button onClick={() => handleRescheduleAppointment(appointment.id)} disabled={submitting} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(115,149,255,0.4)', background: 'rgba(115,149,255,0.18)', color: '#f3f7ff', cursor: 'pointer' }}>
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
            <section style={{ padding: 24, borderRadius: 28, background: 'rgba(12, 23, 42, 0.88)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h2 style={{ fontSize: 24, marginBottom: 8 }}>Crear cita</h2>
              <p style={{ color: '#9db0d6', lineHeight: 1.6, marginBottom: 18 }}>
                Selecciona servicio, busca disponibilidad y agenda desde el panel.
              </p>

              <div style={{ display: 'grid', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Servicio</span>
                  <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff' }}>
                    <option value="">Selecciona un servicio</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Fecha para consultar slots</span>
                  <input type="datetime-local" value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff' }} />
                </label>

                <button onClick={fetchSlots} disabled={loadingSlots} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(115,149,255,0.34)', background: 'rgba(115,149,255,0.18)', color: '#f3f7ff', cursor: 'pointer' }}>
                  {loadingSlots ? 'Consultando slots...' : 'Consultar disponibilidad'}
                </button>

                {slotOptions.length > 0 ? (
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ color: '#b5c0d8', fontSize: 14 }}>Slot sugerido</span>
                    <select value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff' }}>
                      {slotOptions.map((slot) => (
                        <option key={slot.start} value={toDatetimeLocalValue(new Date(slot.start))}>
                          {format(new Date(slot.start), "dd/MM/yyyy '·' hh:mm a")} → {format(new Date(slot.end), 'hh:mm a')}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Paciente</span>
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del paciente" style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff' }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Teléfono</span>
                  <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="+52..." style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff' }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Email</span>
                  <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="paciente@example.com" style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff' }} />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#b5c0d8', fontSize: 14 }}>Notas</span>
                  <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Primera visita, dolor, seguimiento..." rows={4} style={{ padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: '#091426', color: '#f3f7ff', resize: 'vertical' }} />
                </label>

                <button onClick={handleCreateAppointment} disabled={submitting} style={{ padding: '14px 16px', borderRadius: 14, border: '1px solid rgba(76,175,80,0.34)', background: 'rgba(76,175,80,0.18)', color: '#f3f7ff', cursor: 'pointer', fontWeight: 700 }}>
                  {submitting ? 'Guardando...' : 'Crear cita'}
                </button>
              </div>
            </section>

            <section style={{ padding: 24, borderRadius: 28, background: 'rgba(12, 23, 42, 0.88)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h2 style={{ fontSize: 24, marginBottom: 8 }}>Catálogo de servicios</h2>
              <p style={{ color: '#9db0d6', lineHeight: 1.6, marginBottom: 18 }}>
                Duraciones activas del demo y muestra rápida de espacios.
              </p>

              <div style={{ display: 'grid', gap: 14 }}>
                {availabilityByService.map(({ service, slots }) => (
                  <article key={service.id} style={{ padding: 16, borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                      <strong>{service.name}</strong>
                      <span style={{ color: '#8ea0c7', fontSize: 14 }}>{service.durationMinutes} min</span>
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
                            {format(new Date(slot.start), "dd/MM '·' hh:mm a")} → {format(new Date(slot.end), 'hh:mm a')}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button onClick={() => setSelectedServiceId(service.id)} style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(115,149,255,0.34)', background: 'rgba(115,149,255,0.18)', color: '#f3f7ff', cursor: 'pointer' }}>
                      Usar este servicio
                    </button>
                  </article>
                ))}
              </div>

              {selectedService ? (
                <p style={{ marginTop: 16, color: '#8ea0c7' }}>
                  Servicio activo en el formulario: <strong style={{ color: '#f3f7ff' }}>{selectedService.name}</strong>
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
