from unittest.mock import Mock

from api.api_resource import create_app


def test_tcp_checks_route():
    """Vérifie que la route /tcp-checks retourne les résultats attendus."""
    controller = Mock()
    controller.check_tcp_services.return_value = [
        {"ip": "127.0.0.1", "port": 8000, "reachable": False}
    ]

    client = create_app(controller).test_client()
    response = client.get("/tcp-checks")

    assert response.status_code == 200
    assert response.get_json()["checks"][0]["reachable"] is False
    controller.check_tcp_services.assert_called_once_with()


def test_invalid_configuration_returns_503():
    """Vérifie que la route /tcp-checks retourne 503 si la configuration est invalide."""
    controller = Mock()
    controller.check_tcp_services.side_effect = ValueError(
        "Configuration invalide"
    )

    client = create_app(controller).test_client()
    response = client.get("/tcp-checks")

    assert response.status_code == 503
    assert "error" in response.get_json()