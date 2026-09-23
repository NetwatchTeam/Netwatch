from controllers.main_controller import MainController
from repositories.machine_repository_sql_lite import SQLiteMachineRepository
from api.api_ressource import create_app


def main():
    repo = SQLiteMachineRepository()
    controller = MainController(repo)
    app = create_app(controller)
    app.run(host="0.0.0.0", port=5000, debug=True)


if __name__ == "__main__":
    main()