from typing import List, Optional
from dataclasses import asdict

from usecases.scan_network import scan_network


def scan(targets: Optional[List[str]] = None) -> List[dict]:
    """Lance le scan réseau, persiste, et retourne des données simples."""
    discovered = scan_network(targets)
    return [asdict(machine) for machine in discovered]