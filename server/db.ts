import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export interface ProjectRow {
  id: number;
  name: string;
}

export interface TestCaseStepRow {
  actual: string;
  expected: string;
}

export interface TestCaseRow {
  id: number;
  name: string;
  project_id: number;
  steps: TestCaseStepRow[];
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

const DUMMY_PROJECT_NAME = 'srgsdfg';
const DUMMY_TEST_CASES = [
  'Login with valid credentials',
  'Submit order form',
  'Export report as PDF',
];

export async function initDb(): Promise<void> {
  await query(`DROP TABLE IF EXISTS test_cases`);
  await query(`DROP TABLE IF EXISTS projects`);

  await query(`
    CREATE TABLE projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE test_cases (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      steps JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const projectResult = await query<ProjectRow>(
    `INSERT INTO projects (name) VALUES ($1) RETURNING id, name`,
    [DUMMY_PROJECT_NAME]
  );
  const projectId = projectResult.rows[0].id;

  for (const name of DUMMY_TEST_CASES) {
    await query(
      'INSERT INTO test_cases (name, project_id, steps) VALUES ($1, $2, $3)',
      [name, projectId, JSON.stringify([])]
    );
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
  steps: TestCaseStepRow[];
}

export function formatProject(row: ProjectRow): ProjectApi {
  return { id: row.id, name: row.name };
}

export function formatTestCase(row: TestCaseRow): TestCaseApi {
  const steps = Array.isArray(row.steps) ? row.steps : [];
  return {
    id: `TC-${row.id}`,
    name: row.name,
    projectId: row.project_id,
    steps: steps.map((s) => ({
      actual: typeof s?.actual === 'string' ? s.actual : '',
      expected: typeof s?.expected === 'string' ? s.expected : '',
    })),
  };
}
