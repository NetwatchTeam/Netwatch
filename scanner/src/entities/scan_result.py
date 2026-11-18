"""Entité représentant le résultat d'un scan réseau."""

from dataclasses import dataclass, field
from datetime import datetime

from entities.machine import Machine
from entities.throughput import Throughput


@dataclass
class ScanResult:
    """Représente les résultats d'un scan réseau.

    Attributes:
        scanned_at: Horodatage de réalisation du scan.
        machines: Machines ou équipements scannés.
        throughput: Mesures de débit entre les nœuds.
    """

    scanned_at: datetime
    machines: list[Machine] = field(default_factory=list)
    throughput: list[Throughput] = field(default_factory=list)
