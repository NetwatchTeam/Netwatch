from controllers.main_controller import MainController
from api.api_ressource import create_app
import os
from pathlib import Path
from dotenv import load_dotenv

def main():
    controller = MainController()
    app = create_app(controller)
    app.run(host="127.0.0.1", port=5000, debug=True)
    

if __name__ == "__main__":
    main()