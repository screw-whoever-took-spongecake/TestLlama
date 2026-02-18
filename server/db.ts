import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export interface ProjectRow {
  id: number;
  name: string;
}

export interface TestCaseRow {
  id: number;
  name: string;
  project_id: number;
}

export interface TestCaseStepRow {
  id: number;
  test_case_id: number;
  position: number;
  step_description: string;
  expected_results: string;
  attachments: string;
}

export interface JiraLinkRow {
  id: number;
  test_case_id: number;
  jira_issue_key: string;
  created_at: string;
}

export interface TestRunRow {
  id: number;
  name: string;
  status: string;
  project_id: number | null;
  source_test_case_id: number | null;
  source_test_case_name: string;
  created_at: string;
  updated_at: string;
}

export interface TestRunStepRow {
  id: number;
  test_run_id: number;
  position: number;
  step_description: string;
  expected_results: string;
  attachments: string;
  actual_results: string;
  actual_result_attachments: string;
  checked: boolean;
  step_status: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

const SEED_PROJECT_NAME = 'Sample Project';
const SEED_TEST_CASES = [
  'Login with valid credentials',
  'Submit order form',
  'Export report as PDF',
];

export async function initDb(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS test_cases (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS test_case_steps (
      id SERIAL PRIMARY KEY,
      test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      step_description TEXT NOT NULL DEFAULT '',
      expected_results TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT ''
    )
  `);

  // Migrate: rename old actual_results column to step_description if it still exists
  const colCheck = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'test_case_steps' AND column_name = 'actual_results'`
  );
  if (colCheck.rowCount && colCheck.rowCount > 0) {
    await query('ALTER TABLE test_case_steps RENAME COLUMN actual_results TO step_description');
  }

  // Migrate: add attachments column if it doesn't exist yet
  const attachCol = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'test_case_steps' AND column_name = 'attachments'`
  );
  if (!attachCol.rowCount || attachCol.rowCount === 0) {
    await query("ALTER TABLE test_case_steps ADD COLUMN attachments TEXT NOT NULL DEFAULT ''");
  }

  await query(`
    CREATE TABLE IF NOT EXISTS jira_links (
      id SERIAL PRIMARY KEY,
      test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      jira_issue_key TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(test_case_id, jira_issue_key)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready_to_test',
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      source_test_case_id INTEGER REFERENCES test_cases(id) ON DELETE SET NULL,
      source_test_case_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS test_run_steps (
      id SERIAL PRIMARY KEY,
      test_run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      step_description TEXT NOT NULL DEFAULT '',
      expected_results TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '',
      actual_results TEXT NOT NULL DEFAULT '',
      actual_result_attachments TEXT NOT NULL DEFAULT '',
      checked BOOLEAN NOT NULL DEFAULT FALSE,
      step_status TEXT NOT NULL DEFAULT 'not_run'
    )
  `);

  // Migrate: add step_status column to existing test_run_steps tables
  const stepStatusCol = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'test_run_steps' AND column_name = 'step_status'`
  );
  if (!stepStatusCol.rowCount || stepStatusCol.rowCount === 0) {
    await query("ALTER TABLE test_run_steps ADD COLUMN step_status TEXT NOT NULL DEFAULT 'not_run'");
  }

  const existing = await query('SELECT count(*)::int AS cnt FROM projects');
  if (existing.rows[0].cnt === 0) {
    const projectResult = await query<ProjectRow>(
      `INSERT INTO projects (name) VALUES ($1) RETURNING id, name`,
      [SEED_PROJECT_NAME]
    );
    const projectId = projectResult.rows[0].id;

    for (const name of SEED_TEST_CASES) {
      await query(
        'INSERT INTO test_cases (name, project_id) VALUES ($1, $2)',
        [name, projectId]
      );
    }
  }
}

export interface ProjectApi {
  id: number;
  name: string;
}

export interface TestCaseApi {
  id: string;
  name: string;
  projectId: number;
}

export interface StepAttachmentApi {
  id: string;
  filename: string;
  mimeType: 'image/png' | 'image/jpeg';
  url: string;
}

export interface TestCaseStepApi {
  id: number;
  position: number;
  stepDescription: string;
  expectedResults: string;
  attachments: StepAttachmentApi[];
}

export function formatProject(row: ProjectRow): ProjectApi {
  return { id: row.id, name: row.name };
}

export function formatTestCase(row: TestCaseRow): TestCaseApi {
  return {
    id: `TC-${row.id}`,
    name: row.name,
    projectId: row.project_id,
  };
}

export function formatTestCaseStep(row: TestCaseStepRow): TestCaseStepApi {
  let attachments: StepAttachmentApi[] = [];
  try {
    const parsed = JSON.parse(row.attachments || '[]');
    if (Array.isArray(parsed)) {
      attachments = (parsed as Record<string, string>[]).map((item) => ({
        id: item.id ?? '',
        filename: item.filename ?? '',
        mimeType: (item.mimeType ?? 'image/png') as 'image/png' | 'image/jpeg',
        // backward-compat: old records stored base64 in dataUrl
        url: item.url ?? item.dataUrl ?? '',
      }));
    }
  } catch { /* keep empty array on malformed JSON */ }
  return {
    id: row.id,
    position: row.position,
    stepDescription: row.step_description ?? '',
    expectedResults: row.expected_results ?? '',
    attachments,
  };
}

export interface JiraLinkApi {
  id: number;
  testCaseId: string;
  jiraIssueKey: string;
  createdAt: string;
}

export function formatJiraLink(row: JiraLinkRow): JiraLinkApi {
  return {
    id: row.id,
    testCaseId: `TC-${row.test_case_id}`,
    jiraIssueKey: row.jira_issue_key,
    createdAt: row.created_at,
  };
}

// ─── Test Run helpers ──────────────────────────────────────────────────────

export interface TestRunApi {
  id: number;
  name: string;
  status: string;
  projectId: number | null;
  sourceTestCaseId: number | null;
  sourceTestCaseName: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestRunStepApi {
  id: number;
  position: number;
  stepDescription: string;
  expectedResults: string;
  attachments: StepAttachmentApi[];
  actualResults: string;
  actualResultAttachments: StepAttachmentApi[];
  checked: boolean;
  stepStatus: string;
}

export function formatTestRun(row: TestRunRow): TestRunApi {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    projectId: row.project_id,
    sourceTestCaseId: row.source_test_case_id,
    sourceTestCaseName: row.source_test_case_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseAttachments(raw: string): StepAttachmentApi[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      return (parsed as Record<string, string>[]).map((item) => ({
        id: item.id ?? '',
        filename: item.filename ?? '',
        mimeType: (item.mimeType ?? 'image/png') as 'image/png' | 'image/jpeg',
        url: item.url ?? item.dataUrl ?? '',
      }));
    }
  } catch { /* keep empty array on malformed JSON */ }
  return [];
}

export function formatTestRunStep(row: TestRunStepRow): TestRunStepApi {
  return {
    id: row.id,
    position: row.position,
    stepDescription: row.step_description ?? '',
    expectedResults: row.expected_results ?? '',
    attachments: parseAttachments(row.attachments),
    actualResults: row.actual_results ?? '',
    actualResultAttachments: parseAttachments(row.actual_result_attachments),
    checked: row.checked ?? false,
    stepStatus: row.step_status ?? 'not_run',
  };
}

// ─── Settings helpers ─────────────────────────────────────────────────────

export async function getSettingValue(key: string, defaultValue = ''): Promise<string> {
  const result = await query<{ value: string }>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return result.rows[0]?.value ?? defaultValue;
}

export async function setSettingValue(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}
