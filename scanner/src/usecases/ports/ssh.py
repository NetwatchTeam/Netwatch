"""Port (interface): collection of system metrics on a remote machine."""

from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class RemoteMemory:
    """Memory usage reported by a remote machine."""

    used_percent: float
    total_mb: float


@dataclass(frozen=True)
class RemoteDisk:
    """Usage of one mounted disk reported by a remote machine."""

    mountpoint: str
    used_percent: float
    total_gb: float


@dataclass(frozen=True)
class RemoteMetrics:
    """System metrics reported by a remote machine.

    Attributes:
        cpu_percent: CPU usage (0-100), or None if unreadable.
        memory: Memory usage, or None if unreadable.
        disks: Usage of each mounted disk.
    """

    cpu_percent: float | None = None
    memory: RemoteMemory | None = None
    disks: tuple[RemoteDisk, ...] = ()


class SystemMetricsFetcher(ABC):
    """Collects CPU, memory and disk metrics on a remote machine."""

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
        """Collects the metrics.

        Raises:
            RuntimeError: If the connection, a command or its parsing fails.
        """
        ...
