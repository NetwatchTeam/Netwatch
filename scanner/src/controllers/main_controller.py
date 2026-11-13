"""Controller layer: glue between the HTTP API and the use cases."""

from typing import List, Optional

from presenters.presenter import MachinePresenter
from usecases.machine_use_case import scan


class MainController:
    """Orchestrates the flow: HTTP input -> use case -> presenter.

    The controller knows neither Flask nor SQLite, which keeps it easy to
    test and independent from the delivery mechanism.
    """

    def scan_machines(self, targets: Optional[List[str]] = None) -> List[dict]:
        """Runs a network scan and formats the result for the API.

        Args:
            targets: IP addresses, hostnames or CIDR ranges to scan. If
                omitted, the use case default is used.

        Returns:
            A list of dictionaries, one per discovered machine, ready to be
            serialized to JSON.

        Raises:
            RuntimeError: If the underlying network scan fails.
        """
        machines_data = scan(targets)
        return MachinePresenter.to_list(machines_data)
