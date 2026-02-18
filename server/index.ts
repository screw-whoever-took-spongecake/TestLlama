import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';
import { query, initDb, formatTestCase, formatProject, formatJiraLink, formatTestCaseStep, formatTestRun, formatTestRunStep, getSettingValue, setSettingValue } from './db';
import type { TestCaseRow, ProjectRow, JiraLinkRow, TestCaseStepRow, TestRunRow, TestRunStepRow } from './db';
import type { TestCaseApi, ProjectApi } from './db';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// ─── Uploads directory ──────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = file.mimetype === 'image/png' ? '.png' : '.jpg';
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}. Only PNG and JPEG are allowed.`));
  },
});

app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/service/uploads', express.static(UPLOADS_DIR));

export interface ProjectWithCasesApi extends ProjectApi {
  testCases: TestCaseApi[];
}

app.get('/service/projects', async (_req: Request, res: Response): Promise<void> => {
  try {
    const projectsResult = await query<ProjectRow>(
      'SELECT id, name FROM projects ORDER BY name ASC'
    );
    const casesResult = await query<TestCaseRow>(
      'SELECT id, name, project_id FROM test_cases ORDER BY name ASC'
    );

    // Fetch Jira links grouped by test case id
    const jiraLinksResult = await query<{ test_case_id: number; jira_issue_key: string }>(
      'SELECT test_case_id, jira_issue_key FROM jira_links ORDER BY test_case_id'
    );
    const jiraKeysByTestCase = new Map<number, string[]>();
    for (const row of jiraLinksResult.rows) {
      const list = jiraKeysByTestCase.get(row.test_case_id) ?? [];
      list.push(row.jira_issue_key);
      jiraKeysByTestCase.set(row.test_case_id, list);
    }

    const casesByProject = new Map<number, (TestCaseApi & { jiraIssueKeys: string[] })[]>();
    for (const row of casesResult.rows) {
      const list = casesByProject.get(row.project_id) ?? [];
      list.push({
        ...formatTestCase(row),
        jiraIssueKeys: jiraKeysByTestCase.get(row.id) ?? [],
      });
      casesByProject.set(row.project_id, list);
    }
    const body = projectsResult.rows.map((p) => ({
      ...formatProject(p),
      testCases: casesByProject.get(p.id) ?? [],
    }));
    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

const NAME_MAX_LENGTH = 50;

interface CreateProjectBody {
  name?: unknown;
}

app.post('/service/projects', async (req: Request<object, object, CreateProjectBody>, res: Response): Promise<void> => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const trimmed = name.trim();
  if (trimmed.length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `Name must be at most ${NAME_MAX_LENGTH} characters` });
    return;
  }
  try {
    const result = await query<ProjectRow>(
      'INSERT INTO projects (name) VALUES ($1) RETURNING id, name',
      [trimmed]
    );
    res.status(201).json(formatProject(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

interface UpdateProjectBody {
  name?: unknown;
}

app.put('/service/projects/:id', async (req: Request<{ id: string }, object, UpdateProjectBody>, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const trimmed = name.trim();
  if (trimmed.length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `Name must be at most ${NAME_MAX_LENGTH} characters` });
    return;
  }
  try {
    const result = await query<ProjectRow>(
      'UPDATE projects SET name = $1 WHERE id = $2 RETURNING id, name',
      [trimmed, id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(formatProject(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

app.delete('/service/projects/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const result = await query('DELETE FROM projects WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(204).send();
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === '23503') {
      res.status(409).json({ error: 'Project has test cases; delete or move them first.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

function parseTestCaseId(raw: string): number {
  return raw.startsWith('TC-') ? parseInt(raw.slice(3), 10) : parseInt(raw, 10);
}

// GET /service/test-cases/:id — single test case with its steps
app.get('/service/test-cases/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const id = parseTestCaseId(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const tcResult = await query<TestCaseRow & { project_name: string }>(
      `SELECT tc.id, tc.name, tc.project_id, p.name AS project_name
       FROM test_cases tc
       LEFT JOIN projects p ON p.id = tc.project_id
       WHERE tc.id = $1`,
      [id]
    );
    if (tcResult.rowCount === 0) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }
    const stepsResult = await query<TestCaseStepRow>(
      'SELECT id, test_case_id, position, step_description, expected_results, attachments FROM test_case_steps WHERE test_case_id = $1 ORDER BY position ASC',
      [id]
    );
    const tc = tcResult.rows[0];
    res.json({
      ...formatTestCase(tc),
      projectName: tc.project_name ?? null,
      steps: stepsResult.rows.map(formatTestCaseStep),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch test case' });
  }
});

app.get('/service/test-cases', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<TestCaseRow>(
      'SELECT id, name, project_id FROM test_cases ORDER BY name ASC'
    );
    res.json(result.rows.map(formatTestCase));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch test cases' });
  }
});

interface CreateCaseBody {
  name?: unknown;
  projectId?: unknown;
}

app.post('/service/test-cases', async (req: Request<object, object, CreateCaseBody>, res: Response): Promise<void> => {
  const { name, projectId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const nameTrimmed = name.trim();
  if (nameTrimmed.length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `Name must be at most ${NAME_MAX_LENGTH} characters` });
    return;
  }
  if (projectId == null || (typeof projectId !== 'number' && typeof projectId !== 'string')) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const pid = Number(projectId);
  if (Number.isNaN(pid) || pid < 1) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  try {
    const result = await query<TestCaseRow>(
      'INSERT INTO test_cases (name, project_id) VALUES ($1, $2) RETURNING id, name, project_id',
      [nameTrimmed, pid]
    );
    res.status(201).json(formatTestCase(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create test case' });
  }
});

interface StepInput {
  stepDescription?: string;
  expectedResults?: string;
  attachments?: object[];
}

interface UpdateCaseBody {
  name?: unknown;
  projectId?: unknown;
  steps?: unknown;
}

app.put('/service/test-cases/:id', async (req: Request<{ id: string }, object, UpdateCaseBody>, res: Response): Promise<void> => {
  const id = parseTestCaseId(req.params.id);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  const { name, projectId, steps } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const nameTrimmed = name.trim();
  if (nameTrimmed.length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `Name must be at most ${NAME_MAX_LENGTH} characters` });
    return;
  }
  if (projectId == null || (typeof projectId !== 'number' && typeof projectId !== 'string')) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const pid = Number(projectId);
  if (Number.isNaN(pid) || pid < 1) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  try {
    const result = await query<TestCaseRow>(
      'UPDATE test_cases SET name = $1, project_id = $2 WHERE id = $3 RETURNING id, name, project_id',
      [nameTrimmed, pid, id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }

    // Replace steps: delete all existing then re-insert
    if (Array.isArray(steps)) {
      await query('DELETE FROM test_case_steps WHERE test_case_id = $1', [id]);
      const stepList = steps as StepInput[];
      for (let i = 0; i < stepList.length; i++) {
        const s = stepList[i];
        await query(
          'INSERT INTO test_case_steps (test_case_id, position, step_description, expected_results, attachments) VALUES ($1, $2, $3, $4, $5)',
          [id, i + 1, s.stepDescription ?? '', s.expectedResults ?? '', JSON.stringify(Array.isArray(s.attachments) ? s.attachments : [])]
        );
      }
    }

    // Return the updated test case with steps
    const stepsResult = await query<TestCaseStepRow>(
      'SELECT id, test_case_id, position, step_description, expected_results, attachments FROM test_case_steps WHERE test_case_id = $1 ORDER BY position ASC',
      [id]
    );
    res.json({
      ...formatTestCase(result.rows[0]),
      steps: stepsResult.rows.map(formatTestCaseStep),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update test case' });
  }
});

app.delete('/service/test-cases/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const idParam = req.params.id;
  const id = idParam.startsWith('TC-') ? parseInt(idParam.slice(3), 10) : parseInt(idParam, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const result = await query('DELETE FROM test_cases WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete test case' });
  }
});

// ---------- Settings endpoints ----------

app.get('/service/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const jiraBaseUrl = await getSettingValue('jiraBaseUrl', '');
    res.json({ jiraBaseUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

interface UpdateSettingsBody {
  jiraBaseUrl?: unknown;
}

app.put('/service/settings', async (req: Request<object, object, UpdateSettingsBody>, res: Response): Promise<void> => {
  const { jiraBaseUrl } = req.body;
  if (typeof jiraBaseUrl !== 'string') {
    res.status(400).json({ error: 'jiraBaseUrl must be a string' });
    return;
  }
  try {
    const trimmed = jiraBaseUrl.trim().replace(/\/$/, ''); // strip trailing slash
    await setSettingValue('jiraBaseUrl', trimmed);
    res.json({ jiraBaseUrl: trimmed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ---------- Jira integration endpoints ----------

function forgeAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const forgeApiKey = process.env.FORGE_API_KEY;
  if (!forgeApiKey) {
    // If no key is configured, allow all requests (development mode)
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = authHeader.slice(7);
  if (token !== forgeApiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }
  next();
}

app.use('/service/jira', forgeAuthMiddleware);

// GET /service/jira/links?issueKey=PROJ-123  OR  ?testCaseId=TC-5
app.get('/service/jira/links', async (req: Request, res: Response): Promise<void> => {
  const { issueKey, testCaseId } = req.query;
  try {
    if (typeof issueKey === 'string' && issueKey.trim()) {
      const result = await query<JiraLinkRow & { test_case_name: string; project_id: number }>(
        `SELECT jl.id, jl.test_case_id, jl.jira_issue_key, jl.created_at,
                tc.name AS test_case_name, tc.project_id
         FROM jira_links jl
         JOIN test_cases tc ON tc.id = jl.test_case_id
         WHERE jl.jira_issue_key = $1
         ORDER BY jl.created_at DESC`,
        [issueKey.trim()]
      );
      const links = result.rows.map((row) => ({
        ...formatJiraLink(row),
        testCaseName: row.test_case_name,
        projectId: row.project_id,
      }));
      res.json(links);
      return;
    }
    if (typeof testCaseId === 'string' && testCaseId.trim()) {
      const numericId = testCaseId.startsWith('TC-')
        ? parseInt(testCaseId.slice(3), 10)
        : parseInt(testCaseId, 10);
      if (Number.isNaN(numericId)) {
        res.status(400).json({ error: 'Invalid testCaseId' });
        return;
      }
      const result = await query<JiraLinkRow>(
        `SELECT id, test_case_id, jira_issue_key, created_at
         FROM jira_links WHERE test_case_id = $1
         ORDER BY created_at DESC`,
        [numericId]
      );
      res.json(result.rows.map(formatJiraLink));
      return;
    }
    res.status(400).json({ error: 'Provide issueKey or testCaseId query parameter' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch Jira links' });
  }
});

interface CreateJiraLinkBody {
  testCaseId?: unknown;
  jiraIssueKey?: unknown;
}

// POST /service/jira/links
app.post('/service/jira/links', async (req: Request<object, object, CreateJiraLinkBody>, res: Response): Promise<void> => {
  const { testCaseId, jiraIssueKey } = req.body;
  if (!testCaseId || typeof testCaseId !== 'string') {
    res.status(400).json({ error: 'testCaseId is required (e.g. "TC-5" or "5")' });
    return;
  }
  if (!jiraIssueKey || typeof jiraIssueKey !== 'string' || !jiraIssueKey.trim()) {
    res.status(400).json({ error: 'jiraIssueKey is required' });
    return;
  }
  const numericId = testCaseId.startsWith('TC-')
    ? parseInt(testCaseId.slice(3), 10)
    : parseInt(testCaseId, 10);
  if (Number.isNaN(numericId)) {
    res.status(400).json({ error: 'Invalid testCaseId' });
    return;
  }
  try {
    const result = await query<JiraLinkRow>(
      `INSERT INTO jira_links (test_case_id, jira_issue_key)
       VALUES ($1, $2)
       ON CONFLICT (test_case_id, jira_issue_key) DO NOTHING
       RETURNING id, test_case_id, jira_issue_key, created_at`,
      [numericId, jiraIssueKey.trim().toUpperCase()]
    );
    if (result.rowCount === 0) {
      res.status(409).json({ error: 'Link already exists' });
      return;
    }
    res.status(201).json(formatJiraLink(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create Jira link' });
  }
});

// DELETE /service/jira/links/:id
app.delete('/service/jira/links/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const result = await query('DELETE FROM jira_links WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Jira link not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete Jira link' });
  }
});

interface CreateTestCaseWithJiraBody {
  name?: unknown;
  projectId?: unknown;
  jiraIssueKey?: unknown;
}

// POST /service/jira/test-cases — create test case and immediately link to a Jira issue
app.post('/service/jira/test-cases', async (req: Request<object, object, CreateTestCaseWithJiraBody>, res: Response): Promise<void> => {
  const { name, projectId, jiraIssueKey } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const nameTrimmed = name.trim();
  if (nameTrimmed.length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `Name must be at most ${NAME_MAX_LENGTH} characters` });
    return;
  }
  if (projectId == null || (typeof projectId !== 'number' && typeof projectId !== 'string')) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  const pid = Number(projectId);
  if (Number.isNaN(pid) || pid < 1) {
    res.status(400).json({ error: 'Invalid projectId' });
    return;
  }
  if (!jiraIssueKey || typeof jiraIssueKey !== 'string' || !jiraIssueKey.trim()) {
    res.status(400).json({ error: 'jiraIssueKey is required' });
    return;
  }
  try {
    const tcResult = await query<TestCaseRow>(
      'INSERT INTO test_cases (name, project_id) VALUES ($1, $2) RETURNING id, name, project_id',
      [nameTrimmed, pid]
    );
    const tc = tcResult.rows[0];
    await query(
      'INSERT INTO jira_links (test_case_id, jira_issue_key) VALUES ($1, $2)',
      [tc.id, jiraIssueKey.trim().toUpperCase()]
    );
    res.status(201).json({
      ...formatTestCase(tc),
      jiraIssueKey: jiraIssueKey.trim().toUpperCase(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create test case with Jira link' });
  }
});

// ─── Test Run endpoints ──────────────────────────────────────────────────────

const LOCKED_STATUSES = new Set(['passed', 'failed']);

// GET /service/test-runs — all runs grouped by project
app.get('/service/test-runs', async (_req: Request, res: Response): Promise<void> => {
  try {
    const projectsResult = await query<ProjectRow>('SELECT id, name FROM projects ORDER BY name ASC');
    const runsResult = await query<TestRunRow>(
      `SELECT id, name, status, project_id, source_test_case_id, source_test_case_name, created_at, updated_at
       FROM test_runs ORDER BY name ASC`
    );

    const runsByProject = new Map<number | null, ReturnType<typeof formatTestRun>[]>();
    for (const row of runsResult.rows) {
      const key = row.project_id;
      const list = runsByProject.get(key) ?? [];
      list.push(formatTestRun(row));
      runsByProject.set(key, list);
    }

    const body: { id: number | null; name: string; testRuns: ReturnType<typeof formatTestRun>[] }[] = [];
    for (const p of projectsResult.rows) {
      body.push({ id: p.id, name: p.name, testRuns: runsByProject.get(p.id) ?? [] });
      runsByProject.delete(p.id);
    }
    // Runs whose project was deleted (null project_id)
    const orphaned = runsByProject.get(null);
    if (orphaned && orphaned.length > 0) {
      body.push({ id: null, name: 'Uncategorized', testRuns: orphaned });
    }

    res.json(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch test runs' });
  }
});

// GET /service/test-runs/:id — single run with steps
app.get('/service/test-runs/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const runResult = await query<TestRunRow & { project_name: string }>(
      `SELECT tr.id, tr.name, tr.status, tr.project_id, tr.source_test_case_id,
              tr.source_test_case_name, tr.created_at, tr.updated_at,
              p.name AS project_name
       FROM test_runs tr
       LEFT JOIN projects p ON p.id = tr.project_id
       WHERE tr.id = $1`,
      [id]
    );
    if (!runResult.rowCount) {
      res.status(404).json({ error: 'Test run not found' });
      return;
    }
    const stepsResult = await query<TestRunStepRow>(
      `SELECT id, test_run_id, position, step_description, expected_results, attachments,
              actual_results, actual_result_attachments, checked, step_status
       FROM test_run_steps WHERE test_run_id = $1 ORDER BY position ASC`,
      [id]
    );
    const run = runResult.rows[0];
    res.json({
      ...formatTestRun(run),
      projectName: run.project_name ?? null,
      steps: stepsResult.rows.map(formatTestRunStep),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch test run' });
  }
});

interface CreateRunBody {
  name?: unknown;
  testCaseId?: unknown;
}

// POST /service/test-runs — create run, copying steps from a test case
app.post('/service/test-runs', async (req: Request<object, object, CreateRunBody>, res: Response): Promise<void> => {
  const { name, testCaseId } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  const nameTrimmed = name.trim();
  if (nameTrimmed.length > NAME_MAX_LENGTH) {
    res.status(400).json({ error: `Name must be at most ${NAME_MAX_LENGTH} characters` });
    return;
  }
  if (!testCaseId || (typeof testCaseId !== 'string' && typeof testCaseId !== 'number')) {
    res.status(400).json({ error: 'testCaseId is required' });
    return;
  }
  const tcNumId = typeof testCaseId === 'string'
    ? (testCaseId.startsWith('TC-') ? parseInt(testCaseId.slice(3), 10) : parseInt(testCaseId, 10))
    : testCaseId;
  if (Number.isNaN(tcNumId) || tcNumId < 1) {
    res.status(400).json({ error: 'Invalid testCaseId' });
    return;
  }
  try {
    const tcResult = await query<TestCaseRow>(
      'SELECT id, name, project_id FROM test_cases WHERE id = $1',
      [tcNumId]
    );
    if (!tcResult.rowCount) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }
    const tc = tcResult.rows[0];
    const runResult = await query<TestRunRow>(
      `INSERT INTO test_runs (name, status, project_id, source_test_case_id, source_test_case_name)
       VALUES ($1, 'ready_to_test', $2, $3, $4)
       RETURNING id, name, status, project_id, source_test_case_id, source_test_case_name, created_at, updated_at`,
      [nameTrimmed, tc.project_id, tc.id, tc.name]
    );
    const run = runResult.rows[0];

    const stepsResult = await query<TestCaseStepRow>(
      'SELECT id, position, step_description, expected_results, attachments FROM test_case_steps WHERE test_case_id = $1 ORDER BY position ASC',
      [tc.id]
    );
    for (const step of stepsResult.rows) {
      await query(
        `INSERT INTO test_run_steps (test_run_id, position, step_description, expected_results, attachments, actual_results, actual_result_attachments, checked)
         VALUES ($1, $2, $3, $4, $5, '', '', FALSE)`,
        [run.id, step.position, step.step_description, step.expected_results, step.attachments]
      );
    }

    res.status(201).json(formatTestRun(run));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create test run' });
  }
});

interface UpdateRunStepInput {
  id: number;
  actualResults?: string;
  actualResultAttachments?: object[];
  checked?: boolean;
  stepStatus?: string;
}

interface UpdateRunBody {
  status?: unknown;
  steps?: unknown;
}

// PUT /service/test-runs/:id — update status and/or step mutable fields
app.put('/service/test-runs/:id', async (req: Request<{ id: string }, object, UpdateRunBody>, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const existing = await query<TestRunRow>(
      'SELECT id, status FROM test_runs WHERE id = $1',
      [id]
    );
    if (!existing.rowCount) {
      res.status(404).json({ error: 'Test run not found' });
      return;
    }
    const currentStatus = existing.rows[0].status;
    const isLocked = LOCKED_STATUSES.has(currentStatus);

    const { status, steps } = req.body;

    // If locked, only allow status to change
    if (isLocked && steps != null && Array.isArray(steps) && steps.length > 0) {
      res.status(409).json({ error: `Test run is ${currentStatus} and locked. Only the status can be changed.` });
      return;
    }

    const validStatuses = ['ready_to_test', 'passed', 'failed', 'na'];
    if (status != null && (typeof status !== 'string' || !validStatuses.includes(status))) {
      res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    if (status != null) {
      await query(
        `UPDATE test_runs SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, id]
      );
    } else {
      await query('UPDATE test_runs SET updated_at = NOW() WHERE id = $1', [id]);
    }

    if (!isLocked && Array.isArray(steps)) {
      for (const step of steps as UpdateRunStepInput[]) {
        if (typeof step.id !== 'number') continue;
        await query(
          `UPDATE test_run_steps
           SET actual_results = COALESCE($1, actual_results),
               actual_result_attachments = COALESCE($2, actual_result_attachments),
               checked = COALESCE($3, checked),
               step_status = COALESCE($4, step_status)
           WHERE id = $5 AND test_run_id = $6`,
          [
            step.actualResults ?? null,
            step.actualResultAttachments != null ? JSON.stringify(step.actualResultAttachments) : null,
            step.checked ?? null,
            step.stepStatus ?? null,
            step.id,
            id,
          ]
        );
      }
    }

    const updated = await query<TestRunRow>(
      `SELECT id, name, status, project_id, source_test_case_id, source_test_case_name, created_at, updated_at
       FROM test_runs WHERE id = $1`,
      [id]
    );
    const stepsResult = await query<TestRunStepRow>(
      `SELECT id, test_run_id, position, step_description, expected_results, attachments,
              actual_results, actual_result_attachments, checked, step_status
       FROM test_run_steps WHERE test_run_id = $1 ORDER BY position ASC`,
      [id]
    );
    res.json({
      ...formatTestRun(updated.rows[0]),
      steps: stepsResult.rows.map(formatTestRunStep),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update test run' });
  }
});

// DELETE /service/test-runs/:id
app.delete('/service/test-runs/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const result = await query('DELETE FROM test_runs WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Test run not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete test run' });
  }
});

// ─── Attachment endpoints ────────────────────────────────────────────────────

app.post('/service/attachments', upload.single('file'), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const id = path.parse(req.file.filename).name; // uuid portion without extension
  res.status(201).json({
    id,
    url: `/service/uploads/${req.file.filename}`,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
  });
});

app.delete('/service/attachments/:id', (req: Request, res: Response): void => {
  const { id } = req.params;
  // Reject any path traversal attempts
  if (!id || id.includes('/') || id.includes('..')) {
    res.status(400).json({ error: 'Invalid attachment id' });
    return;
  }
  const pngPath = path.join(UPLOADS_DIR, `${id}.png`);
  const jpgPath = path.join(UPLOADS_DIR, `${id}.jpg`);
  const filePath = fs.existsSync(pngPath) ? pngPath : fs.existsSync(jpgPath) ? jpgPath : null;
  if (!filePath) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }
  fs.unlink(filePath, (err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to delete attachment' });
    } else {
      res.status(204).end();
    }
  });
});

app.use((req: express.Request, res: Response) => {
  console.warn(`404 ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not found',
    method: req.method,
    path: req.path,
    hint: 'Expected POST /service/projects for create project. Ensure the server was restarted after route changes.',
  });
});

async function start(): Promise<void> {
  try {
    await initDb();
    app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
