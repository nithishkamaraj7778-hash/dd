# DD Enterprises Employee Management Portal

Finance and employee management app for customer records, loans, collections, and receipts. One employer account manages employee workspaces; each employee is restricted to their assigned customers and transactions they recorded.

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
.env.example    Local environment template
```

## Local development

1. Install frontend and backend dependencies: `npm install --prefix frontend` and `npm install --prefix backend`.
2. Copy `.env.example` to `.env` and set a unique `JWT_SECRET`.
3. Apply Prisma migrations with `npm run prisma:deploy --prefix backend`.
4. If the database is empty, provision its first employer as described below.
5. Start the API: `npm run dev --prefix backend`
6. Start the frontend in another terminal: `npm run dev --prefix frontend`

The Vite app uses `http://localhost:5001/api` by default. Set `VITE_API_URL` to override it.

To create a production build, run `npm run build` from the workspace root. This builds the frontend first and then the API. The API serves the current portal from `frontend/dist`; run the build before starting a deployment so the UI is available.

## Roles and data access

- `SUPERADMIN` is the employer role. It can view all employees, customers, accounts, payments, audit activity, and reports, and manage employee accounts and customer assignments.
- `EMPLOYEE` can view and update customers assigned to their employee profile, create loans for those customers, and see or reverse only payments they recorded. The API derives ownership from the authenticated user; client-supplied role or owner IDs are rejected or ignored.
- Employee account creation, status changes, archive, password reset, and reports are under `/api/employees` and require the employer role. New and reset passwords are temporary; financial and employee APIs remain blocked until the employee changes the password.
- Authentication is bearer-token based. Tokens expire after eight hours and are invalidated on logout, password changes, resets, deactivation, or archival. Login is rate limited.
- Customer/account/payment reads, detail endpoints, mutations, audit activity, and CSV exports are server-filtered by role and ownership.

## Database setup and migrations

The schema uses SQLite. Back up the database before applying migrations.

- New database: set `DATABASE_URL`, then run `npm run prisma:deploy --prefix backend`.
- Existing database created before migrations were added: back it up, mark only the matching original schema as applied with `npx prisma migrate resolve --schema prisma/schema.prisma --applied 20261103000000_initial_schema`, then run `npm run prisma:deploy --prefix backend`. The employee migration adds profile/ownership fields, preserves existing records and credentials, and converts non-employer users to employees.
- Do not mark the baseline migration as applied on a new/empty database.

## First employer account

There is no public registration endpoint. For a new empty database, set `BOOTSTRAP_ADMIN_USERNAME` and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 14 characters in the private environment, then run `npm run prisma:seed --prefix backend` once. The seed refuses to run if any user already exists. Remove the bootstrap variables afterward. Existing databases with an employer account do not need this step.

## Tests

Run `npm run build` from the root and `npm test --prefix backend`. The backend tests migrate and use a disposable SQLite database under the operating system temporary directory; they do not alter `prisma/dev.db`.

## Deployment notes

Set a unique `JWT_SECRET` of at least 32 characters and configure `ALLOWED_ORIGINS` to the exact frontend origins (comma-separated). For multiple backend instances, configure a shared store for the login rate limiter. SQLite requires durable persistent storage and is not suitable for concurrent multi-instance deployment.

For a separately hosted frontend, set `VITE_API_URL` at build time to the public backend API URL including `/api`. If the app is served by the same backend origin, leave `VITE_API_URL` unset and the frontend uses relative `/api` requests.
