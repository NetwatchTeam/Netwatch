"""Entité représentant une machine découverte sur le réseau."""

from dataclasses import dataclass, field

from entities.certificate import TLSCertificate
from entities.service import Service


@dataclass
class Machine:
    """Représente une machine ou un équipement réseau scanné.

    Attributes:
        ip: Adresse IP de la machine.
        hostname: Nom d'hôte optionnel (repli sur l'IP quand nmap n'en
            trouve aucun).
        id: Identifiant en base de données, ou None si la machine n'est pas
            persistée.
        mac: Adresse MAC, ou None si elle n'a pas pu être déterminée (par
            exemple en scannant localhost ou un sous-réseau distant).
        vendor: Nom optionnel du fabricant du matériel.
        gateway: Adresse IP optionnelle de la passerelle.
        ports: Détails des ports et services découverts sur la machine.
        open_ports: Numéros des ports ouverts.
        services: Services en cours d'exécution découverts sur la machine.
        certificates: Certificats TLS découverts sur la machine.
        cpuPercent: Utilisation du processeur en pourcentage (0-100), ou
            None si indisponible.
        memory: Dictionnaire avec usedPercent et totalMb, ou None si
            indisponible.
        disks: Dictionnaires d'utilisation des disques (name, usedPercent,
            totalGb).
    """

    ip: str
    hostname: str | None = None
    id: int | None = None
    mac: str | None = None
    vendor: str | None = None
    gateway: str | None = None
    ports: list[dict] = field(default_factory=list)
    open_ports: list[int] = field(default_factory=list)
    services: list[Service] = field(default_factory=list)
    certificates: list[TLSCertificate | dict] = field(default_factory=list)
    cpuPercent: float | None = None
    memory: dict | None = None
    disks: list[dict] = field(default_factory=list)
