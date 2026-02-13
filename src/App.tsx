import type { ReactElement } from 'react';
import { Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import DashboardContent from './components/DashboardContent';
import TestCaseForm from './pages/TestCaseForm';
import './App.css';

function App(): ReactElement {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardContent />} />
        <Route path="service/testcase/:testCaseId" element={<TestCaseForm />} />
      </Route>
    </Routes>
  );
}

export default App;
