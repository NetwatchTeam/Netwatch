from dataclasses import dataclass, field
from datetime import datetime

from entities.machine import Machine
from entities.throughput import Throughput


@dataclass
class ScanResult:
    """Represents the results of a network scan.

    Attributes:
        scanned_at: The timestamp when the scan was performed.
        machines: List of scanned machines/devices.
        throughput: List of throughput measurements between nodes.
    """

    scanned_at: datetime
    machines: list[Machine] = field(default_factory=list)
    throughput: list[Throughput] = field(default_factory=list)
