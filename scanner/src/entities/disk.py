from dataclasses import dataclass


@dataclass
class Disk:
    """Represents storage disk usage.

    Attributes:
        name: The name or identifier of the disk.
        percentage_used: The percentage of disk space currently in use.
        total_gb: Total disk capacity in gigabytes.
    """

    name: str
    percentage_used: float
    total_gb: float
