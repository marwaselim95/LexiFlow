/**
 * Payload structure for JWT tokens used in authentication.
 * Contains the user identifier and email for session management.
 */
export interface JwtPayload {
  /** Subject — the user's unique identifier */
  sub: string;
  /** User's email address */
  email: string;
}
