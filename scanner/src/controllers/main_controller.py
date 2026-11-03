from typing import List, Optional

from presenters.presenter import MachinePresenter
from usecases.machine_use_case import scan


class MainController:
    """Orchestre : entrée HTTP -> use case -> presenter, sans connaître Flask ni SQLite."""

    def scan_machines(self, targets: Optional[List[str]] = None) -> List[dict]:
        machines_data = scan( targets)
        return MachinePresenter.to_list(machines_data)