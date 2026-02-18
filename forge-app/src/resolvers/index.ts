import Resolver from '@forge/resolver';
import { fetch } from '@forge/api';
import { storage } from '@forge/api';

const resolver = new Resolver();

/**
 * Read the TestLlama API base URL and API key from Forge environment variables.
 * Set these with:
 *   forge variables set TESTLLAMA_API_URL https://your-testllama-domain.com
 *   forge variables set FORGE_API_KEY your-secret-key
 */
async function getConfig(): Promise<{ apiUrl: string; apiKey: string }> {
  const apiUrl =
    (await storage.getSecret('TESTLLAMA_API_URL')) ||
    process.env.TESTLLAMA_API_URL ||
    'http://localhost:3001';
  const apiKey =
    (await storage.getSecret('FORGE_API_KEY')) ||
    process.env.FORGE_API_KEY ||
    '';
  return { apiUrl: apiUrl.replace(/\/+$/, ''), apiKey };
}

function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

interface LinkedTestCase {
  id: number;
  testCaseId: string;
  jiraIssueKey: string;
  createdAt: string;
  testCaseName?: string;
  projectId?: number;
}

/**
 * getLinkedTestCases — called by the Custom UI to list test cases linked to the current Jira issue.
 * Payload: { issueKey: string }
 */
resolver.define('getLinkedTestCases', async ({ payload }): Promise<LinkedTestCase[]> => {
  const { issueKey } = payload as { issueKey: string };
  if (!issueKey) return [];

  const { apiUrl, apiKey } = await getConfig();
  const url = `${apiUrl}/service/jira/links?issueKey=${encodeURIComponent(issueKey)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });

  if (!response.ok) {
    console.error(`getLinkedTestCases failed: ${response.status}`);
    return [];
  }

  return (await response.json()) as LinkedTestCase[];
});

/**
 * linkTestCase — link an existing test case to a Jira issue.
 * Payload: { testCaseId: string, jiraIssueKey: string }
 */
resolver.define('linkTestCase', async ({ payload }) => {
  const { testCaseId, jiraIssueKey } = payload as {
    testCaseId: string;
    jiraIssueKey: string;
  };

  const { apiUrl, apiKey } = await getConfig();
  const url = `${apiUrl}/service/jira/links`;

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ testCaseId, jiraIssueKey }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Failed to link test case');
  }

  return await response.json();
});

/**
 * createTestCase — create a new test case and link it to the given Jira issue.
 * Payload: { name: string, projectId: number, jiraIssueKey: string }
 */
resolver.define('createTestCase', async ({ payload }) => {
  const { name, projectId, jiraIssueKey } = payload as {
    name: string;
    projectId: number;
    jiraIssueKey: string;
  };

  const { apiUrl, apiKey } = await getConfig();
  const url = `${apiUrl}/service/jira/test-cases`;

  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ name, projectId, jiraIssueKey }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Failed to create test case');
  }

  return await response.json();
});

/**
 * unlinkTestCase — remove a link between a test case and a Jira issue.
 * Payload: { linkId: number }
 */
resolver.define('unlinkTestCase', async ({ payload }) => {
  const { linkId } = payload as { linkId: number };

  const { apiUrl, apiKey } = await getConfig();
  const url = `${apiUrl}/service/jira/links/${linkId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(apiKey),
  });

  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || 'Failed to unlink test case');
  }

  return { success: true };
});

/**
 * getProjects — fetch the list of projects so the Custom UI can populate a dropdown.
 */
resolver.define('getProjects', async () => {
  const { apiUrl, apiKey } = await getConfig();
  const url = `${apiUrl}/service/projects`;

  const response = await fetch(url, {
    method: 'GET',
    headers: authHeaders(apiKey),
  });

  if (!response.ok) {
    console.error(`getProjects failed: ${response.status}`);
    return [];
  }

  return await response.json();
});

export const handler = resolver.getDefinitions();
