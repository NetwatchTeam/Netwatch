/**
 * Les rôles sont modélisés dès maintenant pour figer les vues et les droits,
 * mais l'accès est pour l'instant protégé par un simple mot de passe partagé :
 * toute session reçoit le rôle `admin`. Voir apps/api/src/interfaces/http/middleware/auth.ts.
 */
export const USER_ROLES = ['manager', 'technician', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface SessionUserDto {
  id: string;
  displayName: string;
  role: UserRole;
}

export interface LoginInput {
  password: string;
}
