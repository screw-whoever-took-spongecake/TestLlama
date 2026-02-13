export interface TestCaseStep {
  actual: string;
  expected: string;
}

export interface TestCase {
  id: string;
  name: string;
  projectId: number;
  steps: TestCaseStep[];
}

export interface Project {
  id: number;
  name: string;
}

export interface ProjectWithCases {
  id: number;
  name: string;
  testCases: TestCase[];
}
