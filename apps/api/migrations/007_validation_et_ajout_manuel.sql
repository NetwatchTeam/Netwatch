-- Cycle de validation humaine des équipements découverts (#31) et ajout manuel au référentiel (#32).
-- Correspondance avec le MCD : docs/modele-donnees.md.

-- Cycle de vie : « exclure » s'ajoute à valider (active) et ignorer (ignored).
-- Les valeurs existantes sont toutes valides : la contrainte ne fait que les figer.
alter table devices drop constraint if exists devices_lifecycle_check;
alter table devices
  add constraint devices_lifecycle_check
  check (lifecycle in ('pending_classification', 'active', 'ignored', 'excluded'));

-- Origine : découvert par le collecteur, ou ajouté à la main (provenance)
alter table devices
  add column if not exists origin text not null default 'discovered'
  check (origin in ('discovered', 'manual'));

-- Un équipement ajouté à la main n'a encore jamais répondu au collecteur.
alter table devices alter column last_seen_at drop not null;

-- Un ajout manuel ne doit pas dédoubler un équipement connu : recherche par IP et par MAC.
create index if not exists devices_ip_idx on devices (ip);
create index if not exists devices_mac_idx on devices (lower(mac)) where mac is not null;

-- Decision + association « concerne » (Equipement 0,n — Decision 1,1) : qui a fait quoi, et quand.
create table if not exists device_decisions (
  id                  text primary key,                                         -- id_decision
  device_id           text not null references devices (id) on delete cascade,  -- concerne
  action              text not null                                             -- action
                      check (action in ('created', 'merged', 'validated', 'ignored', 'excluded', 'updated')),
  author              text not null check (length(trim(author)) > 0),           -- auteur
  decided_at          timestamptz not null,                                     -- date_decision
  previous_lifecycle  text,                                                     -- etat_avant : nul pour une création
  lifecycle           text not null,                                            -- etat_apres
  kind                text not null,                                            -- role
  label               text,                                                     -- nom
  critical            boolean not null                                          -- critique
);

create index if not exists device_decisions_device_idx on device_decisions (device_id, decided_at desc);
