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
  page?: 'overview' | 'appointments' | 'booking' | 'services';
};

function badgeColor(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'rgba(5, 150, 105, 0.14)';
    case 'CANCELLED':
      return 'rgba(220, 38, 38, 0.14)';
    case 'RESCHEDULED':
      return 'rgba(217, 119, 6, 0.14)';
    case 'COMPLETED':
      return 'rgba(37, 99, 235, 0.14)';
    default:
      return 'rgba(37, 99, 235, 0.12)';
  }
}

function toDatetimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function cardStyle() {
  return {
    padding: 24,
    borderRadius: 18,
    background: 'var(--card)',
    border: '1px solid var(--card-border)',
    boxShadow: 'var(--shadow)',
  } as const;
}

function inputStyle() {
  return {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid var(--card-border)',
    background: 'var(--input-bg)',
    color: 'var(--foreground)',
  } as const;
}

function softButtonStyle() {
  return {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid var(--card-border)',
    background: '#fff',
    color: 'var(--foreground)',
    cursor: 'pointer',
  } as const;
}

export default function DashboardClient({
  initialAppointments,
  services,
  initialAvailabilityByService,
  page = 'overview',
}: Props) {
  const [appointments, setAppointments] = useState(initialAppointments);
  const [availabilityByService] = useState(initialAvailabilityByService);
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? '');
  const [selectedDateTime, setSelectedDateTime] = useState(toDatetimeLocalValue(new Date()));
  const [slotOptions, setSlotOptions] = useState<SlotItem[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
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
      const matchesDate = !dateQuery || appointment.appointmentStart.slice(0, 10) === dateQuery;
      return matchesStatus && matchesDate;
    });
  }, [appointments, dateQuery, statusFilter]);

  async function refreshAppointments() {
    const response = await fetch('/api/appointments', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'No se pudieron cargar las citas.');
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
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo consultar disponibilidad.');

      setSlotOptions(payload.data);
      if (payload.data.length === 0) {
        setMessage('No encontré slots para esa ventana. Prueba otra fecha.');
      } else {
        setSelectedDateTime(toDatetimeLocalValue(new Date(payload.data[0].start)));
        setMessage('Disponibilidad cargada correctamente.');
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'No se pudo consultar slots.');
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleCreateAppointment() {
    if (!selectedServiceId || !selectedDateTime) {
      setError('Completa servicio y horario antes de crear la cita.');
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
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear la cita.');

      setMessage('Cita creada correctamente.');
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
    if (!window.confirm('¿Cancelar esta cita?')) return;
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/appointments/${appointmentId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cancelar la cita.');

      setMessage('Cita cancelada correctamente.');
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
        body: JSON.stringify({ appointmentStart: new Date(rescheduleDateTime).toISOString() }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo reagendar la cita.');

      setMessage('Cita reagendada correctamente.');
      setRescheduleTargetId(null);
      await refreshAppointments();
    } catch (rescheduleError) {
      setError(rescheduleError instanceof Error ? rescheduleError.message : 'No se pudo reagendar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', color: 'var(--foreground)' }}>
      <section style={{ maxWidth: 1380, margin: '0 auto', padding: '4px 0 48px' }}>
        <div style={{ marginBottom: 18 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>Dashboard / Overview</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.9rem)', lineHeight: 1.05, marginBottom: 8 }}>
                Overview
              </h1>
              <p style={{ color: 'var(--muted)', maxWidth: 760, lineHeight: 1.7 }}>
                Panel administrativo para la agenda de Dental La Molar, inspirado en el look & feel de Volt.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={fetchSlots} disabled={loadingSlots} style={{ ...softButtonStyle(), background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>
                {loadingSlots ? 'Refreshing...' : 'Refresh availability'}
              </button>
            </div>
          </div>
        </div>

        {page === 'overview' ? (
          <section id="overview" style={{ marginBottom: 22 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: 16 }}>
              {[
                { label: 'Total Appointments', value: appointments.length, tone: '#2563eb' },
                { label: 'Active Services', value: services.length, tone: '#059669' },
                { label: 'Visible Slots', value: slotOptions.length, tone: '#d97706' },
                { label: 'Filtered Results', value: filteredAppointments.length, tone: '#7c3aed' },
              ].map((item) => (
                <article key={item.label} style={{ ...cardStyle(), padding: 20 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: `${item.tone}18`, marginBottom: 14 }} />
                  <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>{item.label}</p>
                  <strong style={{ fontSize: 30, color: '#111827' }}>{item.value}</strong>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {message ? <div style={{ marginBottom: 18, padding: 14, borderRadius: 14, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.18)', color: '#065f46' }}>{message}</div> : null}
        {error ? <div style={{ marginBottom: 18, padding: 14, borderRadius: 14, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)', color: '#991b1b' }}>{error}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: page === 'overview' ? '1.35fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
          {(page === 'overview' || page === 'appointments') ? <section id="appointments" style={cardStyle()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'end' }}>
              <div>
                <h2 style={{ fontSize: 22, marginBottom: 6 }}>Appointments</h2>
                <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Manage scheduled, cancelled and rescheduled appointments.</p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle()}>
                  <option value="ALL">All status</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="RESCHEDULED">Rescheduled</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <input type="date" value={dateQuery} onChange={(event) => setDateQuery(event.target.value)} style={inputStyle()} />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {filteredAppointments.length === 0 ? (
                <div style={{ padding: 18, borderRadius: 14, background: 'var(--card-soft)', color: 'var(--muted)', border: '1px dashed var(--card-border)' }}>
                  No appointments match the selected filters.
                </div>
              ) : (
                filteredAppointments.map((appointment) => (
                  <article key={appointment.id} style={{ padding: 18, borderRadius: 16, background: 'var(--card-soft)', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                      <div>
                        <h3 style={{ fontSize: 17, marginBottom: 4 }}>{appointment.contact.name}</h3>
                        <p style={{ color: 'var(--muted)' }}>{appointment.contact.phone}</p>
                      </div>
                      <span style={{ alignSelf: 'start', padding: '8px 12px', borderRadius: 999, background: badgeColor(appointment.status), border: '1px solid var(--card-border)', fontSize: 12, color: '#111827' }}>
                        {appointment.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gap: 6, color: '#374151', marginBottom: 14 }}>
                      <div><strong>Service:</strong> {appointment.service?.name ?? 'Sin servicio'}</div>
                      <div><strong>Start:</strong> {format(new Date(appointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}</div>
                      <div><strong>End:</strong> {format(new Date(appointment.appointmentEnd), "dd/MM/yyyy '·' hh:mm a")}</div>
                      {appointment.notes ? <div><strong>Notes:</strong> {appointment.notes}</div> : null}
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button onClick={() => handleCancelAppointment(appointment.id)} style={{ ...softButtonStyle(), color: 'var(--danger)', borderColor: 'rgba(220,38,38,0.18)', background: 'rgba(220,38,38,0.06)' }}>
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setRescheduleTargetId(appointment.id);
                          setRescheduleDateTime(toDatetimeLocalValue(new Date(appointment.appointmentStart)));
                        }}
                        style={softButtonStyle()}
                      >
                        Reschedule
                      </button>

                      {rescheduleTargetId === appointment.id ? (
                        <>
                          <input type="datetime-local" value={rescheduleDateTime} onChange={(event) => setRescheduleDateTime(event.target.value)} style={inputStyle()} />
                          <button onClick={() => handleRescheduleAppointment(appointment.id)} disabled={submitting} style={{ ...softButtonStyle(), background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>
                            Save
                          </button>
                        </>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section> : null}

          {(page === 'overview' || page === 'booking' || page === 'services') ? <div style={{ display: 'grid', gap: 20 }}>
            {(page === 'overview' || page === 'booking') ? <section id="booking" style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 22, marginBottom: 6 }}>New Booking</h2>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Create appointments using real availability from the core.</p>
                </div>
                {selectedService ? <span style={{ padding: '8px 12px', borderRadius: 999, background: 'var(--primary-soft)', border: '1px solid rgba(37,99,235,0.16)', color: '#1d4ed8', fontSize: 13 }}>{selectedService.name}</span> : null}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <select value={selectedServiceId} onChange={(event) => { setSelectedServiceId(event.target.value); setSlotOptions([]); }} style={inputStyle()}>
                  <option value="">Select a service</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>

                <input type="datetime-local" value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={inputStyle()} />

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={fetchSlots} disabled={loadingSlots} style={{ ...softButtonStyle(), background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>
                    {loadingSlots ? 'Loading...' : 'Check availability'}
                  </button>
                  <button onClick={() => { setForm({ name: '', phone: '', email: '', notes: '' }); setSlotOptions([]); setMessage(null); setError(null); }} style={softButtonStyle()}>
                    Clear
                  </button>
                </div>

                {slotOptions.length > 0 ? (
                  <select value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={inputStyle()}>
                    {slotOptions.map((slot) => (
                      <option key={slot.start} value={toDatetimeLocalValue(new Date(slot.start))}>
                        {format(new Date(slot.start), "dd/MM/yyyy '·' hh:mm a")} → {format(new Date(slot.end), 'hh:mm a')}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ padding: 14, borderRadius: 14, background: 'var(--card-soft)', color: 'var(--muted)', border: '1px dashed var(--card-border)' }}>
                    Available slots will appear here.
                  </div>
                )}

                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Patient name" style={inputStyle()} />
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" style={inputStyle()} />
                <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={inputStyle()} />
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notes" rows={4} style={{ ...inputStyle(), resize: 'vertical' }} />

                <button onClick={handleCreateAppointment} disabled={submitting} style={{ ...softButtonStyle(), background: '#111827', color: '#fff', borderColor: '#111827', justifyContent: 'center' }}>
                  {submitting ? 'Saving...' : 'Create appointment'}
                </button>
              </div>
            </section> : null}

            {(page === 'overview' || page === 'services') ? <section id="services" style={cardStyle()}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>Services</h2>
              <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>
                Quick selection cards with preview slots for the next days.
              </p>

              <div style={{ display: 'grid', gap: 14 }}>
                {availabilityByService.map(({ service, slots }) => (
                  <article key={service.id} style={{ padding: 16, borderRadius: 16, background: 'var(--card-soft)', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <strong>{service.name}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: 14 }}>{service.durationMinutes} min</span>
                    </div>
                    <p style={{ color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                      {service.description ?? 'Sin descripción.'}
                    </p>
                    {slots.length === 0 ? (
                      <p style={{ color: 'var(--muted)' }}>No visible slots in the selected preview window.</p>
                    ) : (
                      <ul style={{ display: 'grid', gap: 8, paddingLeft: 18, color: '#374151' }}>
                        {slots.map((slot) => (
                          <li key={slot.start}>
                            {format(new Date(slot.start), "dd/MM '·' hh:mm a")} → {format(new Date(slot.end), 'hh:mm a')}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button onClick={() => { setSelectedServiceId(service.id); setMessage(`Service selected: ${service.name}`); }} style={{ ...softButtonStyle(), marginTop: 12 }}>
                      Use this service
                    </button>
                  </article>
                ))}
              </div>
            </section> : null}
          </div> : null}
        </div>
      </section>
    </main>
  );
}
