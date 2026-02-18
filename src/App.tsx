import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import DashboardContent from './components/DashboardContent';
import TestCaseForm from './pages/TestCaseForm';
import TestRunForm from './pages/TestRunForm';
import './App.css';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppLayout />}>
      <Route index element={<DashboardContent />} />
      <Route path="service/testcase/:testCaseId" element={<TestCaseForm />} />
      <Route path="service/testrun/:testRunId" element={<TestRunForm />} />
    </Route>
  )
);

export default router;
