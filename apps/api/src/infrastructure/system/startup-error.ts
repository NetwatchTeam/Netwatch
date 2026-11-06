/**
 * Erreur de démarrage destinée à la personne qui lance l'API : son message dit ce qui manque
 * et la commande à exécuter. main.ts l'affiche telle quelle, sans trace technique.
 */
export class StartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StartupError';
  }
}

/** Rappel des deux façons de lancer l'API en développement (README, méthodes B et C). */
export const DEV_HINT = [
  'Deux façons de lancer le projet en développement (README, « Installer et lancer le projet ») :',
  '  • Sans base de données (dashboard + données fictives) :',
  '      npm run dev:demo',
  '  • Avec la base et le collecteur (méthode C) :',
  '      cp apps/api/.env.example apps/api/.env      puis y reporter le POSTGRES_PASSWORD du .env racine',
  '      docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-deps db collector',
  '      npm run dev',
].join('\n');
