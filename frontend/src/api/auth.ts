import type { Resource } from './projects';
import { request } from './client';

/** The signed-in account, with no secrets or password material. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

/** The payload of a successful login or registration. */
export interface AuthSession {
  user: AuthUser;
  token: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration extends Credentials {
  password_confirmation: string;
}

export const authApi = {
  register: (payload: Registration): Promise<Resource<AuthSession>> =>
    request('/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload: Credentials): Promise<Resource<AuthSession>> =>
    request('/login', { method: 'POST', body: JSON.stringify(payload) }),
  logout: (): Promise<void> => request('/logout', { method: 'POST' }),
  user: (): Promise<Resource<AuthUser>> => request('/user'),
};
