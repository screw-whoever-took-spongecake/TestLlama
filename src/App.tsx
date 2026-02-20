import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Home from './pages/Home';
import TestCases from './pages/TestCases';
import TestRuns from './pages/TestRuns';
import Results from './pages/Results';
import Settings from './pages/Settings';
import TestCaseForm from './pages/TestCaseForm';
import TestRunForm from './pages/TestRunForm';
import './App.css';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppLayout />}>
      <Route index element={<Home />} />
      <Route path="test-cases" element={<TestCases />} />
      <Route path="test-runs" element={<TestRuns />} />
      <Route path="results" element={<Results />} />
      <Route path="settings" element={<Settings />} />
      <Route path="service/testcase/:testCaseId" element={<TestCaseForm />} />
      <Route path="service/testrun/:testRunId" element={<TestRunForm />} />
    </Route>
  )
);

export default router;
