import type { StepAttachment } from './testCase';

export type TestRunStatus = 'ready_to_test' | 'passed' | 'failed' | 'na';

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
  steps?: TestRunStep[];
}

export interface ProjectWithRuns {
  id: number | null;
  name: string;
  testRuns: TestRun[];
}
