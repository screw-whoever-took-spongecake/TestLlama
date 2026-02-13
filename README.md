# TestLlama

A test management dashboard built with React, TypeScript, Vite, and a Node/Express API backed by PostgreSQL.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, react-icons
- **Backend:** Node.js, Express, TypeScript (tsx)
- **Database:** PostgreSQL (pg driver)

## Prerequisites

- Node.js 18+
- PostgreSQL (local or Docker)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the database**

   ```bash
   createdb testllama
   ```

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set `DATABASE_URL` for your Postgres instance (user, password, host, port if needed).

## Running the app

- **Frontend only** (assumes API is running elsewhere):

  ```bash
  npm run dev
  ```

- **API only** (Express server on port 3001):

  ```bash
  npm run server
  ```

- **Frontend + API together:**

  ```bash
  npm run dev:all
  ```

Then open [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/service` to the backend.

## Scripts

| Script       | Description                    |
| ------------ | ------------------------------ |
| `npm run dev`      | Start Vite dev server          |
| `npm run server`   | Start Express API (tsx)        |
| `npm run dev:all`  | Run both dev server and API    |
| `npm run build`    | Build frontend for production  |
| `npm run preview`  | Preview production build       |
| `npm run lint`     | Run ESLint                     |

## Project structure

- `src/` – React app (TypeScript/TSX): layout, pages (Home, Test Cases, Test Runs, Results), shared types
- `server/` – Express API and DB layer: CRUD for test cases, `test_cases` table
- `vite.config.ts` – Vite config and `/service` proxy to the backend

## Features

- **Dashboard** – Collapsible sidebar, banner, tabbed navigation
- **Test Cases** – List, create, edit, delete test cases; sort by name; persisted in PostgreSQL via REST API
