/**
 * API Versioning Middleware
 *
 * Implements URL-prefix-based API versioning (e.g., /api/v1/, /api/v2/)
 * with deprecation headers and version negotiation.
 */

import { Request, Response, NextFunction, Router } from 'express';

// Extend Express Request to include apiVersion
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}

/** Currently supported API versions */
export const SUPPORTED_VERSIONS = ['v1', 'v2'] as const;
export type ApiVersion = (typeof SUPPORTED_VERSIONS)[number];

/** Default API version */
export const DEFAULT_VERSION: ApiVersion = 'v1';

/**
 * Map of deprecated endpoints with their deprecation dates.
 * Key: versioned path, Value: sunset date (ISO 8601)
 */
const DEPRECATED_ENDPOINTS: Record<string, string> = {
  // Example: '/api/v1/courses/legacy': '2027-01-01T00:00:00Z',
};

/**
 * Middleware that extracts and validates the API version from the URL prefix.
 * Expects URLs in the format /api/v{version}/...
 * Returns 400 if the version is not in the supported list.
 */
export const versionExtractor = (req: Request, res: Response, next: NextFunction): void => {
  const match = req.path.match(/^\/api\/v(\d+)(\/.*)?$/);

  if (match) {
    const version = `v${match[1]}`;
    if (!SUPPORTED_VERSIONS.includes(version as ApiVersion)) {
      res.status(400).json({
        success: false,
        message: `Unsupported API version: ${version}`,
        supportedVersions: SUPPORTED_VERSIONS,
      });
      return;
    }
    req.apiVersion = version;

    // Check for deprecated endpoints
    const normalizedPath = req.path.replace(/\/$/, '');
    const sunsetDate = DEPRECATED_ENDPOINTS[normalizedPath];
    if (sunsetDate) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', sunsetDate);
      res.setHeader('Link', `</api/${DEFAULT_VERSION}${match[2] || ''}>; rel="successor-version"`);
    }
  } else {
    // Default to v1 for non-versioned paths (backward compatibility)
    req.apiVersion = DEFAULT_VERSION;
  }

  next();
};

/**
 * Creates a versioned Express Router that all resource routes can be mounted on.
 * All routes in this router are prefixed with /api/{version}
 *
 * @param version - The API version (e.g., 'v1', 'v2')
 * @returns Express Router
 */
export const createVersionedRouter = (version: ApiVersion): Router => {
  const router = Router();

  // Attach version to all requests in this router
  router.use((req: Request, _res: Response, next: NextFunction) => {
    req.apiVersion = version;
    next();
  });

  return router;
};

/**
 * Middleware to mark a specific route as deprecated.
 * Sets the Deprecation and Sunset headers on the response.
 *
 * @param sunsetDate - ISO 8601 date string when the endpoint will be removed
 */
export const markDeprecated = (sunsetDate: string) => {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunsetDate);
    next();
  };
};

/**
 * Middleware to redirect from a deprecated v1 endpoint to its v2 replacement.
 *
 * @param v2Path - The replacement path in v2
 */
export const redirectToV2 = (v2Path: string) => {
  return (req: Request, res: Response, _next: NextFunction): void => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Sat, 01 Jan 2028 00:00:00 GMT');
    res.setHeader('Link', `</api/v2${v2Path}>; rel="successor-version"`);
    res.status(301).redirect(`/api/v2${v2Path}`);
  };
};
