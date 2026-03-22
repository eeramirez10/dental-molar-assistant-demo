'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';

type AppointmentItem = {
  id: string;
  status: string;
  appointmentStart: string;
  appointmentEnd: string;
  service: {
    id: string;
    name: string;
    durationMinutes: number;
  } | null;
};

type Conversation = {
  id: string;
  name: string;
  phone: string;
  appointments: AppointmentItem[];
  messages: {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    channel: string;
    message: string;
    createdAt: string;
  }[];
};

type ServiceItem = {
  id: string;
  name: string;
  durationMinutes: number;
};

export default function ConversationsClient({
  conversations,
  services,
}: {
  conversations: Conversation[];
  services: ServiceItem[];
}) {
  const [items, setItems] = useState(conversations);
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? null);
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? '');
  const [selectedDateTime, setSelectedDateTime] = useState('');
  const [rescheduleDateTime, setRescheduleDateTime] = useState('');
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedConversation = useMemo(
    () => items.find((conversation) => conversation.id === selectedId) ?? null,
    [items, selectedId],
  );

  function mergeConversationUpdate(contactId: string, updater: (conversation: Conversation) => Conversation) {
    setItems((current) =>
      current.map((conversation) =>
        conversation.id === contactId ? updater(conversation) : conversation,
      ),
    );
  }

  async function createAppointmentFromConversation() {
    if (!selectedConversation || !selectedServiceId || !selectedDateTime) {
      setError('Selecciona servicio y fecha para crear la cita.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: {
            name: selectedConversation.name,
            phone: selectedConversation.phone,
          },
          serviceId: selectedServiceId,
          appointmentStart: new Date(selectedDateTime).toISOString(),
          notes: 'Creada desde conversaciones',
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo crear la cita.');

      const createdAppointment = payload.data;
      mergeConversationUpdate(selectedConversation.id, (conversation) => ({
        ...conversation,
        appointments: [
          ...conversation.appointments,
          {
            id: createdAppointment.id,
            status: createdAppointment.status,
            appointmentStart: createdAppointment.appointmentStart,
            appointmentEnd: createdAppointment.appointmentEnd,
            service: createdAppointment.service
              ? {
                  id: createdAppointment.service.id,
                  name: createdAppointment.service.name,
                  durationMinutes: createdAppointment.service.durationMinutes,
                }
              : null,
          },
        ].sort((a, b) => a.appointmentStart.localeCompare(b.appointmentStart)),
        messages: [
          ...conversation.messages,
          {
            id: `local-${Date.now()}`,
            direction: 'OUTBOUND',
            channel: 'whatsapp',
            message: `Listo. Tu cita quedó agendada para ${format(new Date(createdAppointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}.`,
            createdAt: new Date().toISOString(),
          },
        ],
      }));

      setStatusMessage('Cita creada desde la conversación.');
      setSelectedDateTime('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No se pudo crear la cita.');
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelFromConversation(appointmentId: string) {
    if (!selectedConversation) return;
    if (!window.confirm('¿Cancelar esta cita desde conversaciones?')) return;

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversation.id}/appointments/${appointmentId}`,
        { method: 'DELETE' },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo cancelar la cita.');

      mergeConversationUpdate(selectedConversation.id, (conversation) => ({
        ...conversation,
        appointments: conversation.appointments.map((appointment) =>
          appointment.id === appointmentId ? { ...appointment, status: 'CANCELLED' } : appointment,
        ),
        messages: [
          ...conversation.messages,
          {
            id: `local-cancel-${Date.now()}`,
            direction: 'OUTBOUND',
            channel: 'whatsapp',
            message: 'Tu cita fue cancelada correctamente.',
            createdAt: new Date().toISOString(),
          },
        ],
      }));

      setStatusMessage('Cita cancelada desde la conversación.');
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'No se pudo cancelar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function rescheduleFromConversation(appointmentId: string) {
    if (!selectedConversation || !rescheduleDateTime) {
      setError('Selecciona nueva fecha y hora para reagendar.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversation.id}/appointments/${appointmentId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentStart: new Date(rescheduleDateTime).toISOString() }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'No se pudo reagendar la cita.');

      const updated = payload.data;
      mergeConversationUpdate(selectedConversation.id, (conversation) => ({
        ...conversation,
        appointments: conversation.appointments.map((appointment) =>
          appointment.id === appointmentId
            ? {
                ...appointment,
                status: updated.status,
                appointmentStart: updated.appointmentStart,
                appointmentEnd: updated.appointmentEnd,
              }
            : appointment,
        ),
        messages: [
          ...conversation.messages,
          {
            id: `local-reschedule-${Date.now()}`,
            direction: 'OUTBOUND',
            channel: 'whatsapp',
            message: `Tu cita fue reagendada para ${format(new Date(updated.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}.`,
            createdAt: new Date().toISOString(),
          },
        ],
      }));

      setRescheduleTargetId(null);
      setRescheduleDateTime('');
      setStatusMessage('Cita reagendada desde la conversación.');
    } catch (rescheduleError) {
      setError(rescheduleError instanceof Error ? rescheduleError.message : 'No se pudo reagendar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', color: 'var(--foreground)' }}>
      <section style={{ maxWidth: 1480, margin: '0 auto', padding: '4px 0 48px' }}>
        <div style={{ marginBottom: 18 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>Panel / Conversaciones</p>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.9rem)', lineHeight: 1.05, marginBottom: 8 }}>
            Conversaciones
          </h1>
          <p style={{ color: 'var(--muted)', maxWidth: 760, lineHeight: 1.7 }}>
            Vista estilo WhatsApp con contexto del paciente y acciones rápidas de agenda.
          </p>
        </div>

        {statusMessage ? <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(5,150,105,0.08)', color: '#065f46', border: '1px solid rgba(5,150,105,0.18)' }}>{statusMessage}</div> : null}
        {error ? <div style={{ marginBottom: 16, padding: 12, borderRadius: 12, background: 'rgba(220,38,38,0.08)', color: '#991b1b', border: '1px solid rgba(220,38,38,0.18)' }}>{error}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr) 360px', gap: 20, minHeight: '72vh' }}>
          <aside style={{ background: '#fff', border: '1px solid var(--card-border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
            <div style={{ padding: 16, background: '#f0f2f5', borderBottom: '1px solid var(--card-border)', fontWeight: 700 }}>Chats</div>
            <div style={{ padding: 12, borderBottom: '1px solid var(--card-border)', background: '#fff' }}>
              <div style={{ borderRadius: 12, background: '#f0f2f5', padding: '12px 14px', color: 'var(--muted)' }}>Buscar o empezar un chat nuevo</div>
            </div>
            <div style={{ display: 'grid' }}>
              {items.length === 0 ? (
                <div style={{ padding: 18, color: 'var(--muted)' }}>No hay conversaciones todavía.</div>
              ) : (
                items.map((conversation) => {
                  const lastMessage = conversation.messages.at(-1);
                  const isActive = conversation.id === selectedId;
                  return (
                    <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} style={{ textAlign: 'left', border: '0', borderBottom: '1px solid var(--card-border)', background: isActive ? '#f0f2f5' : '#fff', padding: 16, cursor: 'pointer' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 12, alignItems: 'start' }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#cbd5e1', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#334155' }}>{conversation.name.slice(0, 2).toUpperCase()}</div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{conversation.name}</div>
                          <div style={{ color: '#4b5563', fontSize: 14, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastMessage?.message ?? 'Sin mensajes todavía.'}</div>
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{lastMessage ? format(new Date(lastMessage.createdAt), 'hh:mm a') : ''}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section style={{ background: '#efeae2', border: '1px solid var(--card-border)', borderRadius: 18, boxShadow: 'var(--shadow)', display: 'grid', gridTemplateRows: 'auto 1fr auto', overflow: 'hidden' }}>
            <div style={{ padding: 16, background: '#f0f2f5', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
              {selectedConversation ? (
                <>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#cbd5e1', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#334155' }}>{selectedConversation.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedConversation.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>{selectedConversation.phone}</div>
                  </div>
                </>
              ) : <div style={{ color: 'var(--muted)' }}>Selecciona una conversación</div>}
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 12, backgroundImage: 'radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
              {selectedConversation?.messages.length ? selectedConversation.messages.map((message) => {
                const outbound = message.direction === 'OUTBOUND';
                return (
                  <div key={message.id} style={{ display: 'flex', justifyContent: outbound ? 'flex-end' : 'flex-start' }}>
                    <article style={{ maxWidth: '72%', padding: '10px 12px 8px', borderRadius: 12, background: outbound ? '#d9fdd3' : '#fff', border: '1px solid rgba(17,24,39,0.06)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#111827', lineHeight: 1.5 }}>{message.message}</div>
                      <div style={{ marginTop: 6, textAlign: 'right', color: '#6b7280', fontSize: 11 }}>{format(new Date(message.createdAt), 'dd/MM · hh:mm a')}</div>
                    </article>
                  </div>
                );
              }) : <div style={{ color: 'var(--muted)' }}>No hay mensajes para este contacto.</div>}
            </div>

            <div style={{ padding: 12, background: '#f0f2f5', borderTop: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: '40px 1fr 40px', gap: 10, alignItems: 'center' }}>
              <button type="button" style={{ border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer' }}>😊</button>
              <div style={{ borderRadius: 24, background: '#fff', border: '1px solid var(--card-border)', padding: '12px 16px', color: 'var(--muted)' }}>Escribe un mensaje</div>
              <button type="button" style={{ border: 0, background: 'transparent', fontSize: 18, cursor: 'pointer' }}>🎤</button>
            </div>
          </section>

          <aside style={{ display: 'grid', gap: 20 }}>
            <section style={{ background: '#fff', border: '1px solid var(--card-border)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow)' }}>
              <h2 style={{ fontSize: 20, marginBottom: 10 }}>Citas del paciente</h2>
              {selectedConversation?.appointments.length ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  {selectedConversation.appointments.map((appointment) => (
                    <article key={appointment.id} style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid var(--card-border)' }}>
                      <div style={{ fontWeight: 700 }}>{appointment.service?.name ?? 'Sin servicio'}</div>
                      <div style={{ color: 'var(--muted)', marginTop: 6 }}>{format(new Date(appointment.appointmentStart), "dd/MM/yyyy '·' hh:mm a")}</div>
                      <div style={{ marginTop: 8, fontSize: 13, color: '#374151' }}>{appointment.status}</div>
                      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                        <button onClick={() => cancelFromConversation(appointment.id)} disabled={submitting} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(220,38,38,0.18)', background: 'rgba(220,38,38,0.06)', color: '#b91c1c', cursor: 'pointer' }}>Cancelar</button>
                        {rescheduleTargetId === appointment.id ? (
                          <>
                            <input type="datetime-local" value={rescheduleDateTime} onChange={(event) => setRescheduleDateTime(event.target.value)} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--card-border)' }} />
                            <button onClick={() => rescheduleFromConversation(appointment.id)} disabled={submitting} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer' }}>Guardar reagendado</button>
                          </>
                        ) : (
                          <button onClick={() => { setRescheduleTargetId(appointment.id); setRescheduleDateTime(appointment.appointmentStart.slice(0, 16)); }} disabled={submitting} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--card-border)', background: '#fff', cursor: 'pointer' }}>Reagendar</button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--muted)' }}>Este paciente todavía no tiene citas registradas.</p>
              )}
            </section>

            <section style={{ background: '#fff', border: '1px solid var(--card-border)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow)' }}>
              <h2 style={{ fontSize: 20, marginBottom: 10 }}>Agendar desde chat</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.target.value)} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--card-border)', background: '#fff' }}>
                  <option value="">Selecciona un servicio</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
                <input type="datetime-local" value={selectedDateTime} onChange={(event) => setSelectedDateTime(event.target.value)} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--card-border)', background: '#fff' }} />
                <button onClick={createAppointmentFromConversation} disabled={submitting || !selectedConversation} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer' }}>
                  {submitting ? 'Creando...' : 'Crear cita'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
