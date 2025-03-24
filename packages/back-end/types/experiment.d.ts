import {
  ExperimentPhase,
  Variation,
  MetricOverride,
  ExperimentInterface,
} from "back-end/src/validators/experiments";
import { ExperimentRefVariation, FeatureInterface } from "./feature";

export {
  AttributionModel,
  ImplementationType,
  MetricOverride,
  ExperimentStatus,
  ExperimentType,
  ExperimentPhase,
  BanditStageType,
  ExperimentAnalysisSettings,
  ExperimentAnalysisSummaryResultsStatus,
  ExperimentAnalysisSummaryVariationStatus,
  ExperimentInterface,
  ExperimentNotification,
  ExperimentResultsType,
  Screenshot,
  Variation,
} from "back-end/src/validators/experiments";

export {
  ExperimentTemplateInterface,
  CreateTemplateProps,
  UpdateTemplateProps,
} from "back-end/src/routers/experiment-template/template.validators";

export {
  DecisionCriteriaInterface,
  DecisionCriteriaData,
  DecisionCriteriaAction,
  DecisionCriteriaCondition,
  DecisionCriteriaRule,
} from "back-end/src/enterprise/routers/decision-criteria/decision-criteria.validators";

export type DecisionFrameworkExperimentRecommendationStatus =
  | { status: "days-left"; daysLeft: number }
  | {
      status: "ship-now";
      variationIds: string[];
      powerReached: boolean;
      sequentialUsed: boolean;
    }
  | {
      status: "rollback-now";
      variationIds: string[];
      powerReached: boolean;
      sequentialUsed: boolean;
    }
  | {
      status: "ready-for-review";
      variationIds: string[];
      powerReached: boolean;
      sequentialUsed: boolean;
    };

export type ExperimentUnhealthyData = {
  // if key exists, the status is unhealthy
  srm?: boolean;
  multipleExposures?: {
    rawDecimal: number;
    multipleExposedUsers: number;
  };
  lowPowered?: boolean;
};

export type ExperimentResultStatus =
  | DecisionFrameworkExperimentRecommendationStatus
  | { status: "no-data" }
  | { status: "unhealthy"; unhealthyData: ExperimentUnhealthyData }
  | { status: "before-min-duration" };

export type ExperimentResultStatusData = ExperimentResultStatus & {
  tooltip?: string;
};

export type ExperimentPhaseType = "ramp" | "main" | "holdout";

export type DomChange = {
  selector: string;
  action: "append" | "set" | "remove";
  attribute: string;
  value: string;
};

export type LegacyVariation = Variation & {
  /** @deprecated */
  css?: string;
  /** @deprecated */
  dom?: DomChange[];
};

export interface VariationWithIndex extends Variation {
  index: number;
}

export interface LegacyExperimentPhase extends ExperimentPhase {
  /** @deprecated */
  phase?: ExperimentPhaseType;
  /** @deprecated */
  groups?: string[];
}

export type ExperimentPhaseStringDates = Omit<
  ExperimentPhase,
  "dateStarted" | "dateEnded"
> & {
  dateStarted?: string;
  dateEnded?: string;
};

export type LegacyMetricOverride = MetricOverride & {
  conversionWindowHours?: number;
  conversionDelayHours?: number;
};

export interface LegacyExperimentInterface
  extends Omit<
    ExperimentInterface,
    | "phases"
    | "variations"
    | "attributionModel"
    | "releasedVariationId"
    | "metricOverrides"
    | "goalMetrics"
    | "secondaryMetrics"
    | "guardrailMetrics"
  > {
  /**
   * @deprecated
   */
  observations?: string;
  metricOverrides?: LegacyMetricOverride[];
  attributionModel: ExperimentInterface["attributionModel"] | "allExposures";
  variations: LegacyVariation[];
  phases: LegacyExperimentPhase[];
  releasedVariationId?: string;
  metrics?: string[];
  guardrails?: string[];
  goalMetrics?: string[];
  secondaryMetrics?: string[];
  guardrailMetrics?: string[];
}

export type ExperimentInterfaceStringDates = Omit<
  ExperimentInterface,
  "dateCreated" | "dateUpdated" | "phases"
> & {
  dateCreated: string;
  dateUpdated: string;
  phases: ExperimentPhaseStringDates[];
};

export type Changeset = Partial<ExperimentInterface>;

export type ExperimentTargetingData = Pick<
  ExperimentPhaseStringDates,
  | "condition"
  | "coverage"
  | "namespace"
  | "seed"
  | "variationWeights"
  | "savedGroups"
  | "prerequisites"
> &
  Pick<
    ExperimentInterfaceStringDates,
    | "hashAttribute"
    | "fallbackAttribute"
    | "hashVersion"
    | "disableStickyBucketing"
    | "bucketVersion"
    | "minBucketVersion"
    | "trackingKey"
  > & {
    newPhase: boolean;
    reseed: boolean;
  };

export type LinkedFeatureState = "locked" | "live" | "draft" | "discarded";

export type LinkedFeatureEnvState =
  | "missing"
  | "disabled-env"
  | "disabled-rule"
  | "active";

export interface LinkedFeatureInfo {
  feature: FeatureInterface;
  state: LinkedFeatureState;
  values: ExperimentRefVariation[];
  valuesFrom: string;
  inconsistentValues: boolean;
  rulesAbove: boolean;
  environmentStates: Record<string, LinkedFeatureEnvState>;
}

export type ExperimentHealthSettings = {
  decisionFrameworkEnabled: boolean;
  srmThreshold: number;
  multipleExposureMinPercent: number;
  experimentMinLengthDays: number;
};

export type ExperimentDataForStatusStringDates = Pick<
  ExperimentInterfaceStringDates,
  | "type"
  | "variations"
  | "status"
  | "archived"
  | "results"
  | "analysisSummary"
  | "phases"
  | "dismissedWarnings"
  | "goalMetrics"
  | "secondaryMetrics"
  | "guardrailMetrics"
  | "datasource"
>;

export type ExperimentDataForStatus = Pick<
  ExperimentInterface,
  | "type"
  | "variations"
  | "status"
  | "archived"
  | "results"
  | "analysisSummary"
  | "phases"
  | "dismissedWarnings"
  | "goalMetrics"
  | "secondaryMetrics"
  | "guardrailMetrics"
  | "datasource"
>;
