"""Controller orchestrating HTTP requests, use cases, and presenters."""

from typing import Any

from presenters.scan_presenter import ScanPresenter
from usecases.machine_use_case import scan


class MainController:
    """Orchestrates HTTP input -> use case -> presenter, decoupled from Flask or SQLite."""

    def scan_machines(self, targets: list[str] | None = None) -> dict[str, Any]:
        """Triggers a network scan for the given targets and formats the output.

        Args:
            targets: Optional list of target IPs, hostnames, or CIDR ranges.

        Returns:
            A dictionary formatted according to the API contract.
        """
        return ScanPresenter.present(scan(targets))
