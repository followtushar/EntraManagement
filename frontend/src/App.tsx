import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useIsAuthenticated } from '@azure/msal-react';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import CompliancePage from './pages/CompliancePage';
import ControlsPage from './pages/ControlsPage';
import FrameworksPage from './pages/FrameworksPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  const isAuthenticated = useIsAuthenticated();

  return (
    <div className="App">
      <AuthenticatedTemplate>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route path="/controls" element={<ControlsPage />} />
            <Route path="/frameworks" element={<FrameworksPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </AuthenticatedTemplate>

      <UnauthenticatedTemplate>
        <LoginPage />
      </UnauthenticatedTemplate>
    </div>
  );
}

export default App;