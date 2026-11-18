"""Point d'entrée du service scanner Netwatch.

Ce module est la racine de composition : c'est le seul endroit où les
adaptateurs sont instanciés puis injectés dans les cas d'usage.

    bibliothèque externe -> adaptateur -> cas d'usage -> entités
"""
import os

from flask.cli import load_dotenv

from adapters.icmp_adapter import Ping3IcmpProber
from adapters.nmap_adapter import NmapScanner
from adapters.ssh_adapter import ParamikoMetricsFetcher
from adapters.tcp_adapter import SocketTcpProber
from adapters.tls_adapter import SslTlsCertificateReader
from api.api_resource import create_app
from controllers.main_controller import MainController
from usecases.check_availability import CheckAvailability
from usecases.check_expected_services import CheckExpectedServices
from usecases.check_tcp_service import CheckTcpService
from usecases.check_tls_use_case import CheckMachineTls
from usecases.collect_system_metrics import CollectSystemMetrics
from usecases.machine_use_case import ScanMachines
from usecases.scan_network import ScanNetwork


def build_controller() -> MainController:
    """Assemble les adaptateurs, les cas d'usage et le contrôleur.

    Returns:
        Un MainController prêt à traiter les requêtes.
    """
    check_tcp_service = CheckTcpService(SocketTcpProber())

    scan_machines = ScanMachines(
        scan_network=ScanNetwork(NmapScanner()),
        check_availability=CheckAvailability(Ping3IcmpProber()),
        check_tcp_service=check_tcp_service,
        check_tls=CheckMachineTls(SslTlsCertificateReader()),
        collect_system_metrics=CollectSystemMetrics(ParamikoMetricsFetcher()),
    )

    return MainController(
        scan_machines=scan_machines,
        check_expected_services=CheckExpectedServices(check_tcp_service),
    )


def main() -> None:
    """Construit le contrôleur, crée l'application Flask et lance le serveur de développement."""
    load_dotenv()
    app = create_app(build_controller())
    # 0.0.0.0 : dans Docker, l'API doit pouvoir joindre le scanner depuis un autre conteneur.
    app.run(
        host=os.getenv("SCANNER_HOST", "127.0.0.1"),
        port=int(os.getenv("SCANNER_PORT", "5000")),
        debug=os.getenv("SCANNER_DEBUG", "").lower() in ("1", "true"),
    )


if __name__ == "__main__":
    main()
