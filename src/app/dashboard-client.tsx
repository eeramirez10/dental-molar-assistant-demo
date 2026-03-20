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

function pageMeta(page: Props['page']) {
  switch (page) {
    case 'appointments':
      return {
        breadcrumb: 'Panel / Citas',
        title: 'Citas',
        description: 'Administra citas programadas, canceladas y reagendadas.',
      };
    case 'booking':
      return {
        breadcrumb: 'Panel / Nueva cita',
        title: 'Nueva cita',
        description: 'Crea citas usando disponibilidad real desde el core.',
      };
    case 'services':
      return {
        breadcrumb: 'Panel / Servicios',
        title: 'Servicios',
        description: 'Consulta el catálogo y la vista previa de horarios por servicio.',
      };
    default:
      return {
        breadcrumb: 'Panel / Resumen',
        title: 'Resumen',
        description: 'Vista ejecutiva con métricas, gráficas y actividad reciente de la clínica.',
      };
  }
}

function MiniBarChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);

  return (
    <div style={{ height: 160, display: 'flex', alignItems: 'end', gap: 12 }}>
      {values.map((value, index) => (
        <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              height: `${Math.max((value / max) * 100, 12)}%`,
              minHeight: 18,
              borderRadius: 12,
              background: index % 2 === 0 ? '#1f2937' : '#f0bc74',
              transition: 'height 240ms ease',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function LineChart({ values }: { values: number[] }) {
  const width = 560;
  const height = 180;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * (width - 40) + 20;
      const y = height - (value / max) * 120 - 20;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 180 }}>
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f2937" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1f2937" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((line) => (
        <line
          key={line}
          x1="20"
          x2={width - 20}
          y1={30 + line * 35}
          y2={30 + line * 35}
          stroke="#e5e7eb"
          strokeDasharray="4 6"
        />
      ))}
      <polyline fill="none" stroke="#1f2937" strokeWidth="4" points={points} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * (width - 40) + 20;
        const y = height - (value / max) * 120 - 20;
        return <circle key={index} cx={x} cy={y} r="5" fill="#f0bc74" stroke="#1f2937" strokeWidth="2" />;
      })}
    </svg>
  );
}

function DoughnutChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = Math.max(items.reduce((sum, item) => sum + item.value, 0), 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const segments = items.map((item, index) => {
    const previousTotal = items
      .slice(0, index)
      .reduce((sum, previousItem) => sum + previousItem.value, 0);
    const fraction = item.value / total;
    const dash = fraction * circumference;
    const offset = circumference - (previousTotal / total) * circumference;

    return {
      ...item,
      dash,
      offset,
    };
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 16, alignItems: 'center' }}>
      <svg viewBox="0 0 140 140" style={{ width: 140, height: 140 }}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#eef2f7" strokeWidth="16" />
        {segments.map((item) => {
          return (
            <circle
              key={item.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth="16"
              strokeDasharray={`${item.dash} ${circumference - item.dash}`}
              strokeDashoffset={item.offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="round"
            />
          );
        })}
        <text x="70" y="66" textAnchor="middle" style={{ fontSize: 12, fill: '#6b7280' }}>
          Total
        </text>
        <text x="70" y="84" textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: '#111827' }}>
          {total}
        </text>
      </svg>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((item) => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
              <span style={{ color: '#374151' }}>{item.label}</span>
            </div>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
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

  const meta = pageMeta(page);
  const selectedService = useMemo(
    () => services.find((service) => service.id === selectedServiceId) ?? null,
    [selectedServiceId, services],
  );
  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        const matchesStatus = statusFilter === 'ALL' || appointment.status === statusFilter;
        const matchesDate = !dateQuery || appointment.appointmentStart.slice(0, 10) === dateQuery;
        return matchesStatus && matchesDate;
      }),
    [appointments, dateQuery, statusFilter],
  );
  const latestAppointments = useMemo(() => appointments.slice(0, 5), [appointments]);
  const confirmedCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'CONFIRMED').length,
    [appointments],
  );
  const cancelledCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'CANCELLED').length,
    [appointments],
  );
  const rescheduledCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'RESCHEDULED').length,
    [appointments],
  );
  const scheduledCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'SCHEDULED').length,
    [appointments],
  );
  const weeklyBuckets = useMemo(() => {
    const buckets = new Array(7).fill(0);
    appointments.forEach((appointment) => {
      const day = new Date(appointment.appointmentStart).getDay();
      buckets[day] += 1;
    });
    return buckets;
  }, [appointments]);

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
          contact: { name: form.name, phone: form.phone, email: form.email || undefined },
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
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>{meta.breadcrumb}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'end' }}>
            <div>
              <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.9rem)', lineHeight: 1.05, marginBottom: 8 }}>{meta.title}</h1>
              <p style={{ color: 'var(--muted)', maxWidth: 760, lineHeight: 1.7 }}>{meta.description}</p>
            </div>
          </div>
        </div>

        {message ? <div style={{ marginBottom: 18, padding: 14, borderRadius: 14, background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.18)', color: '#065f46' }}>{message}</div> : null}
        {error ? <div style={{ marginBottom: 18, padding: 14, borderRadius: 14, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.18)', color: '#991b1b' }}>{error}</div> : null}

        {page === 'overview' ? (
          <>
            <section id="overview" style={{ marginBottom: 22 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, marginBottom: 20 }}>
                <article style={{ ...cardStyle(), background: '#fef3c7', border: '0', padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: 24, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 18, marginBottom: 8, color: '#374151' }}>Actividad semanal</div>
                      <h2 style={{ fontSize: 34, fontWeight: 800, color: '#111827', marginBottom: 8 }}>{appointments.length}</h2>
                      <div style={{ color: '#4b5563', fontSize: 14 }}>Citas registradas en el sistema</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'start' }}>
                      <button style={{ ...softButtonStyle(), background: '#fff7ed' }}>Mes</button>
                      <button style={{ ...softButtonStyle(), background: '#111827', color: '#fff', borderColor: '#111827' }}>Semana</button>
                    </div>
                  </div>
                  <div style={{ padding: '0 24px 24px' }}>
                    <LineChart values={weeklyBuckets} />
                  </div>
                </article>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 16 }}>
                  {[
                    { label: 'Citas totales', value: appointments.length, tone: '#2563eb' },
                    { label: 'Confirmadas', value: confirmedCount, tone: '#059669' },
                    { label: 'Canceladas', value: cancelledCount, tone: '#dc2626' },
                    { label: 'Reagendadas', value: rescheduledCount, tone: '#d97706' },
                  ].map((item) => (
                    <article key={item.label} style={{ ...cardStyle(), padding: 20 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${item.tone}18`, marginBottom: 14 }} />
                      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>{item.label}</p>
                      <strong style={{ fontSize: 30, color: '#111827' }}>{item.value}</strong>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20, alignItems: 'start' }}>
              <section style={cardStyle()}>
                <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ fontSize: 22, marginBottom: 6 }}>Últimas 5 citas</h2>
                    <p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Tabla rápida con la actividad más reciente.</p>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                        <th style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}>Paciente</th>
                        <th style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}>Servicio</th>
                        <th style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}>Inicio</th>
                        <th style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}>Estatus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestAppointments.map((appointment) => (
                        <tr key={appointment.id}>
                          <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}><div style={{ fontWeight: 700, color: '#111827' }}>{appointment.contact.name}</div><div style={{ color: 'var(--muted)', fontSize: 14 }}>{appointment.contact.phone}</div></td>
                          <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)', color: '#4b5563' }}>{appointment.service?.name ?? 'Sin servicio'}</td>
                          <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)', color: '#4b5563' }}>{format(new Date(appointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}</td>
                          <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--card-border)' }}><span style={{ display: 'inline-flex', padding: '8px 12px', borderRadius: 999, background: badgeColor(appointment.status), border: '1px solid var(--card-border)', fontSize: 12 }}>{appointment.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div style={{ display: 'grid', gap: 20 }}>
                <section style={cardStyle()}>
                  <h2 style={{ fontSize: 22, marginBottom: 10 }}>Distribución de citas</h2>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>Gráfica reactiva por estatus.</p>
                  <DoughnutChart
                    items={[
                      { label: 'Programadas', value: scheduledCount, color: '#1f2937' },
                      { label: 'Confirmadas', value: confirmedCount, color: '#10b981' },
                      { label: 'Reagendadas', value: rescheduledCount, color: '#f59e0b' },
                      { label: 'Canceladas', value: cancelledCount, color: '#ef4444' },
                    ]}
                  />
                </section>

                <section style={cardStyle()}>
                  <h2 style={{ fontSize: 22, marginBottom: 10 }}>Citas por día</h2>
                  <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>Mini gráfica que cambia cuando la agenda cambia.</p>
                  <MiniBarChart values={weeklyBuckets} />
                </section>
              </div>
            </div>
          </>
        ) : null}

        {page === 'appointments' ? (
          <section id="appointments" style={cardStyle()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'end' }}>
              <div><h2 style={{ fontSize: 22, marginBottom: 6 }}>Citas</h2><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Administra citas programadas, canceladas y reagendadas.</p></div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle()}>
                  <option value="ALL">Todos los estatus</option>
                  <option value="SCHEDULED">Programadas</option>
                  <option value="RESCHEDULED">Reagendadas</option>
                  <option value="CANCELLED">Canceladas</option>
                  <option value="CONFIRMED">Confirmadas</option>
                  <option value="COMPLETED">Completadas</option>
                </select>
                <input type="date" value={dateQuery} onChange={(event) => setDateQuery(event.target.value)} style={inputStyle()} />
              </div>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {filteredAppointments.length === 0 ? <div style={{ padding: 18, borderRadius: 14, background: 'var(--card-soft)', color: 'var(--muted)', border: '1px dashed var(--card-border)' }}>No hay citas que coincidan con los filtros seleccionados.</div> : filteredAppointments.map((appointment) => (
                <article key={appointment.id} style={{ padding: 18, borderRadius: 16, background: 'var(--card-soft)', border: '1px solid var(--card-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div><h3 style={{ fontSize: 17, marginBottom: 4 }}>{appointment.contact.name}</h3><p style={{ color: 'var(--muted)' }}>{appointment.contact.phone}</p></div>
                    <span style={{ alignSelf: 'start', padding: '8px 12px', borderRadius: 999, background: badgeColor(appointment.status), border: '1px solid var(--card-border)', fontSize: 12, color: '#111827' }}>{appointment.status}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 6, color: '#374151', marginBottom: 14 }}>
                    <div><strong>Servicio:</strong> {appointment.service?.name ?? 'Sin servicio'}</div>
                    <div><strong>Inicio:</strong> {format(new Date(appointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}</div>
                    <div><strong>Fin:</strong> {format(new Date(appointment.appointmentEnd), "dd/MM/yyyy '·' hh:mm a")}</div>
                    {appointment.notes ? <div><strong>Notas:</strong> {appointment.notes}</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button onClick={() => handleCancelAppointment(appointment.id)} style={{ ...softButtonStyle(), color: 'var(--danger)', borderColor: 'rgba(220,38,38,0.18)', background: 'rgba(220,38,38,0.06)' }}>Cancelar</button>
                    <button onClick={() => { setRescheduleTargetId(appointment.id); setRescheduleDateTime(toDatetimeLocalValue(new Date(appointment.appointmentStart))); }} style={softButtonStyle()}>Reagendar</button>
                    {rescheduleTargetId === appointment.id ? <><input type="datetime-local" value={rescheduleDateTime} onChange={(event) => setRescheduleDateTime(event.target.value)} style={inputStyle()} /><button onClick={() => handleRescheduleAppointment(appointment.id)} disabled={submitting} style={{ ...softButtonStyle(), background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>Guardar</button></> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {page === 'booking' ? (
          <section id="booking" style={cardStyle()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap', marginBottom: 18 }}>
              <div><h2 style={{ fontSize: 22, marginBottom: 6 }}>Nueva cita</h2><p style={{ color: 'var(--muted)', lineHeight: 1.6 }}>Crea citas usando disponibilidad real desde el core.</p></div>
              {selectedService ? <span style={{ padding: '8px 12px', borderRadius: 999, background: '#eef2ff', border: '1px solid rgba(37,99,235,0.16)', color: '#1d4ed8', fontSize: 13 }}>{selectedService.name}</span> : null}
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <select value={selectedServiceId} onChange={(event) => { setSelectedServiceId(event.target.value); setSlotOptions([]); }} style={inputStyle()}><option value="">Selecciona un servicio</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
              <input type="datetime-local" value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={inputStyle()} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={fetchSlots} disabled={loadingSlots} style={{ ...softButtonStyle(), background: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)' }}>{loadingSlots ? 'Cargando...' : 'Consultar disponibilidad'}</button>
                <button onClick={() => { setForm({ name: '', phone: '', email: '', notes: '' }); setSlotOptions([]); setMessage(null); setError(null); }} style={softButtonStyle()}>Limpiar</button>
              </div>
              {slotOptions.length > 0 ? <select value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={inputStyle()}>{slotOptions.map((slot) => <option key={slot.start} value={toDatetimeLocalValue(new Date(slot.start))}>{format(new Date(slot.start), "dd/MM/yyyy '·' hh:mm a")} → {format(new Date(slot.end), 'hh:mm a')}</option>)}</select> : <div style={{ padding: 14, borderRadius: 14, background: 'var(--card-soft)', color: 'var(--muted)', border: '1px dashed var(--card-border)' }}>Aquí aparecerán los horarios disponibles.</div>}
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nombre del paciente" style={inputStyle()} />
              <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Teléfono" style={inputStyle()} />
              <input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="Correo" style={inputStyle()} />
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notas" rows={4} style={{ ...inputStyle(), resize: 'vertical' }} />
              <button onClick={handleCreateAppointment} disabled={submitting} style={{ ...softButtonStyle(), background: '#111827', color: '#fff', borderColor: '#111827', justifyContent: 'center' }}>{submitting ? 'Guardando...' : 'Crear cita'}</button>
            </div>
          </section>
        ) : null}

        {page === 'services' ? (
          <section id="services" style={cardStyle()}>
            <h2 style={{ fontSize: 22, marginBottom: 6 }}>Servicios</h2>
            <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>Catálogo rápido de servicios con vista previa de horarios.</p>
            <div style={{ display: 'grid', gap: 14 }}>{availabilityByService.map(({ service, slots }) => <article key={service.id} style={{ padding: 16, borderRadius: 16, background: 'var(--card-soft)', border: '1px solid var(--card-border)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}><strong>{service.name}</strong><span style={{ color: 'var(--muted)', fontSize: 14 }}>{service.durationMinutes} min</span></div><p style={{ color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>{service.description ?? 'Sin descripción.'}</p>{slots.length === 0 ? <p style={{ color: 'var(--muted)' }}>No hay horarios visibles en esta ventana de tiempo.</p> : <ul style={{ display: 'grid', gap: 8, paddingLeft: 18, color: '#374151' }}>{slots.map((slot) => <li key={slot.start}>{format(new Date(slot.start), "dd/MM '·' hh:mm a")} → {format(new Date(slot.end), 'hh:mm a')}</li>)}</ul>}<button onClick={() => { setSelectedServiceId(service.id); setMessage(`Servicio seleccionado: ${service.name}`); }} style={{ ...softButtonStyle(), marginTop: 12 }}>Usar este servicio</button></article>)}</div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
