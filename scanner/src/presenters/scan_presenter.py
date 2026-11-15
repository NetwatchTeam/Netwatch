from datetime import UTC, datetime

from presenters.machine_presenter import MachinePresenter
from usecases.responses.scan_response import ScanResponse, ThroughputResponse

CONTRACT_VERSION = "1.0.0"


def _iso(dt: datetime) -> str:
    """Converts a datetime object to an ISO 8601 formatted string in UTC.

    Args:
        dt: The datetime object to convert.

    Returns:
        An ISO 8601 formatted string representation.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    dt = dt.astimezone(UTC)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _without_none(d: dict) -> dict:
    """Removes keys with None values from a dictionary.

    Args:
        d: The dictionary to filter.

    Returns:
        A new dictionary without None values.
    """
    return {k: v for k, v in d.items() if v is not None}


class ScanPresenter:
    """Presenter responsible for formatting scan results into API contracts."""

    @staticmethod
    def _throughput(x: ThroughputResponse) -> dict:
        """Formats a throughput measurement into a dictionary.

        Args:
            x: The ThroughputResponse instance.

        Returns:
            A dictionary representation of the throughput.
        """
        return {"sourceIp": x.source_ip, "targetIp": x.target_ip, "mbps": x.mbps}

    @staticmethod
    def present(scan_result: ScanResponse) -> dict:
        """Presents the scan result data as a dictionary adhering to the API contract.

        Args:
            scan_result: The ScanResponse produced by the use case.

        Returns:
            A dictionary containing the formatted scan report.
        """
        return {
            "contractVersion": CONTRACT_VERSION,
            "scannedAt": _iso(scan_result.scanned_at),
            "devices": MachinePresenter.to_list(scan_result.machines),
            "throughput": [
                ScanPresenter._throughput(x) for x in scan_result.throughput
            ],
        }
