"""Entité représentant les métriques système d'une machine."""

from dataclasses import dataclass, field

from entities.disk import Disk
from entities.memory import Memory


@dataclass
class SystemMetrics:
    """Représente les métriques système collectées sur une machine.

    Attributes:
        cpu_percent: Utilisation du processeur en pourcentage (0-100), ou
            None si indisponible.
        memory: Utilisation de la mémoire, ou None si indisponible.
        disks: Utilisation de chaque disque monté.
    """

    cpu_percent: float | None = None
    memory: Memory | None = None
    disks: list[Disk] = field(default_factory=list)
