import { BrowserRouter, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { DependenciesPage } from './pages/DependenciesPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { DevicesPage } from './pages/DevicesPage';
import { EventsPage } from './pages/EventsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OverviewPage } from './pages/OverviewPage';
import { PendingDevicesPage } from './pages/PendingDevicesPage';
import { ScansPage } from './pages/ScansPage';
import { SettingsPage } from './pages/SettingsPage';
import { WeeklyReportPage } from './pages/WeeklyReportPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="rapport" element={<WeeklyReportPage />} />
          <Route path="technique">
            <Route path="equipements" element={<DevicesPage />} />
            <Route path="equipements/:id" element={<DeviceDetailPage />} />
            <Route path="evenements" element={<EventsPage />} />
            <Route path="a-identifier" element={<PendingDevicesPage />} />
            <Route path="dependances" element={<DependenciesPage />} />
            <Route path="scans" element={<ScansPage />} />
            <Route path="reglages" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
