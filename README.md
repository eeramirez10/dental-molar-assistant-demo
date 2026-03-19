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

Fase 1: project setup

Incluye:

- proyecto base con Next.js
- Prisma configurado para PostgreSQL
- esquema inicial de datos
- seed inicial para servicios y horario de 9 AM a 9 PM
- `.env.example` con variables requeridas
- estructura base para crecer con arquitectura limpia

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

## Notas

- No se deben guardar secretos en el repo.
- Usa `.env.example` como guía, pero llena `.env` manualmente.
- La lógica de agenda real y la integración con Twilio/OpenAI vienen en las siguientes fases.
