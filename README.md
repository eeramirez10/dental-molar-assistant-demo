# Dental Molar Assistant Demo

Demo de asistente de IA para Dental La Molar con enfoque en:

- atención por WhatsApp
- agenda de citas
- reagendado y cancelación
- panel interno con lista y calendario simple
- persistencia con PostgreSQL (Neon)
- IA conversacional con OpenAI y tools propias del backend

## Stack

- Next.js + TypeScript
- Prisma
- PostgreSQL (Neon)
- Twilio WhatsApp Sandbox
- OpenAI API

## Estado actual

Fase 1: project setup ✅ completada

Incluye:

- proyecto base con Next.js
- Prisma configurado para PostgreSQL
- esquema inicial de datos
- seed inicial para servicios y horario de 9 AM a 9 PM
- `.env.example` con variables requeridas
- estructura base para crecer con arquitectura limpia
- utilidades base para Prisma y manejo de errores de dominio

### Checklist de cierre de Fase 1

- [x] Proyecto inicial con Next.js + TypeScript
- [x] Prisma configurado para PostgreSQL/Neon
- [x] Esquema inicial de datos para contactos, citas, servicios y conversación
- [x] Seed inicial con servicios demo y horario de negocio
- [x] `.env.example` documentado
- [x] Landing/demo inicial
- [x] Build de producción pasando
- [x] Lint sin errores

## Primeros pasos

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo `.env` a partir de `.env.example` y llena los valores manualmente.

3. Genera el cliente de Prisma:

```bash
npm run db:generate
```

4. Empuja el esquema a tu base de datos:

```bash
npm run db:push
```

5. Ejecuta el seed:

```bash
npm run db:seed
```

6. Corre el proyecto:

```bash
npm run dev
```

## Estado de Fase 2

Fase 2: appointments core 🚧 en progreso

Implementado en esta fase:

- servicio de dominio para disponibilidad de citas
- validación de slots contra horario, bloqueos y traslapes
- creación de citas con upsert de contacto por teléfono
- cancelación de citas
- reagendado de citas
- endpoints API para disponibilidad y citas
- endpoint `GET /api/services` para catálogo activo
- panel interactivo en `/` con lista de citas, catálogo, consulta de slots y formulario para crear/reagendar/cancelar citas

### Endpoints actuales

- `GET /api/availability?serviceId=<id>&from=<iso>&to=<iso>`
- `GET /api/appointments`
- `POST /api/appointments`
- `PATCH /api/appointments/:appointmentId`
- `DELETE /api/appointments/:appointmentId`

### Payload base para crear cita

```json
{
  "contact": {
    "name": "Paciente Demo",
    "phone": "+5215555555555",
    "email": "demo@example.com"
  },
  "serviceId": "<service-id>",
  "appointmentStart": "2026-03-20T16:00:00.000Z",
  "notes": "Primera visita"
}
```

### Siguiente tramo recomendado de Fase 2

- agregar tests del dominio de agenda
- exponer servicios y catálogo desde API
- crear panel básico para consumir estos endpoints
- preparar integración con WhatsApp/OpenAI sobre este core

## Notas

- No se deben guardar secretos en el repo.
- Usa `.env.example` como guía, pero llena `.env` manualmente.
- La lógica de agenda real y la integración con Twilio/OpenAI vienen en las siguientes fases.
