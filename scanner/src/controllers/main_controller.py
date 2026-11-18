"""Contrôleur orchestrant les requêtes HTTP, les cas d'usage et les présentateurs."""

from presenters.snapshot_presenter import SnapshotPresenter
from usecases.check_expected_services import CheckExpectedServices
from usecases.machine_use_case import ScanMachines


class MainController:
    """Orchestre l'entrée HTTP, le cas d'usage et le présentateur, sans dépendre de Flask ni de SQLite."""

    def __init__(
        self,
        scan_machines: ScanMachines,
        check_expected_services: CheckExpectedServices,
    ) -> None:
        """Initialise le contrôleur.

        Args:
            scan_machines: Cas d'usage de scan complet des machines.
            check_expected_services: Cas d'usage de contrôle des services
                TCP attendus.
        """
        self._scan_machines = scan_machines
        self._check_expected_services = check_expected_services

    def scan_machines(self, targets: list[str] | None = None) -> dict:
        """Lance un scan réseau et formate le résultat pour l'API.

        Args:
            targets: Adresses IP, noms d'hôte ou plages CIDR à scanner. Si
                omis, la valeur par défaut du cas d'usage est utilisée.

        Returns:
            Un dictionnaire d'instantané formaté selon le contrat de l'API.

        Raises:
            RuntimeError: Si le scan réseau sous-jacent échoue.
        """
        machines_data = self._scan_machines.execute(targets)
        return SnapshotPresenter.to_snapshot(machines_data)

    def check_tcp_services(self) -> list[dict]:
        """Contrôle les services TCP configurés, sans lancer Nmap.

        Returns:
            Une liste de résultats de contrôle TCP, un par service configuré.

        Raises:
            ValueError: Si la configuration des services TCP est invalide.
        """
        return self._check_expected_services.execute()
