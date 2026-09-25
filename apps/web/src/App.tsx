import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DevicesPage } from './pages/DevicesPage';
import { EventsPage } from './pages/EventsPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { PendingDevicesPage } from './pages/PendingDevicesPage';
import { ScansPage } from './pages/ScansPage';
import { SettingsPage } from './pages/SettingsPage';
import { WeeklyReportPage } from './pages/WeeklyReportPage';

/** Tant que la session n'est pas établie, rien d'autre que l'écran de connexion n'est rendu. */
function AuthenticatedApp() {
  const { user, checking } = useAuth();

  if (checking) return <p className="boot">Chargement…</p>;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="rapport" element={<WeeklyReportPage />} />
        <Route path="technique">
          <Route path="equipements" element={<DevicesPage />} />
          <Route path="equipements/:id" element={<DeviceDetailPage />} />
          <Route path="evenements" element={<EventsPage />} />
          <Route path="a-identifier" element={<PendingDevicesPage />} />
          <Route path="scans" element={<ScansPage />} />
          <Route path="reglages" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
