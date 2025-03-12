import { ExperimentMetricInterface } from "shared/experiments";
import { daysBetween } from "shared/dates";
import { FALLBACK_EXPERIMENT_MAX_LENGTH_DAYS } from "shared/constants";
import { addDays } from "date-fns";
import { analyzeExperimentPower } from "shared/enterprise";
import { Queries, QueryStatus } from "back-end/types/query";
import { FactTableMap } from "back-end/src/models/FactTableModel";
import {
  SafeRolloutSnapshotAnalysis,
  SafeRolloutSnapshotHealth,
  SafeRolloutSnapshotInterface,
} from "back-end/src/validators/safe-rollout";
import { getSnapshotSettingsFromSafeRolloutArgs } from "back-end/src/services/safeRolloutSnapshots";
import {
  analyzeExperimentResults,
  analyzeExperimentTraffic,
} from "back-end/src/services/stats";
import { ExperimentAggregateUnitsQueryResponseRows } from "back-end/src/types/Integration";
import { QueryRunner, QueryMap } from "./QueryRunner";
import {
  ExperimentResultsQueryParams,
  startExperimentResultQueries,
  TRAFFIC_QUERY_NAME,
} from "./ExperimentResultsQueryRunner";

export type SnapshotResult = {
  unknownVariations: string[];
  multipleExposures: number;
  analyses: SafeRolloutSnapshotAnalysis[];
  health?: SafeRolloutSnapshotHealth;
};

export type SafeRolloutQueryParams = {
  metricMap: Map<string, ExperimentMetricInterface>;
  factTableMap: FactTableMap;
};

export class SafeRolloutResultsQueryRunner extends QueryRunner<
  SafeRolloutSnapshotInterface,
  SafeRolloutQueryParams,
  SnapshotResult
> {
  private metricMap: Map<string, ExperimentMetricInterface> = new Map();

  // TODO: Decide if we want more granular permissions here for safe rollouts
  checkPermissions(): boolean {
    return this.context.permissions.canRunExperimentQueries(
      this.integration.datasource
    );
  }

  async startQueries(params: SafeRolloutQueryParams): Promise<Queries> {
    this.metricMap = params.metricMap;

    const { snapshotSettings } = getSnapshotSettingsFromSafeRolloutArgs(
      this.model,
      params.metricMap
    );

    const experimentParams: ExperimentResultsQueryParams = {
      metricMap: params.metricMap,
      snapshotSettings,
      variationNames: ["control", "variation"],
      queryParentId: this.model.id,
      factTableMap: params.factTableMap,
    };

    return startExperimentResultQueries(
      this.context,
      experimentParams,
      this.integration,
      this.startQuery.bind(this)
    );
  }

  async runAnalysis(queryMap: QueryMap): Promise<SnapshotResult> {
    const {
      snapshotSettings,
      analysisSettings,
    } = getSnapshotSettingsFromSafeRolloutArgs(this.model, this.metricMap);

    const { results: analysesResults } = await analyzeExperimentResults({
      queryData: queryMap,
      snapshotSettings: snapshotSettings,
      analysisSettings: [analysisSettings],
      variationNames: ["control", "variation"],
      metricMap: this.metricMap,
    });

    const result: SnapshotResult = {
      analyses: this.model.analyses,
      multipleExposures: 0,
      unknownVariations: [],
    };

    analysesResults.forEach((results, i) => {
      const analysis = this.model.analyses[i];
      if (!analysis) return;

      analysis.results = results.dimensions || [];
      analysis.status = "success";
      analysis.error = "";

      // TODO: do this once, not per analysis
      result.unknownVariations = results.unknownVariations || [];
      result.multipleExposures = results.multipleExposures ?? 0;
    });

    // Run health checks
    const healthQuery = queryMap.get(TRAFFIC_QUERY_NAME);
    if (healthQuery) {
      const rows = healthQuery.result as ExperimentAggregateUnitsQueryResponseRows;
      const trafficHealth = analyzeExperimentTraffic({
        rows: rows,
        error: healthQuery.error,
        variations: this.model.settings.variations,
      });

      result.health = {
        traffic: trafficHealth,
      };

      const relativeAnalysis = this.model.analyses.find(
        (a) => a.settings.differenceType === "relative"
      );

      const isEligibleForMidExperimentPowerAnalysis =
        relativeAnalysis && rows && rows.length;

      if (isEligibleForMidExperimentPowerAnalysis) {
        const today = new Date();
        const phaseStartDate = this.model.settings.startDate;
        const experimentMaxLengthDays = this.context.org.settings
          ?.experimentMaxLengthDays;

        const experimentTargetEndDate = addDays(
          phaseStartDate,
          experimentMaxLengthDays && experimentMaxLengthDays > 0
            ? experimentMaxLengthDays
            : FALLBACK_EXPERIMENT_MAX_LENGTH_DAYS
        );
        const targetDaysRemaining = daysBetween(today, experimentTargetEndDate);
        // NB: This does not run a SQL query, but it is a health check that depends on the trafficHealth
        result.health.power = analyzeExperimentPower({
          trafficHealth,
          targetDaysRemaining,
          analysis: relativeAnalysis,
          goalMetrics: [], // TODO: Should we place guardrails metrics here instead?
          variationsSettings: this.model.settings.variations,
        });
      }
    }

    return result;
  }

  async getLatestModel(): Promise<SafeRolloutSnapshotInterface> {
    const obj = await this.context.models.safeRolloutSnapshots.getById(
      this.model.id
    );
    if (!obj) throw new Error("Could not load safe rollout snapshot model");
    return obj;
  }

  async updateModel({
    queries,
    runStarted,
    result,
    error,
  }: {
    status: QueryStatus;
    queries: Queries;
    runStarted?: Date;
    result?: SnapshotResult;
    error?: string;
  }): Promise<SafeRolloutSnapshotInterface> {
    const updates: Partial<SafeRolloutSnapshotInterface> = {
      queries,
      runStarted,
      error,
      ...result,
      status:
        status === "running"
          ? "running"
          : status === "failed"
          ? "error"
          : "success",
    };
    await this.context.models.safeRolloutSnapshots.updateById(
      this.model.id,
      updates
    );
    return {
      ...this.model,
      ...updates,
    };
  }
}
