"""Application entry point for the Netwatch scanner service."""

from api.api_resource import create_app
from controllers.main_controller import MainController


def main() -> None:
    """Initializes the controller, creates the Flask app, and starts the development server."""
    controller = MainController()
    app = create_app(controller)
    app.run(host="127.0.0.1", port=5000, debug=True)


if __name__ == "__main__":
    main()
