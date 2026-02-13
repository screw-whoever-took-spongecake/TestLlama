import express, { Request, Response } from 'express';
import cors from 'cors';
import { query, initDb, formatTestCase, formatProject } from './db';
import type { TestCaseRow, ProjectRow } from './db';
import type { TestCaseApi, ProjectApi } from './db';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

export interface ProjectWithCasesApi extends ProjectApi {
  testCases: TestCaseApi[];
}

app.get('/service/projects', async (_req: Request, res: Response): Promise<void> => {
  try {
    const projectsResult = await query<ProjectRow>(
      'SELECT id, name FROM projects ORDER BY name ASC'
    );
    const casesResult = await query<TestCaseRow>(
      'SELECT id, name, project_id, COALESCE(steps, \'[]\') AS steps FROM test_cases ORDER BY name ASC'
    );
    const casesByProject = new Map<number, TestCaseApi[]>();
    for (const row of casesResult.rows) {
      const list = casesByProject.get(row.project_id) ?? [];
      list.push(formatTestCase(row));
      casesByProject.set(row.project_id, list);
    }
    const body: ProjectWithCasesApi[] = projectsResult.rows.map((p) => ({
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

const TEST_CASES_SELECT = 'SELECT id, name, project_id, COALESCE(steps, \'[]\') AS steps FROM test_cases';

app.get('/service/test-cases', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query<TestCaseRow>(
      `${TEST_CASES_SELECT} ORDER BY name ASC`
    );
    res.json(result.rows.map(formatTestCase));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch test cases' });
  }
});

function parseTestCaseId(param: string): number | null {
  const id = param.startsWith('TC-') ? parseInt(param.slice(3), 10) : parseInt(param, 10);
  return Number.isNaN(id) ? null : id;
}

app.get('/service/test-cases/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const id = parseTestCaseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: 'Invalid test case id' });
    return;
  }
  try {
    const result = await query<TestCaseRow>(
      `${TEST_CASES_SELECT} WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }
    res.json(formatTestCase(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch test case' });
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

interface UpdateCaseBody {
  name?: unknown;
  projectId?: unknown;
  steps?: unknown;
}

function normalizeSteps(raw: unknown): { actual: string; expected: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      actual: typeof o.actual === 'string' ? o.actual : '',
      expected: typeof o.expected === 'string' ? o.expected : '',
    };
  });
}

app.put('/service/test-cases/:id', async (req: Request<{ id: string }, object, UpdateCaseBody>, res: Response): Promise<void> => {
  const id = parseTestCaseId(req.params.id);
  if (id == null) {
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
  const stepsNormalized = normalizeSteps(steps);
  try {
    const result = await query<TestCaseRow>(
      'UPDATE test_cases SET name = $1, project_id = $2, steps = $3 WHERE id = $4 RETURNING id, name, project_id, COALESCE(steps, \'[]\') AS steps',
      [nameTrimmed, pid, JSON.stringify(stepsNormalized), id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Test case not found' });
      return;
    }
    res.json(formatTestCase(result.rows[0]));
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
