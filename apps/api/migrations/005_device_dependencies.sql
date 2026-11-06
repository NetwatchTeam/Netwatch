-- Graphe des dépendances (« la machine X est jointe via l'équipement Y »).
-- Les liens déduits par le collecteur arrivent en `suggested` ; seuls les liens
-- `validated` sont utilisés par la corrélation des pannes. Un lien `rejected` reste
-- enregistré pour ne pas être reproposé à chaque scan.

create table if not exists device_dependencies (
  id             text primary key,
  device_id      text not null references devices (id) on delete cascade,
  depends_on_id  text not null references devices (id) on delete cascade,
  source         text not null check (source in ('discovered', 'manual')),
  status         text not null check (status in ('suggested', 'validated', 'rejected')),
  created_at     timestamptz not null,
  updated_at     timestamptz not null,
  observed_at    timestamptz,
  check (device_id <> depends_on_id)
);

create unique index if not exists device_dependencies_pair_key on device_dependencies (device_id, depends_on_id);
create index if not exists device_dependencies_status_idx on device_dependencies (status);

-- Reprise : les passerelles déjà connues deviennent des suggestions, à valider.
insert into device_dependencies (id, device_id, depends_on_id, source, status, created_at, updated_at, observed_at)
select gen_random_uuid()::text, d.id, g.id, 'discovered', 'suggested', now(), now(), d.last_seen_at
  from devices d
  join devices g on g.ip = d.gateway_ip and g.id <> d.id
 where d.gateway_ip is not null
on conflict do nothing;
