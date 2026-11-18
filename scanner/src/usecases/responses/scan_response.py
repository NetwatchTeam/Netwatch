"""Données de sortie des cas d'usage de scan.

Ces modèles sont définis par la couche des cas d'usage et consommés par les
présentateurs. Ils ne portent que des données simples : les présentateurs ne
voient jamais les entités du domaine.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ThroughputResponse:
    """Une mesure de débit entre deux extrémités.

    Attributes:
        source_ip: Adresse IP source.
        target_ip: Adresse IP cible.
        mbps: Débit en mégabits par seconde.
    """

    source_ip: str
    target_ip: str
    mbps: float


@dataclass(frozen=True)
class ScanResponse:
    """Le résultat d'un scan réseau, transmis au présentateur.

    Attributes:
        scanned_at: Horodatage de réalisation du scan.
        machines: Machines scannées, sous forme de dictionnaires de données brutes.
        throughput: Mesures de débit entre les nœuds.
    """

    scanned_at: datetime
    machines: list[dict] = field(default_factory=list)
    throughput: list[ThroughputResponse] = field(default_factory=list)
