from dataclasses import dataclass


@dataclass
class TcpCheck:
    """Represents the outcome of a single TCP connection attempt.

    Attributes:
        ip: The probed IP address.
        port: The probed TCP port.
        status: "open", "refused", "timeout" or "error".
        checked_at: ISO 8601 UTC timestamp of the attempt.
        duration_ms: Duration of the attempt in milliseconds.
        error: Failure message, or None if the port is open.
    """

    ip: str
    port: int
    status: str
    checked_at: str
    duration_ms: float
    error: str | None = None

    @property
    def reachable(self) -> bool:
        """True if the port accepted the connection."""
        return self.status == "open"
