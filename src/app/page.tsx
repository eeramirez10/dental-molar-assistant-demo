const highlights = [
  'Agendar, reagendar y cancelar citas por WhatsApp.',
  'Panel interno con lista de citas y calendario simple.',
  'Servicios demo con duración de 1 hora.',
  'Horario configurable de 9:00 AM a 9:00 PM.',
  'Base lista para integrar Twilio Sandbox + OpenAI + Neon.',
];

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#07111f', color: '#f3f7ff' }}>
      <section
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '96px 24px 72px',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(115, 149, 255, 0.14)',
            border: '1px solid rgba(115, 149, 255, 0.3)',
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          Dental La Molar · Assistant Demo
        </div>

        <h1
          style={{
            fontSize: 'clamp(2.8rem, 7vw, 5.2rem)',
            lineHeight: 0.95,
            margin: '0 0 20px',
            maxWidth: 800,
          }}
        >
          Demo base del asistente dental con agenda inteligente.
        </h1>

        <p
          style={{
            maxWidth: 760,
            color: '#b5c0d8',
            fontSize: 18,
            lineHeight: 1.7,
            margin: '0 0 28px',
          }}
        >
          Esta primera fase deja lista la base técnica para construir un asistente de IA que
          atienda prospectos por WhatsApp, valide disponibilidad real y convierta conversaciones
          en citas, sin andar inventando horarios como si fueran horóscopos.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginTop: 32,
          }}
        >
          {highlights.map((item) => (
            <article
              key={item}
              style={{
                padding: 20,
                borderRadius: 22,
                background: 'rgba(12, 23, 42, 0.88)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              }}
            >
              <p style={{ margin: 0, color: '#eaf1ff', lineHeight: 1.6 }}>{item}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
