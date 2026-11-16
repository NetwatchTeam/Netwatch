"""Controller orchestrating HTTP requests, use cases, and presenters."""

from presenters.snapshot_presenter import SnapshotPresenter
from usecases.check_expected_services import CheckExpectedServices
from usecases.machine_use_case import ScanMachines


class MainController:
    """Orchestrates HTTP input -> use case -> presenter, decoupled from Flask or SQLite."""

    def __init__(
        self,
        scan_machines: ScanMachines,
        check_expected_services: CheckExpectedServices,
    ) -> None:
        self._scan_machines = scan_machines
        self._check_expected_services = check_expected_services

    def scan_machines(self, targets: list[str] | None = None) -> dict:
        """Runs a network scan and formats the result for the API.

        Args:
            targets: IP addresses, hostnames or CIDR ranges to scan. If
                omitted, the use case default is used.

        Returns:
            A snapshot dictionary formatted according to the API contract.

        Raises:
            RuntimeError: If the underlying network scan fails.
        """
        machines_data = self._scan_machines.execute(targets)
        return SnapshotPresenter.to_snapshot(machines_data)

    def check_tcp_services(self) -> list[dict]:
        """Contrôle les services configurés, sans lancer Nmap."""
        return self._check_expected_services.execute()
