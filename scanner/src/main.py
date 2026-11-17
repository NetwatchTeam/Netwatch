"""Application entry point for the Netwatch scanner service.

This is the composition root: the only place where the adapters are
instantiated and injected into the use cases.

    external lib -> adapter -> use case -> entities
"""
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
    """Wires the adapters, the use cases and the controller together.

    Returns:
        A MainController ready to serve requests.
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
    """Builds the controller, creates the Flask app, and starts the development server."""
    load_dotenv()
    app = create_app(build_controller())
    app.run(host="127.0.0.1", port=5000, debug=True)


if __name__ == "__main__":
    main()
