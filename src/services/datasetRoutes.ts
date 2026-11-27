/**
 * datasetRoutes.ts — Express router for the CC0-only company-dataset
 * retrieval contract (Node `dataset` phase 3).
 *
 *   GET /search?q=&sector=&city=&limit=
 *   GET /company/:id
 *
 * Both routes are auth-gated with the app's existing session resolver
 * (`getUserFromToken`) and return cleared records only by default. No write
 * endpoints.
 *
 * Note on auth: the app ships its routers as factories that receive the host
 * session resolver (`getUserFromToken`). There is no exported, app-level
 * `requireAuth` helper (jinCompleteRoutes/artisanRoutes define `requireAuth`
 * locally inside their factory), so the gate below mirrors that exact
 * contract rather than importing a helper that does not exist.
 */

import { Router, type Request, type Response } from 'express';
import {
  searchCompanies,
  getCompany,
  type SearchParams,
  type GetCompanyOptions,
} from './companyDataset.js';

export interface DatasetRouterOptions {
  getUserFromToken: (req: Request) => unknown | null;
}

export function createDatasetRouter(options: DatasetRouterOptions): Router {
  const router = Router();

  // App-level auth gate: resolve session, 401 anonymous callers.
  const requireAuth = (req: Request, res: Response): unknown | null => {
    const user = options.getUserFromToken(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return user;
  };

  // GET /search?q=&sector=&city=&limit=
  // Cleared records only by default (CC0-clean); includeRestricted is NOT
  // exposed here — the restricted gate lives on the dataset functions.
  router.get(
    '/search',
    (req: Request, res: Response) => {
      const user = requireAuth(req, res);
      if (!user) return;

      const params: SearchParams = {
        query: req.query.q as string,
        sector: req.query.sector as string,
        city: req.query.city as string,
        limit:
          typeof req.query.limit === 'string' &&
          req.query.limit !== ''
            ? Number(req.query.limit)
            : 10,
      };

      const result = searchCompanies(params);
      res.json({ hits: result.hits, reason: result.reason });
    }
  );

  // GET /company/:id — cleared record only by default.
  router.get(
    '/company/:id',
    (req: Request, res: Response) => {
      const user = requireAuth(req, res);
      if (!user) return;

      const result = getCompany(req.params.id);
      if (result.record) {
        res.json({ company: result.record, reason: result.reason });
      } else {
        res.status(404).json({
          error: 'Company not found',
          reason: result.reason,
        });
      }
    }
  );

  return router;
}
