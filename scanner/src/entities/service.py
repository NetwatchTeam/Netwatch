from dataclasses import dataclass

from entities.port import Port


@dataclass
class Service:
    """Represents a network service running on a specific port.

    Attributes:
        name: The name of the service.
        port: The port associated with the service.
        product: Optional product name of the service.
        version: Optional version of the service.
        tls: Flag indicating if TLS is enabled.
    """

    name: str
    port: Port
    product: str | None = None
    version: str | None = None
    tls: bool = False
