export const DEFAULT_STATS_ENGINE = "bayesian" as const;
export const DEFAULT_METRIC_HISTOGRAM_BINS = 25;
export const DEFAULT_P_VALUE_THRESHOLD = 0.05;

// Metric defaults
export const DEFAULT_METRIC_WINDOW = "conversion";
export const DEFAULT_FACT_METRIC_WINDOW = "";
export const DEFAULT_METRIC_WINDOW_DELAY_HOURS = 0;
export const DEFAULT_METRIC_WINDOW_HOURS = 72;
export const DEFAULT_METRIC_CAPPING = "";
export const DEFAULT_METRIC_CAPPING_VALUE = 0;
export const DEFAULT_WIN_RISK_THRESHOLD = 0.0025;
export const DEFAULT_LOSE_RISK_THRESHOLD = 0.0125;

// Bayesian prior
export const DEFAULT_PROPER_PRIOR_STDDEV = 0.3;

export const DEFAULT_MAX_PERCENT_CHANGE = 0.5;
export const DEFAULT_MIN_PERCENT_CHANGE = 0.005;
export const DEFAULT_MIN_SAMPLE_SIZE = 150;

// Regression Adjustment (CUPED):
export const DEFAULT_REGRESSION_ADJUSTMENT_ENABLED = false;
export const DEFAULT_REGRESSION_ADJUSTMENT_DAYS = 14;

// Sequential Testing:
export const DEFAULT_SEQUENTIAL_TESTING_TUNING_PARAMETER = 5000;

// Query settings
export const DEFAULT_TEST_QUERY_DAYS = 30;

// Dimension name constants:
export const EXPOSURE_DATE_DIMENSION_NAME = "dim_exposure_date";
export const AUTOMATIC_DIMENSION_OTHER_NAME = "__Other__";
// Colors:
// export const variant_null = "#999";
// export const variant_0 = "#4f69ff";
// export const variant_1 = "#03d1ca";
// export const variant_2 = "#fd7e14";
// export const variant_3 = "#e83e8c";

export const GROWTHBOOK_SECURE_ATTRIBUTE_SALT = "eg8amUur5GunJXCfgjwB";

// Health
export const DEFAULT_MULTIPLE_EXPOSURES_MINIMUM_COUNT = 10;
export const DEFAULT_MULTIPLE_EXPOSURES_MINIMUM_PERCENT = 0.01;
