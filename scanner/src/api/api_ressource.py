"""HTTP layer of the scanner, built on Flask.

Exposes the scan use case through a small JSON API. This module only deals
with HTTP concerns (request parsing, status codes, serialization) and
delegates all the work to the controller.
"""

from flask import Flask, jsonify, request

from controllers.main_controller import MainController


def create_app(controller: MainController) -> Flask:
    """Creates and configures the Flask application.

    Args:
        controller: Controller that handles the scan requests.

    Returns:
        A Flask application exposing the ``POST /scan`` endpoint.
    """
    app = Flask(__name__)

    @app.post("/scan")
    def scan():
        """Scans the requested targets.

        Reads an optional JSON body of the form ``{"targets": ["10.0.0.1"]}``.
        When no targets are given, the scanner falls back to its default
        target (localhost).

        Returns:
            A JSON list of the discovered machines, or a JSON object
            ``{"error": "..."}`` with HTTP status 502 if the scan failed.
        """
        # silent=True returns None on a missing/invalid JSON body instead of
        # raising, so an empty request simply triggers a default scan.
        payload = request.get_json(silent=True) or {}
        targets = payload.get("targets")
        try:
            return jsonify(controller.scan_machines(targets))
        except RuntimeError as exc:
            # The scan backend (nmap) failed: report it as a bad gateway.
            return jsonify({"error": str(exc)}), 502

    return app
