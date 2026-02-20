export interface StepAttachment {
  id: string;
  filename: string;
  mimeType: 'image/png' | 'image/jpeg';
  url: string;
}

export interface TestCaseStep {
  id?: number;
  position: number;
  stepDescription: string;
  expectedResults: string;
  attachments: StepAttachment[];
}

export interface TestCase {
  id: string;
  name: string;
  projectId: number;
  folderId?: number | null;
  folderName?: string | null;
  jiraIssueKeys?: string[];
  steps?: TestCaseStep[];
}

export interface Project {
  id: number;
  name: string;
  testCaseCount?: number;
}

export interface TestCaseFolder {
  id: number;
  name: string;
  projectId: number;
}

export interface JiraLink {
  id: number;
  testCaseId: string;
  jiraIssueKey: string;
  createdAt: string;
  testCaseName?: string;
  projectId?: number;
}
