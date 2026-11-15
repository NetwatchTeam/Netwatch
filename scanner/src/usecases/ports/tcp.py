"""Port (interface): TCP connection probe."""

from dataclasses import dataclass
from abc import ABC, abstractmethod


@dataclass(frozen=True)
class TcpProbeResult:
    """Outcome of one TCP connection attempt.

    Attributes:
        status: "open", "refused", "timeout" or "error".
        checked_at: ISO 8601 UTC timestamp of the attempt.
        duration_ms: Duration of the attempt in milliseconds.
        error: The failure message, or None if the port is open.
    """

    status: str
    checked_at: str
    duration_ms: float
    error: str | None = None


class TcpProber(ABC):
    """Tries TCP connections."""

    @abstractmethod
    def probe(self, ip: str, port: int, timeout: float) -> TcpProbeResult:
        """Tries a TCP connection. Network failures are returned, not raised."""
        ...
