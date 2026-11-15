from dataclasses import dataclass


@dataclass
class Memory:
    """Represents memory usage statistics.

    Attributes:
        percentage_used: The percentage of memory currently in use.
        total_mb: Total memory capacity in megabytes.
    """

    percentage_used: float
    total_mb: float
