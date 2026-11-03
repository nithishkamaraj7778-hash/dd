# DD Enterprises Finance Management System

Finance management app for customer records, loans, collections, and receipts.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- API: Node.js, Express, TypeScript
- Database: SQLite with Prisma (as configured in `prisma/schema.prisma`)
- Authentication: JWT and bcrypt

## Project layout

```text
frontend/       React application and Vite configuration
backend/        Express API, middleware, services, and controllers
prisma/         Prisma schema and local SQLite database
public/         Static fallback UI served when no frontend build exists
.env.example    Local environment template
```

## Local development

1. Install frontend and backend dependencies: `npm install --prefix frontend` and `npm install --prefix backend`.
2. Copy `.env.example` to `.env` and set a unique `JWT_SECRET`.
3. Start the API: `npm run dev --prefix backend`
4. Start the frontend in another terminal: `npm run dev --prefix frontend`

The Vite app uses `http://localhost:5001/api` by default. Set `VITE_API_URL` to override it.

To create a production build, run `npm run build` from the workspace root. This builds the frontend first and then the API. When the built frontend exists, the API serves it; otherwise, the API serves the static fallback from `public/`.

## Deployment notes

The Prisma schema currently uses SQLite. The deployment instructions and PostgreSQL connection settings previously documented here did not match that schema. Before deploying to a managed PostgreSQL service, migrate the Prisma datasource and database migrations to PostgreSQL and configure a persistent database; do not point this SQLite schema at a PostgreSQL URL.

For a separately hosted frontend, set `VITE_API_URL` at build time to the public backend API URL including `/api`. Set `JWT_SECRET` to a long, randomly generated secret in the backend environment.
