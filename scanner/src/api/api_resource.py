"""Définition des ressources de l'API REST Flask pour le scan réseau.

Expose le cas d'usage de scan à travers une petite API JSON. Ce module ne
traite que les aspects HTTP (lecture de la requête, codes de statut,
sérialisation) et délègue tout le travail au contrôleur.
"""

import os

from flask import Flask, jsonify, request

from controllers.main_controller import MainController


def _configured_targets() -> list[str]:
    """Retourne les cibles de ``SCANNER_TARGETS`` (séparées par des virgules).

    Returns:
        La liste des cibles configurées, localhost par défaut.
    """
    return [
        target.strip()
        for target in os.getenv("SCANNER_TARGETS", "127.0.0.1").split(",")
        if target.strip()
    ]


def create_app(controller: MainController) -> Flask:
    """Crée et configure l'application Flask.

    Args:
        controller: Contrôleur qui traite les demandes de scan.

    Returns:
        Une application Flask exposant ``POST /scan``, ``GET /scan`` et
        ``GET /tcp-checks``.
    """
    app = Flask(__name__)

    @app.post("/scan")
    def scan():
        """Scanne les cibles demandées.

        Lit un corps JSON optionnel de la forme ``{"targets": ["10.0.0.1"]}``.
        Quand aucune cible n'est fournie, le scanner se rabat sur
        ``SCANNER_TARGETS`` (localhost par défaut).

        Returns:
            Un instantané JSON des machines découvertes, 503 si aucune cible
            n'est configurée, ou un objet JSON ``{"error": "..."}`` avec le
            statut HTTP 502 si le scan a échoué.
        """
        # silent=True renvoie None si le corps JSON est absent ou invalide au
        # lieu de lever une exception : une requête vide lance donc un scan par défaut.
        payload = request.get_json(silent=True) or {}
        # Sans cible dans le corps (cas du dashboard), on prend SCANNER_TARGETS.
        targets = payload.get("targets") or _configured_targets()
        if not targets:
            return jsonify({"error": "Aucune cible de scan configurée."}), 503
        try:
            return jsonify(controller.scan_machines(targets))
        except RuntimeError as exc:
            # Le moteur de scan (nmap) a échoué : on répond « bad gateway ».
            return jsonify({"error": str(exc)}), 502

    @app.get("/scan")
    def get_scan():
        """Scanne les cibles configurées dans ``SCANNER_TARGETS`` (localhost par défaut).

        Returns:
            Un instantané JSON, 503 si aucune cible n'est configurée, ou 502
            si le scan a échoué.
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
        """Contrôle les services TCP configurés, sans lancer Nmap.

        Returns:
            Un objet JSON ``{"checks": [...]}``, ou 503 si la configuration
            TCP est invalide.
        """
        try:
            checks = controller.check_tcp_services()
        except ValueError as exc:
            app.logger.exception("Configuration TCP invalide")
            return jsonify({"error": str(exc)}), 503

        return jsonify({"checks": checks})

    return app
