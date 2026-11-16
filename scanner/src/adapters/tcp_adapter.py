"""Adapter: opens TCP connections through the socket module.

This is the only module aware of socket and of its exceptions.
It depends on the ``TcpProber`` port, never on the domain entities.
"""

import socket
from datetime import datetime, timezone
from time import perf_counter

from usecases.ports.tcp import TcpProbeResult, TcpProber


class SocketTcpProber(TcpProber):
    """TcpProber implemented with the socket module."""

    def probe(self, ip: str, port: int, timeout: float) -> TcpProbeResult:
        """Tries a TCP connection to an address and a port, and times it.

        Network failures are returned, not raised. The parameters must be
        validated by the use case before invoking this method.

        Args:
            ip: The target IP address (IPv4 or IPv6).
            port: The target TCP port.
            timeout: Socket timeout in seconds (not milliseconds).

        Returns:
            A TcpProbeResult whose status is "open", "refused", "timeout" or
            "error".
        """
        checked_at = datetime.now(timezone.utc).isoformat()
        started_at = perf_counter()
        status, error = self._connect(ip, port, timeout)

        # Durée de la tentative en millisecondes, avec trois décimales.
        duration_ms = round((perf_counter() - started_at) * 1000, 3)
        return TcpProbeResult(
            status=status,
            checked_at=checked_at,
            duration_ms=duration_ms,
            error=error,
        )

    @staticmethod
    def _connect(ip: str, port: int, timeout: float) -> tuple[str, str | None]:
        """Translates the outcome of a socket connection into (status, error)."""
        try:
            # create_connection gère les adresses IPv4 et IPv6.
            with socket.create_connection((ip, port), timeout=timeout):
                pass
        except TimeoutError as exc:
            return "timeout", str(exc)
        except ConnectionRefusedError as exc:
            return "refused", str(exc)
        except OSError as exc:
            return "error", str(exc)
        return "open", None
