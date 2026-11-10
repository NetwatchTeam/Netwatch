from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

from entities.certificat import Certificat


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Machine:
    ip: str
    id: Optional[int] = None
    mac: Optional[str] = None
    first_seen: str = field(default_factory=_now_iso)
    last_seen: str = field(default_factory=_now_iso)
    open_ports: List[int] = field(default_factory=list)
    certificat: Optional[Certificat] = None
