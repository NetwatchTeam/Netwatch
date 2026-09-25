from typing import List, Optional
from dataclasses import asdict

from usecases.interfaces.repository_interface import RepositoryInterface
from usecases.scan_network import scan_network


def get_all_machines(repo: RepositoryInterface) -> List[dict]:
    """Récupère les entités et les franchit la limite sous forme de dictionnaires."""
    return [asdict(machine) for machine in repo.get_all()]

def get_machine(repo: RepositoryInterface, ip: str) -> Optional[dict]:
    """Encapsule la logique de récupération d'une machine spécifique."""
    machine = repo.get_by_ip(ip)
    return asdict(machine) if machine else None

def scan_and_save(repo: RepositoryInterface, targets: Optional[List[str]] = None) -> List[dict]:
    """Lance le scan réseau, persiste, et retourne des données simples."""
    discovered = scan_network(targets)
    saved_machines = [repo.save(machine) for machine in discovered]
    return [asdict(machine) for machine in saved_machines]