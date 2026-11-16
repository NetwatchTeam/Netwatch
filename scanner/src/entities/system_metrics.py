from dataclasses import dataclass, field

from entities.disk import Disk
from entities.memory import Memory


@dataclass
class SystemMetrics:
    """Represents the system metrics collected on a machine.

    Attributes:
        cpu_percent: CPU usage percentage (0-100), or None if unavailable.
        memory: Memory usage, or None if unavailable.
        disks: Usage of each mounted disk.
    """

    cpu_percent: float | None = None
    memory: Memory | None = None
    disks: list[Disk] = field(default_factory=list)
