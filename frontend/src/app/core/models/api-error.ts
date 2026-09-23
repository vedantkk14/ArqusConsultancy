/** Normalised form of the backend's {"error": {code, message, details}} body. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}
