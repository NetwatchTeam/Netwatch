from flask import Flask, jsonify, request

from controllers.main_controller import MainController


def create_app(controller: MainController) -> Flask:
    app = Flask(__name__)

    @app.get("/machines")
    def list_machines():
        return jsonify(controller.list_machines())

    @app.get("/machines/<ip>")
    def get_machine(ip):
        machine = controller.get_machine(ip)
        if machine is None:
            return jsonify({"error": "machine introuvable"}), 404
        return jsonify(machine)

    @app.post("/scan")
    def scan():
        payload = request.get_json(silent=True) or {}
        targets = payload.get("targets")
        try:
            return jsonify(controller.scan_machines(targets))
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 502

    return app