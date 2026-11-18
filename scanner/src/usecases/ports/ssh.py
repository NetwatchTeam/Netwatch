"""Port (interface) : collecte des métriques système sur une machine distante."""

from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class RemoteMemory:
    """Utilisation de la mémoire signalée par une machine distante.

    Attributes:
        used_percent: Pourcentage de mémoire utilisé.
        total_mb: Mémoire totale en mégaoctets.
    """

    used_percent: float
    total_mb: float


@dataclass(frozen=True)
class RemoteDisk:
    """Utilisation d'un disque monté signalée par une machine distante.

    Attributes:
        mountpoint: Point de montage du disque.
        used_percent: Pourcentage d'espace utilisé.
        total_gb: Capacité totale en gigaoctets.
    """

    mountpoint: str
    used_percent: float
    total_gb: float


@dataclass(frozen=True)
class RemoteMetrics:
    """Métriques système signalées par une machine distante.

    Attributes:
        cpu_percent: Utilisation du processeur (0-100), ou None si illisible.
        memory: Utilisation de la mémoire, ou None si illisible.
        disks: Utilisation de chaque disque monté.
    """

    cpu_percent: float | None = None
    memory: RemoteMemory | None = None
    disks: tuple[RemoteDisk, ...] = ()


class SystemMetricsFetcher(ABC):
    """Collecte les métriques de processeur, mémoire et disques d'une machine distante."""

    @abstractmethod
    def fetch(
        self,
        ip: str,
        username: str,
        password: str | None,
        key_filename: str | None,
        port: int,
        timeout: float,
    ) -> RemoteMetrics:
        """Collecte les métriques.

        Args:
            ip: Adresse IP de la machine cible.
            username: Nom d'utilisateur de connexion.
            password: Mot de passe, ou None.
            key_filename: Chemin du fichier de clé privée, ou None.
            port: Port de connexion.
            timeout: Délai d'attente réseau et des commandes, en secondes.

        Returns:
            Les métriques collectées.

        Raises:
            RuntimeError: Si la connexion, une commande ou son analyse échoue.
        """
        ...
