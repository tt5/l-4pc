export interface User {
  id: string;
  username: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
}

export type NullableUser = User | null;

export interface UserGameStatus {
  gameJoined: boolean;
  homeX: number;
  homeY: number;
}

export interface JoinGameResult extends UserGameStatus {
  success: boolean;
  message?: string;
}

export interface LeaveGameResult {
  success: boolean;
  message?: string;
}
