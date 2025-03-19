import type { Response } from "express";
import { getContextFromReq } from "back-end/src/services/organizations";
import { AuthRequest } from "back-end/src/types/AuthRequest";
import { SafeRolloutSnapshotInterface } from "back-end/src/validators/safe-rollout";
import { createSafeRolloutSnapshot } from "back-end/src/services/safeRolloutSnapshots";
import { getDataSourceById } from "back-end/src/models/DataSourceModel";
import { SafeRolloutRule } from "back-end/src/validators/features";
import { getIntegrationFromDatasourceId } from "back-end/src/services/datasource";
import { SafeRolloutResultsQueryRunner } from "back-end/src/queryRunners/SafeRolloutResultsQueryRunner";

// region GET /safeRollout/:id/snapshot
/**
 * GET /safeRollout/:id/snapshot
 * Create a Template resource
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

// region POST /safeRollout/snapshot
/**
 * POST /safeRollout/snapshot
 * Create a Snapshot resource
 * @param req
 * @param res
 */
export const createSnapshot = async (
  req: AuthRequest<SafeRolloutRule>,
  res: Response<{ status: 200; snapshot: SafeRolloutSnapshotInterface }>
) => {
  const context = getContextFromReq(req);
  const safeRollout = req.body;

  const { snapshot, queryRunner } = await createSafeRolloutSnapshot({
    context,
    safeRollout,
    dimension: "",
    useCache: true,
  });

  res.status(200).json({
    status: 200,
    snapshot,
  });
};
// endregion POST /safeRollout/snapshot

// region PUT /safeRollout/:id/cancelSnapshot
/**
 * PUT /safeRollout/:id/cancelSnapshot
 * Cancel a Snapshot resource
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

  // Create a helper function to get the safe rollout by id
  //   const safeRollout = await getExperimentById(context, snapshot.experiment);

  //   if (!safeRollout) {
  //     return res.status(404).json({
  //       status: 404,
  //       message: "Experiment not found",
  //     });
  //   }

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
// endregion PUT /safeRollout/:id/cancelSnapshot
