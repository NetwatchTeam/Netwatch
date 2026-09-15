from dataclasses import dataclass


@dataclass
class Machine:
    id: int
    ip: str
    mac: str
    first_seen: str
    last_seen: str