'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';

type Conversation = {
  id: string;
  name: string;
  phone: string;
  messages: {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    channel: string;
    message: string;
    createdAt: string;
  }[];
};

export default function ConversationsClient({ conversations }: { conversations: Conversation[] }) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  return (
    <main style={{ minHeight: '100vh', color: 'var(--foreground)' }}>
      <section style={{ maxWidth: 1380, margin: '0 auto', padding: '4px 0 48px' }}>
        <div style={{ marginBottom: 18 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>Panel / Conversaciones</p>
          <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.9rem)', lineHeight: 1.05, marginBottom: 8 }}>
            Conversaciones
          </h1>
          <p style={{ color: 'var(--muted)', maxWidth: 760, lineHeight: 1.7 }}>
            Vista de conversaciones tipo WhatsApp para revisar mensajes por contacto.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px minmax(0, 1fr)',
            gap: 20,
            minHeight: '72vh',
          }}
        >
          <aside
            style={{
              background: '#fff',
              border: '1px solid var(--card-border)',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: 'var(--shadow)',
            }}
          >
            <div style={{ padding: 18, borderBottom: '1px solid var(--card-border)', fontWeight: 700 }}>
              Chats
            </div>

            <div style={{ display: 'grid' }}>
              {conversations.length === 0 ? (
                <div style={{ padding: 18, color: 'var(--muted)' }}>No hay conversaciones todavía.</div>
              ) : (
                conversations.map((conversation) => {
                  const lastMessage = conversation.messages.at(-1);
                  const isActive = conversation.id === selectedId;

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      style={{
                        textAlign: 'left',
                        border: '0',
                        borderBottom: '1px solid var(--card-border)',
                        background: isActive ? '#eef2ff' : '#fff',
                        padding: 16,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#111827' }}>{conversation.name}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 14 }}>{conversation.phone}</div>
                        </div>
                        {lastMessage ? (
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                            {format(new Date(lastMessage.createdAt), 'hh:mm a')}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ color: '#4b5563', fontSize: 14, marginTop: 8 }}>
                        {lastMessage?.message ?? 'Sin mensajes todavía.'}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section
            style={{
              background: '#efeae2',
              border: '1px solid var(--card-border)',
              borderRadius: 18,
              boxShadow: 'var(--shadow)',
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: 18, background: '#f7f7f7', borderBottom: '1px solid #e5e7eb' }}>
              {selectedConversation ? (
                <>
                  <div style={{ fontWeight: 700 }}>{selectedConversation.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 14 }}>{selectedConversation.phone}</div>
                </>
              ) : (
                <div style={{ color: 'var(--muted)' }}>Selecciona una conversación</div>
              )}
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 12 }}>
              {selectedConversation?.messages.length ? (
                selectedConversation.messages.map((message) => {
                  const outbound = message.direction === 'OUTBOUND';

                  return (
                    <div
                      key={message.id}
                      style={{
                        display: 'flex',
                        justifyContent: outbound ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <article
                        style={{
                          maxWidth: '72%',
                          padding: '12px 14px 10px',
                          borderRadius: 14,
                          background: outbound ? '#d9fdd3' : '#fff',
                          border: '1px solid rgba(17,24,39,0.06)',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div style={{ whiteSpace: 'pre-wrap', color: '#111827', lineHeight: 1.5 }}>
                          {message.message}
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            textAlign: 'right',
                            color: '#6b7280',
                            fontSize: 12,
                          }}
                        >
                          {format(new Date(message.createdAt), 'dd/MM · hh:mm a')} · {message.channel}
                        </div>
                      </article>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: 'var(--muted)' }}>No hay mensajes para este contacto.</div>
              )}
            </div>

            <div style={{ padding: 16, background: '#f7f7f7', borderTop: '1px solid #e5e7eb' }}>
              <div
                style={{
                  borderRadius: 12,
                  background: '#fff',
                  border: '1px solid var(--card-border)',
                  padding: '12px 14px',
                  color: 'var(--muted)',
                }}
              >
                Composer demo visual. Luego podemos conectarlo a envío real.
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
