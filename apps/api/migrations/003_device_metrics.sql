-- Données enrichies remontées par le scanner pour chaque machine :
-- perte de paquets, charge CPU, mémoire, disques, et services associés aux ports.

alter table devices add column if not exists packet_loss_percent real;
alter table devices add column if not exists cpu_percent         real;
alter table devices add column if not exists memory              jsonb;
alter table devices add column if not exists disks               jsonb not null default '[]'::jsonb;
alter table devices add column if not exists ports               jsonb not null default '[]'::jsonb;

-- Les ports déjà connus sont repris en TCP, sans service identifié :
-- le prochain scan les complétera.
update devices
   set ports = coalesce(
     (select jsonb_agg(jsonb_build_object('port', p, 'protocol', 'tcp', 'services', '[]'::jsonb) order by p)
        from unnest(open_ports) as p),
     '[]'::jsonb
   );

alter table devices drop column open_ports;
