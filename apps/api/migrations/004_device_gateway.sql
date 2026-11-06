-- Topologie : passerelle par laquelle chaque machine est jointe.
-- Permet de distinguer une machine en panne (`down`) d'une machine coupée
-- par la panne de sa passerelle (`unreachable`, nouvelle valeur de `reachability`).
alter table devices add column if not exists gateway_ip text;
create index if not exists devices_gateway_ip_idx on devices (gateway_ip) where gateway_ip is not null;
