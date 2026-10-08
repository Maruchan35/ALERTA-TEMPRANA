export type UserRole = 'unselected' | 'citizen' | 'moderator';

export interface ModeratorUser {
  username: string;
  fullName: string;
  roleTitle: string;
  entity: string;
}
