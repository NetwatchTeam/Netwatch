import type {
  ClassifyDeviceInput,
  CreateDependencyInput,
  DeleteDependencyResultDto,
  DependencyDto,
  DependencyGraphDto,
  UpdateDependencyInput,
  ValidateSuggestionsResultDto,
  DeviceDto,
  DeviceLinkDto,
  DeviceFilters,
  EventDto,
  EventFilters,
  MonitoringSettingsDto,
  NetworkSummaryDto,
  ScanRunDto,
  ThroughputPointDto,
  UpdateMonitoringSettingsInput,
  WeeklyReportDto,
} from '@netwatch/contracts';
import { config } from '../config';
import { request, toQuery } from './client';

export interface DeviceDetail {
  device: DeviceDto;
  /** Machines qui passent par cet équipement (vide s'il n'est la passerelle de personne). */
  dependents: DeviceLinkDto[];
  events: EventDto[];
}

/** Toutes les routes de l'API, en un seul endroit. */
export const api = {
  getSummary: () => request<NetworkSummaryDto>('/summary'),
  getWeeklyReport: (week?: string) => request<WeeklyReportDto>(`/reports/weekly${toQuery({ week })}`),
  /** Lien direct : le navigateur télécharge le fichier lui-même. */
  weeklyReportPdfUrl: (week?: string) => `${config.apiBaseUrl}/reports/weekly.pdf${toQuery({ week })}`,
  getThroughput: (params: { from?: string; to?: string; deviceId?: string } = {}) =>
    request<ThroughputPointDto[]>(`/metrics/throughput${toQuery(params)}`),

  getDevices: (filters: DeviceFilters = {}) => request<DeviceDto[]>(`/devices${toQuery({ ...filters })}`),
  getDevice: (id: string) => request<DeviceDetail>(`/devices/${encodeURIComponent(id)}`),
  classifyDevice: (id: string, input: ClassifyDeviceInput) =>
    request<DeviceDto>(`/devices/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  getDependencies: () => request<DependencyGraphDto>('/dependencies'),
  createDependency: (input: CreateDependencyInput) =>
    request<DependencyDto>('/dependencies', { method: 'POST', body: JSON.stringify(input) }),
  updateDependency: (id: string, input: UpdateDependencyInput) =>
    request<DependencyDto>(`/dependencies/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteDependency: (id: string) =>
    request<DeleteDependencyResultDto>(`/dependencies/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  validateAllSuggestions: () =>
    request<ValidateSuggestionsResultDto>('/dependencies/validate-suggestions', { method: 'POST' }),

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
