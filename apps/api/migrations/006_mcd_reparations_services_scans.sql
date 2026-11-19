-- Traduction du MCD (docs/mcd.png, correspondance dans docs/modele-donnees.md). Migration purement
-- additive : aucune table ni colonne existante n'est modifiée, l'application fonctionne sans changement.
-- Les noms suivent la convention de la base (anglais) ; le nom du MCD est rappelé pour chaque table.
-- Les associations 1,1 deviennent une clé étrangère obligatoire, les 0,n / 0,n une table de liaison,
-- et les entités faibles (R) une clé primaire composée.

-- ---------------------------------------------------------------------------
-- Equipement : colonne ajoutée à `devices`
-- ---------------------------------------------------------------------------

-- est_identifie : calculée depuis `lifecycle`, donc toujours cohérente avec lui.
-- Une machine ignorée compte comme identifiée : un humain a tranché.
alter table devices
  add column if not exists is_identified boolean
  generated always as (lifecycle <> 'pending_classification') stored;

-- ---------------------------------------------------------------------------
-- Reparation + association « est en » (Equipement 0,n — Reparation 1,1)
-- ---------------------------------------------------------------------------

create table if not exists repairs (
  id              text primary key,                                         -- id_reparation
  device_id       text not null references devices (id) on delete cascade,  -- est en
  status          text not null default 'planned'                           -- etat_courant
                  check (status in ('planned', 'in_progress', 'finished', 'cancelled')),
  dropped_off_at  timestamptz not null,                                     -- date_deposee : peut être future (réparation prévue)
  finished_at     timestamptz,                                              -- date_rep_finie
  check (finished_at is null or finished_at >= dropped_off_at)
);

-- Historique des réparations d'un équipement, le plus récent d'abord.
create index if not exists repairs_device_idx on repairs (device_id, dropped_off_at desc);
-- Réparations encore ouvertes : celles que l'ingestion d'un scan aura à consulter.
create index if not exists repairs_open_idx on repairs (device_id) where status in ('planned', 'in_progress');

-- ---------------------------------------------------------------------------
-- Service + association « appartient » (Equipement 0,n — Service 1,1)
-- ---------------------------------------------------------------------------

create table if not exists services (
  id         text primary key,                                         -- id_service
  device_id  text not null references devices (id) on delete cascade, -- appartient
  name       text not null                                             -- nom
);

create index if not exists services_device_idx on services (device_id);

-- Port : entité faible de Service (« possede », 1,1 R). Le protocole fait partie de la clé :
-- un même numéro peut être ouvert en TCP et en UDP (DNS, port 53).
create table if not exists service_ports (
  service_id  text not null references services (id) on delete cascade,
  port        integer not null check (port between 0 and 65535),
  protocol    text not null check (protocol in ('tcp', 'udp')),  -- protocole
  primary key (service_id, port, protocol)
);

-- Certificat_TLS + association « a » (Service 0,n — Certificat_TLS 1,1)
create table if not exists tls_certificates (
  id                text primary key,                                          -- id_certificat
  service_id        text not null references services (id) on delete cascade,  -- a
  fingerprint       text,                                                      -- empreinte (absente du contrat du collecteur à ce jour)
  subject           text not null,                                             -- sujet
  issuer            text,                                                      -- emetteur
  valid_from        timestamptz,                                               -- debut_validite
  valid_until       timestamptz not null,                                      -- fin_validite
  observed_at       timestamptz not null,                                      -- date_observe
  is_valid          boolean,                                                   -- est_valide : nul si le collecteur n'a pas pu vérifier
  validation_error  text                                                       -- erreur_validation
);

create index if not exists tls_certificates_service_idx on tls_certificates (service_id);
create index if not exists tls_certificates_valid_until_idx on tls_certificates (valid_until);

-- ---------------------------------------------------------------------------
-- Incident + association « Liste_Incident » (Incident 0,n — Equipement 0,n, avec l'attribut role)
-- ---------------------------------------------------------------------------

create table if not exists incidents (
  id          text primary key,      -- id_incident
  type        text not null,         -- type
  severity    text not null check (severity in ('info', 'warning', 'critical')),  -- gravite
  started_at  timestamptz not null,  -- date_debut
  ended_at    timestamptz,           -- date_fin : nulle tant que l'incident dure
  description text,                  -- description
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists incidents_started_idx on incidents (started_at desc);

create table if not exists device_incidents (
  incident_id  text not null references incidents (id) on delete cascade,
  device_id    text not null references devices (id) on delete cascade,
  role         text not null,  -- role de la machine dans l'incident (ex. cause, impactée)
  primary key (incident_id, device_id)
);

create index if not exists device_incidents_device_idx on device_incidents (device_id);

-- ---------------------------------------------------------------------------
-- Scan_equipement + association « fait partie » (Equipement 0,n — Scan_equipement 1,1)
-- ---------------------------------------------------------------------------

create table if not exists device_scans (
  id                   text primary key,                                         -- id_scan
  device_id            text not null references devices (id) on delete cascade,  -- fait partie
  scanned_at           timestamptz not null,                                     -- date
  ip                   text,                                                     -- ip
  reachable            boolean not null,                                         -- joignable
  latency_ms           real,                                                     -- latence_ms
  packet_loss_percent  real check (packet_loss_percent between 0 and 100),       -- perte_paquets
  cpu_percent          real check (cpu_percent between 0 and 100),               -- usage_cpu
  memory_percent       real check (memory_percent between 0 and 100)             -- charge_memoire
);

create index if not exists device_scans_device_idx on device_scans (device_id, scanned_at desc);
create index if not exists device_scans_scanned_idx on device_scans (scanned_at);

-- Observation_Port : entité faible de Scan_equipement (« revele », 1,1 R).
create table if not exists device_scan_ports (
  scan_id   text not null references device_scans (id) on delete cascade,
  port      integer not null check (port between 0 and 65535),
  protocol  text not null check (protocol in ('tcp', 'udp')),  -- protocole
  primary key (scan_id, port, protocol)
);

-- Observation_Disque : entité faible de Scan_equipement (« mesure », 1,1 R), une ligne par disque.
create table if not exists device_scan_disks (
  scan_id       text not null references device_scans (id) on delete cascade,
  name          text not null,                                     -- nom
  used_percent  real not null check (used_percent between 0 and 100),  -- usage_pourcent
  capacity_gb   real,                                              -- capacite_go
  primary key (scan_id, name)
);
