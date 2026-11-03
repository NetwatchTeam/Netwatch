from flask import Flask, jsonify, request

from controllers.main_controller import MainController


def create_app(controller: MainController) -> Flask:
    app = Flask(__name__)

    @app.post("/scan")
    def scan():
        payload = request.get_json(silent=True) or {}
        targets = payload.get("targets")
        try:
            return jsonify(controller.scan_machines(targets))
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 502

    return app