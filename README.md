# TestLlama

A test management dashboard built with React, TypeScript, Vite, and a Node/Express API backed by PostgreSQL.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router DOM v7, react-icons |
| Backend | Node.js, Express, TypeScript (tsx) |
| Database | PostgreSQL (pg driver) |
| File uploads | multer (PNG/JPEG, 2 MB limit per file) |

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

| Script | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run server` | Start Express API (tsx) |
| `npm run dev:all` | Run both dev server and API |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Project structure

```
src/
  pages/          # Route-level page components
    Home.tsx
    TestCases.tsx
    TestCaseForm.tsx
    TestRuns.tsx
    TestRunForm.tsx
    Results.tsx
    Settings.tsx
  components/     # Shared UI components
    AppLayout.tsx         # Sidebar + banner + outlet wrapper
    Sidebar.tsx           # Collapsible navigation sidebar
    Banner.tsx            # Top bar with breadcrumbs
    Toast.tsx             # Global toast notification system
    StepAttachmentsUpload.tsx  # Image upload widget for step attachments
    DashboardContent.tsx  # (legacy, unused as route element)
  contexts/
    SettingsContext.tsx   # App-wide settings (Jira base URL)
    BreadcrumbContext.tsx # Dynamic breadcrumb override for detail pages
  hooks/
    useBeforeUnload.ts   # Browser unload guard hook
  types/
    testCase.ts          # TestCase, Step, JiraLink, StepAttachment types
    testRun.ts           # TestRun, TestRunStep, status types and helpers
  App.tsx / App.css / index.css / main.tsx

server/
  index.ts        # Express app — all REST endpoints
  db.ts           # pg pool, schema init, row formatters
  uploads/        # Uploaded attachment files (PNG/JPEG)
```

## Features

### Layout

- **Collapsible sidebar** — toggleable navigation; active tab derived from the current URL so the selection survives page refresh
- **Dynamic breadcrumbs** — detail pages (`TestCaseForm`, `TestRunForm`) override the banner breadcrumb via `BreadcrumbContext`; breadcrumbs are clickable and navigate back to the list
- **Toast notifications** — global success/error toasts via `ToastProvider`
- **URL-based routing** — React Router DOM v7; every main section and detail page has its own URL so refreshing the browser keeps the user on the same page

### Test Cases

- **List** — test cases grouped by project; each project row is expand/collapse with state persisted in `localStorage`
- **Sorting** — independent sort controls for projects and for cases within a project (A→Z / Z→A), also persisted
- **Inline create** — type a name and pick a project directly from the list; name is capped at 50 characters
- **Inline rename** — click the pencil icon on any test case to rename in-place
- **Delete** — with confirmation dialog; server prevents deletion of test cases that have associated test runs
- **Jira issue linking** — attach one or more Jira issue keys (e.g. `PROJ-123`) to a test case; displayed as clickable chips that open the issue in Jira when a Jira base URL is configured

#### Test Case edit form (`/service/testcase/:id`)

- **Steps** — ordered list of steps, each with a step description and expected results textarea
- **Reorder** — move steps up/down with animated FLIP transitions
- **Add / delete steps** — add with `+ Add step` button or `Cmd/Ctrl + Enter`; delete with confirmation
- **Step attachments** — upload PNG/JPEG images (up to 2 MB each) per step; thumbnail preview with remove button
- **Jira links** — add or remove Jira issue links directly from the form header; changes count as unsaved edits
- **Save** — `Save` button (top and bottom of steps list) or `Cmd/Ctrl + S`; saves name, steps, and step attachments to the DB
- **Unsaved-changes guard** — navigating away with unsaved changes (steps, attachments, or Jira link modifications) triggers a confirmation dialog via React Router's `useBlocker` and the browser's `beforeunload` event

### Test Runs

- **List** — test runs grouped by project; expand/collapse and sort order persisted in `localStorage`; independent sort controls for projects and runs
- **Create** — pick a test case and provide a run name; steps are copied from the test case at creation time
- **Rename** — inline pencil icon
- **Delete** — with confirmation
- **Status badges** — `Ready to Test`, `In Progress`, `Passed`, `Failed`, `N/A`

#### Test Run edit form (`/service/testrun/:id`)

- **Status selector** — change the overall run status from the header; saves automatically
- **Auto-save** — every field change (status, step status, done checkbox, actual results, attachments) triggers a debounced save (800 ms). `Cmd/Ctrl + S` saves immediately, bypassing the debounce
- **Auto-save indicator** — shows `Saving…` / `✓ Saved` / `Save failed` inline in the header
- **Per-step fields**:
  - **Step status** — `Not Run`, `Passed`, `Failed`, `N/A`, `Passed w/ Improvements`
  - **Done checkbox** — marks a step as complete
  - **Actual results** — free-text textarea for what actually happened
  - **Actual result attachments** — upload images per step alongside the original test case attachments (read-only)
- **Locked state** — runs with status `Passed` or `Failed` are locked: step editing is disabled, a lock banner is displayed, and the save button shows a disabled tooltip

### Settings

- **Jira integration** — configure a Jira base URL (e.g. `https://yourcompany.atlassian.net`); URL is validated before saving; used to make Jira issue key chips clickable throughout the app
- **Projects** — full CRUD for projects directly from the Settings page; sortable by name (A→Z, Z→A) or by test case count; list scrolls naturally as projects grow

### Results

- Placeholder page — planned for aggregated test execution reporting

## REST API

All endpoints are mounted under `/service`.

| Method | Path | Description |
|---|---|---|
| GET | `/service/projects` | List all projects with their test cases and Jira keys |
| POST | `/service/projects` | Create a project |
| PUT | `/service/projects/:id` | Rename a project |
| DELETE | `/service/projects/:id` | Delete a project (blocked if it has test cases) |
| GET | `/service/test-cases` | List all test cases |
| GET | `/service/test-cases/:id` | Get a single test case with steps and attachments |
| POST | `/service/test-cases` | Create a test case |
| PUT | `/service/test-cases/:id` | Update a test case (name, steps, attachments) |
| DELETE | `/service/test-cases/:id` | Delete a test case (blocked if it has test runs) |
| GET | `/service/test-runs` | List all test runs grouped by project |
| GET | `/service/test-runs/:id` | Get a single test run with steps |
| POST | `/service/test-runs` | Create a test run from a test case |
| PUT | `/service/test-runs/:id` | Update a test run (status, step results) |
| DELETE | `/service/test-runs/:id` | Delete a test run |
| GET | `/service/jira/links` | Get Jira links for a test case (`?testCaseId=`) |
| POST | `/service/jira/links` | Add a Jira link to a test case |
| DELETE | `/service/jira/links/:id` | Remove a Jira link |
| POST | `/service/jira/test-cases` | Create a test case pre-linked to a Jira issue |
| GET | `/service/settings` | Get app settings |
| PUT | `/service/settings` | Update app settings |
| POST | `/service/attachments` | Upload an image file (PNG/JPEG, ≤ 2 MB) |
| DELETE | `/service/attachments/:id` | Delete an uploaded file |
| GET | `/service/uploads/:filename` | Serve a stored attachment file |
