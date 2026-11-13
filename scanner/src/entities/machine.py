"""Business entities of the scanner."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def _now_iso() -> str:
    """Returns the current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Machine:
    """A machine discovered on the network.

    Attributes:
        ip: IP address of the machine.
        id: Database identifier, or None if the machine is not persisted.
        mac: MAC address, or None if it could not be determined (for example
            when scanning localhost or a remote subnet).
        first_seen: ISO 8601 UTC timestamp of the first detection.
        last_seen: ISO 8601 UTC timestamp of the most recent detection.
    """

    ip: str
    id: Optional[int] = None
    mac: Optional[str] = None
    first_seen: str = field(default_factory=_now_iso)
    last_seen: str = field(default_factory=_now_iso)
