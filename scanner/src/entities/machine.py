from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Machine:
    """Représente un équipement découvert sur le réseau."""
    ip: str
    id: Optional[int] = None
    mac: Optional[str] = None
    first_seen: str = field(default_factory=_now_iso)
    last_seen: str = field(default_factory=_now_iso)
    open_ports: List[int] = field(default_factory=list)
    certificates: list[dict] = field(default_factory=list)
