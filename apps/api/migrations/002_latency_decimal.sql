-- Le scanner mesure la latence au dixième de milliseconde (ex. 3.2) :
-- une colonne entière rejetait tout le scan.
alter table devices alter column latency_ms type real;
