from typing import List, Optional

from presenters.presenter import MachinePresenter
from usecases.interfaces.repository_interface import RepositoryInterface
from usecases.machine_use_case import get_all_machines, get_machine, scan_and_save


class MainController:
    """Orchestre : entrée HTTP -> use case -> presenter, sans connaître Flask ni SQLite."""

    def __init__(self, repo: RepositoryInterface):
        self.repo = repo

    def list_machines(self) -> List[dict]:
        machines_data = get_all_machines(self.repo)
        return MachinePresenter.to_list(machines_data)

    def get_machine(self, ip: str) -> Optional[dict]:
        machine_data = get_machine(self.repo, ip)
        return MachinePresenter.to_dict(machine_data) if machine_data else None

    def scan_machines(self, targets: Optional[List[str]] = None) -> List[dict]:
        machines_data = scan_and_save(self.repo, targets)
        return MachinePresenter.to_list(machines_data)