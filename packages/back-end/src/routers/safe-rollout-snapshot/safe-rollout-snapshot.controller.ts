import type { Response } from "express";
import { getContextFromReq } from "back-end/src/services/organizations";
import { AuthRequest } from "back-end/src/types/AuthRequest";
import { SafeRolloutSnapshotInterface } from "back-end/src/validators/safe-rollout";
import { createSafeRolloutSnapshot } from "back-end/src/services/safeRolloutSnapshots";
import { SafeRolloutRule } from "back-end/src/validators/features";
import { getIntegrationFromDatasourceId } from "back-end/src/services/datasource";
import { SafeRolloutResultsQueryRunner } from "back-end/src/queryRunners/SafeRolloutResultsQueryRunner";
import { getFeature } from "back-end/src/models/FeatureModel";
import { SNAPSHOT_TIMEOUT } from "back-end/src/controllers/experiments";
import { SafeRolloutAnalysisSettings } from "back-end/src/models/SafeRolloutAnalysisSettings";

// region GET /safeRollout/:id/snapshot
/**
 * GET /safeRollout/:id/snapshot
 * Get the latest snapshot for a safe rollout
 * @param req
 * @param res
 */
export const getLatestSnapshot = async (
  req: AuthRequest<null, { id: string }>,
  res: Response<{ status: 200; snapshot: SafeRolloutSnapshotInterface }>
) => {
  const context = getContextFromReq(req);

  const snapshot = await context.models.safeRolloutSnapshots.getLatestSnapshot({
    safeRollout: req.params.id,
  });

  res.status(200).json({
    status: 200,
    snapshot,
  });
};

// endregion GET /safeRollout/:id/snapshot

// region GET /safeRollout/:id/snapshot/:dimension
/**
 * GET /safeRollout/:id/snapshot/:dimension
 * Get a snapshot for a safe rollout by dimension
 * @param req
 * @param res
 */
export async function getSnapshotWithDimension(
  req: AuthRequest<null, { id: string; dimension: string }>,
  res: Response
) {
  const context = getContextFromReq(req);
  const { id, dimension } = req.params;

  const snapshot = await context.models.safeRolloutSnapshots.getLatestSnapshot({
    safeRollout: id,
    dimension,
  });
  const latest = await context.models.safeRolloutSnapshots.getLatestSnapshot({
    safeRollout: id,
    dimension,
    withResults: false,
  });

  const dimensionless =
    snapshot?.dimension === ""
      ? snapshot
      : await context.models.safeRolloutSnapshots.getLatestSnapshot({
          safeRollout: id,
        });

  res.status(200).json({
    status: 200,
    snapshot,
    latest,
    dimensionless,
  });
}

// endregion GET /safeRollout/:id/snapshot/:dimension

// region POST /safeRollout/:id/snapshot
/**
 * POST /safeRollout/:id/snapshot
 * Create a Snapshot resource
 * @param req
 * @param res
 */
export const createSnapshot = async (
  req: AuthRequest<
    {
      featureId: string;
      dimension?: string;
    },
    { id: string },
    { force?: string }
  >,
  res: Response<{
    status: 200 | 404;
    snapshot?: SafeRolloutSnapshotInterface;
    message?: string;
  }>
) => {
  const context = getContextFromReq(req);
  const { dimension, featureId } = req.body;
  const { id } = req.params;
  const useCache = !req.query["force"];

  const feature = await getFeature(context, featureId);
  if (!feature) {
    throw new Error("Could not find feature");
  }

  let safeRollout: SafeRolloutRule | undefined;
  for (const [envKey, environment] of Object.entries(
    feature.environmentSettings
  )) {
    for (const rule of environment.rules) {
      if (rule.id === id && rule.type === "safe-rollout") {
        safeRollout = rule;
      }
    }
  }

  if (!safeRollout) {
    return res.status(404).json({
      status: 404,
      message: "Safe Rollout not found",
    });
  }

  // This is doing an expensive analytics SQL query, so may take a long time
  // Set timeout to 30 minutes
  req.setTimeout(SNAPSHOT_TIMEOUT);
  const safeRolloutAnalysisSettings = new SafeRolloutAnalysisSettings(context);
  const safeRolloutAnalysisSetting = safeRolloutAnalysisSettings.findByRuleId(safeRollout.id);
  const { snapshot } = await createSafeRolloutSnapshot({
    context,
    safeRollout,
    dimension,
    useCache,
,
  });

  res.status(200).json({
    status: 200,
    snapshot,
  });
};
// endregion POST /safeRollout/:id/snapshot

// region POST /safeRollout/snapshot/:id/cancelSnapshot
/**
 * POST /safeRollout/snapshot/:id/cancelSnapshot
 * Cancel a Snapshot
 * @param req
 * @param res
 */
export const cancelSnapshot = async (
  req: AuthRequest<null, { id: string }>,
  res: Response<{ status: 200 | 400 | 404; message?: string }>
) => {
  const context = getContextFromReq(req);
  const { id } = req.params;
  const snapshot = await context.models.safeRolloutSnapshots.getById(id);
  if (!snapshot) {
    return res.status(400).json({
      status: 400,
      message: "No snapshot found with that id",
    });
  }

  const feature = await getFeature(context, snapshot.featureId);
  if (!feature) {
    throw new Error("Could not find feature");
  }
  // loop through environment settings in the feature and through the rules to find a safe rollout with snapshot.safeRolloutRuleId
  let safeRollout: SafeRolloutRule | undefined;
  for (const [envKey, environment] of Object.entries(
    feature.environmentSettings
  )) {
    for (const rule of environment.rules) {
      if (
        rule.id === snapshot.safeRolloutRuleId &&
        rule.type === "safe-rollout"
      ) {
        safeRollout = rule;
      }
    }
  }

  if (!safeRollout) {
    return res.status(404).json({
      status: 404,
      message: "Safe Rollout not found",
    });
  }

  const integration = await getIntegrationFromDatasourceId(
    context,
    snapshot.settings.datasourceId
  );

  const queryRunner = new SafeRolloutResultsQueryRunner(
    context,
    snapshot,
    integration
  );
  await queryRunner.cancelQueries();
  await context.models.safeRolloutSnapshots.deleteById(snapshot.id);

  res.status(200).json({ status: 200 });
};
// endregion POST /safeRollout/snapshot/:id/cancelSnapshot
