-- Schéma initial NetWatch.

create table if not exists devices (
  id              text primary key,
  ip              text not null,
  mac             text,
  hostname        text,
  vendor          text,
  kind            text not null default 'unknown',
  label           text,
  critical        boolean not null default false,
  lifecycle       text not null default 'pending_classification',
  reachability    text not null default 'unknown',
  latency_ms      integer,
  open_ports      integer[] not null default '{}',
  certificates    jsonb not null default '[]'::jsonb,
  first_seen_at   timestamptz not null,
  last_seen_at    timestamptz not null,
  last_change_at  timestamptz not null,
  missed_scans    integer not null default 0
);

create unique index if not exists devices_mac_key on devices (lower(mac)) where mac is not null;
create index if not exists devices_ip_idx on devices (ip);
create index if not exists devices_lifecycle_idx on devices (lifecycle);

create table if not exists monitoring_events (
  id              text primary key,
  device_id       text not null references devices (id) on delete cascade,
  peer_device_id  text references devices (id) on delete set null,
  type            text not null,
  category        text not null,
  severity        text not null,
  status          text not null,
  summary         text not null,
  details         jsonb not null default '{}'::jsonb,
  dedupe_key      text not null,
  started_at      timestamptz not null,
  resolved_at     timestamptz,
  acknowledged_at timestamptz
);

-- Un seul événement ouvert par équipement et par cause : c'est cette contrainte
-- qui empêche de recréer la même alerte à chaque scan.
create unique index if not exists monitoring_events_open_key
  on monitoring_events (device_id, dedupe_key)
  where status <> 'resolved';

create index if not exists monitoring_events_status_idx on monitoring_events (status);
create index if not exists monitoring_events_started_idx on monitoring_events (started_at desc);
create index if not exists monitoring_events_type_window_idx on monitoring_events (type, started_at, resolved_at);

create table if not exists throughput_samples (
  id                text primary key,
  source_device_id  text not null references devices (id) on delete cascade,
  target_device_id  text references devices (id) on delete cascade,
  mbps              double precision not null,
  measured_at       timestamptz not null
);

create index if not exists throughput_samples_path_idx
  on throughput_samples (source_device_id, target_device_id, measured_at desc);
create index if not exists throughput_samples_measured_idx on throughput_samples (measured_at desc);

create table if not exists scan_runs (
  id            text primary key,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null,
  devices_seen  integer not null default 0,
  events_raised integer not null default 0,
  error         text
);

create index if not exists scan_runs_started_idx on scan_runs (started_at desc);

-- Réglages de supervision : une seule ligne, modifiable depuis l'interface.
create table if not exists monitoring_settings (
  id         integer primary key default 1 check (id = 1),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
