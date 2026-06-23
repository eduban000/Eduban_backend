/**
 * API Version-Specific Schemas
 *
 * Defines versioned response schemas and constants for the API versioning system.
 */

/** Supported API versions */
export const API_VERSIONS = {
  V1: 'v1',
  V2: 'v2',
} as const;

export type ApiVersion = (typeof API_VERSIONS)[keyof typeof API_VERSIONS];

/** Default API version for clients that don't specify one */
export const DEFAULT_API_VERSION = API_VERSIONS.V1;

/** Current latest stable version */
export const LATEST_STABLE_VERSION = API_VERSIONS.V1;

/** Version-specific response wrapper */
export interface VersionedResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  version: ApiVersion;
  timestamp: string;
  deprecation?: {
    deprecated: boolean;
    sunset?: string;
    successorVersion?: string;
  };
}

/**
 * Creates a versioned response envelope.
 */
export const createVersionedResponse = <T>(
  data: T,
  version: ApiVersion = DEFAULT_API_VERSION,
  deprecationInfo?: { sunset?: string; successorVersion?: string }
): VersionedResponse<T> => {
  const response: VersionedResponse<T> = {
    success: true,
    data,
    version,
    timestamp: new Date().toISOString(),
  };

  if (deprecationInfo) {
    response.deprecation = {
      deprecated: true,
      sunset: deprecationInfo.sunset,
      successorVersion: deprecationInfo.successorVersion,
    };
  }

  return response;
};

/**
 * Creates a versioned error response.
 */
export const createVersionedError = (
  message: string,
  version: ApiVersion = DEFAULT_API_VERSION
): VersionedResponse => ({
  success: false,
  message,
  version,
  timestamp: new Date().toISOString(),
});

/** Version-aware health check response */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: ApiVersion;
  timestamp: string;
  uptime: number;
  supportedVersions: ApiVersion[];
}
