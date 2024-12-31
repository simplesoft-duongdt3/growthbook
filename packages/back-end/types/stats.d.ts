export { StatsEngine } from "back-end/src/models/ProjectModel";

import type { MetricStats } from "./metric";

export type PValueCorrection = null | "benjamini-hochberg" | "holm-bonferroni";

export type DifferenceType = "relative" | "absolute" | "scaled";

export type RiskType = "relative" | "absolute";

// Keep in sync with gbstats PowerResponse
export interface PowerResponseFromStatsEngine {
  firstPeriodPairwiseSampleSize?: number;
  effectSize?: number;
  sigmahat2Delta?: number;
  sigma2Posterior?: number;
  deltaPosterior?: number;
  powerUpdateMessage?: string;
  powerError?: string;
  endOfExperimentPower?: number; // delete later, used for testing only
  newDailyUsers?: number; // delete later, used for testing only
  powerAdditionalUsers?: number; // delete later, used for testing only
  powerAdditionalDays?: number; // delete later, used for testing only
  targetPower?: number; // delete later, used for testing only
}

interface BaseVariationResponse {
  cr: number;
  value: number;
  users: number;
  denominator?: number;
  stats: MetricStats;
  expected?: number;
  uplift?: {
    dist: string;
    mean?: number;
    stddev?: number;
  };
  ci?: [number, number];
  errorMessage?: string;
  // TODO: Should we name this `power` only? Or is there a better qualifier?
  powerResponse?: PowerResponseFromStatsEngine;
}

interface BayesianVariationResponse extends BaseVariationResponse {
  chanceToWin?: number;
  risk?: [number, number];
  riskType?: RiskType;
}

interface FrequentistVariationResponse extends BaseVariationResponse {
  pValue?: number;
}

interface BaseDimensionResponse {
  dimension: string;
  srm: number;
}

interface BayesianDimensionResponse extends BaseDimensionResponse {
  variations: BayesianVariationResponse[];
}

interface FrequentistVariationResponse extends BaseDimensionResponse {
  variations: FrequentistVariationResponse[];
}

type StatsEngineDimensionResponse =
  | BayesianDimensionResponse
  | FrequentistVariationResponse;

// Keep below classes in sync with gbstats
export type ExperimentMetricAnalysis = {
  metric: string;
  analyses: {
    unknownVariations: string[];
    multipleExposures: number;
    dimensions: StatsEngineDimensionResponse[];
  }[];
}[];

export type SingleVariationResult = {
  users?: number;
  cr?: number;
  ci?: [number, number];
};

export type BanditResult = {
  singleVariationResults?: SingleVariationResult[];
  currentWeights: number[];
  updatedWeights: number[];
  srm: number;
  bestArmProbabilities?: number[];
  seed: number;
  updateMessage?: string;
  error?: string;
  reweight?: boolean;
};

export type MultipleExperimentMetricAnalysis = {
  id: string;
  results: ExperimentMetricAnalysis;
  banditResult?: BanditResult;
  error?: string;
  traceback?: string;
};
