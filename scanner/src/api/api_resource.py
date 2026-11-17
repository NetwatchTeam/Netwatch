"""Flask REST API resource definitions for network scanning.

Exposes the scan use case through a small JSON API. This module only deals
with HTTP concerns (request parsing, status codes, serialization) and
delegates all the work to the controller.
"""

import os

from flask import Flask, jsonify, request

from controllers.main_controller import MainController


def _configured_targets() -> list[str]:
    """Cibles de ``SCANNER_TARGETS`` (séparées par des virgules), localhost par défaut."""
    return [
        target.strip()
        for target in os.getenv("SCANNER_TARGETS", "192.168.20.0").split(",")
        if target.strip()
    ]


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
        When no targets are given, the scanner falls back to ``SCANNER_TARGETS``
        (localhost by default).

        Returns:
            A JSON list of the discovered machines, or a JSON object
            ``{"error": "..."}`` with HTTP status 502 if the scan failed.
        """
        # silent=True returns None on a missing/invalid JSON body instead of
        # raising, so an empty request simply triggers a default scan.
        payload = request.get_json(silent=True) or {}
        # Sans cible dans le corps (cas du dashboard), on prend SCANNER_TARGETS.
        targets = payload.get("targets") or _configured_targets()
        if not targets:
            return jsonify({"error": "Aucune cible de scan configurée."}), 503
        try:
            return jsonify(controller.scan_machines(targets))
        except RuntimeError as exc:
            # The scan backend (nmap) failed: report it as a bad gateway.
            return jsonify({"error": str(exc)}), 502

    @app.get("/scan")
    def get_scan():
        """Scans the targets configured in ``SCANNER_TARGETS`` (localhost by default).

        Returns:
            A JSON snapshot, 503 if no target is configured, or 502 if the
            scan failed.
        """
        targets = _configured_targets()

        if not targets:
            return jsonify({
                "error": "Aucune cible de scan configurée."
            }), 503

        try:
            snapshot = controller.scan_machines(targets)
            return jsonify(snapshot)
        except RuntimeError as exc:
            app.logger.exception("Échec du scan Nmap")
            return jsonify({"error": str(exc)}), 502

    @app.get("/tcp-checks")
    def get_tcp_checks():
        """Contrôle les services TCP configurés, sans lancer Nmap."""
        try:
            checks = controller.check_tcp_services()
        except ValueError as exc:
            app.logger.exception("Configuration TCP invalide")
            return jsonify({"error": str(exc)}), 503

        return jsonify({"checks": checks})

    return app
