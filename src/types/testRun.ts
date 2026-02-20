import type { StepAttachment } from './testCase';

export type TestRunStatus = 'ready_to_test' | 'in_progress' | 'passed' | 'failed' | 'na';

export type StepStatus = 'not_run' | 'passed' | 'failed' | 'na' | 'passed_with_improvements';

export function isLockedStatus(status: TestRunStatus): boolean {
  return status === 'passed' || status === 'failed';
}

export interface TestRunStep {
  id: number;
  position: number;
  stepDescription: string;
  expectedResults: string;
  attachments: StepAttachment[];
  actualResults: string;
  actualResultAttachments: StepAttachment[];
  checked: boolean;
  stepStatus: StepStatus;
}

export interface TestRun {
  id: number;
  name: string;
  status: TestRunStatus;
  projectId: number | null;
  projectName: string | null;
  sourceTestCaseId: number | null;
  sourceTestCaseName: string;
  createdAt: string;
  updatedAt: string;
  folderId?: number | null;
  folderName?: string | null;
  steps?: TestRunStep[];
}

export interface TestRunFolder {
  id: number;
  name: string;
  projectId: number;
}

export interface TestRunJiraLink {
  id: number;
  testRunId: string;
  jiraIssueKey: string;
  createdAt: string;
}
