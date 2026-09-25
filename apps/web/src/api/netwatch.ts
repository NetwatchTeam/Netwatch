import type {
  ClassifyDeviceInput,
  DeviceDto,
  DeviceFilters,
  EventDto,
  EventFilters,
  MonitoringSettingsDto,
  NetworkSummaryDto,
  ScanRunDto,
  SessionUserDto,
  ThroughputPointDto,
  UpdateMonitoringSettingsInput,
  WeeklyReportDto,
} from '@netwatch/contracts';
import { request, toQuery } from './client';

export interface DeviceDetail {
  device: DeviceDto;
  events: EventDto[];
}

/** Toutes les routes de l'API, en un seul endroit. */
export const api = {
  login: (password: string) =>
    request<SessionUserDto>('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<SessionUserDto>('/auth/me'),

  getSummary: () => request<NetworkSummaryDto>('/summary'),
  getWeeklyReport: (week?: string) => request<WeeklyReportDto>(`/reports/weekly${toQuery({ week })}`),
  getThroughput: (params: { from?: string; to?: string; deviceId?: string } = {}) =>
    request<ThroughputPointDto[]>(`/metrics/throughput${toQuery(params)}`),

  getDevices: (filters: DeviceFilters = {}) => request<DeviceDto[]>(`/devices${toQuery({ ...filters })}`),
  getDevice: (id: string) => request<DeviceDetail>(`/devices/${encodeURIComponent(id)}`),
  classifyDevice: (id: string, input: ClassifyDeviceInput) =>
    request<DeviceDto>(`/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  getEvents: (filters: EventFilters = {}) => request<EventDto[]>(`/events${toQuery({ ...filters })}`),
  acknowledgeEvent: (id: string) =>
    request<EventDto>(`/events/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),
  releaseEvent: (id: string) =>
    request<EventDto>(`/events/${encodeURIComponent(id)}/acknowledge`, { method: 'DELETE' }),

  getScans: () => request<ScanRunDto[]>('/scans'),
  runScan: () => request<ScanRunDto>('/scans/run', { method: 'POST' }),

  getSettings: () => request<MonitoringSettingsDto>('/settings'),
  updateSettings: (patch: UpdateMonitoringSettingsInput) =>
    request<MonitoringSettingsDto>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
};
