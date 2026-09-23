from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Machine:
    ip: str
    id: Optional[int] = None
    mac: Optional[str] = None
    first_seen: str = field(default_factory=_now_iso)
    last_seen: str = field(default_factory=_now_iso)