import {
  ExperimentAnalysisSummaryResultsStatus,
  ExperimentAnalysisSummaryVariationStatus,
} from "back-end/types/experiment";
import { getDecisionFrameworkStatus } from "../src/enterprise/decision-criteria";
import { DEFAULT_DECISION_CRITERIA } from "../src/enterprise/decision-criteria/constants";

function setMetricsOnResultsStatus({
  resultsStatus,
  goalMetrics,
  guardrailMetrics,
  secondVariation,
}: {
  resultsStatus: ExperimentAnalysisSummaryResultsStatus;
  goalMetrics?: ExperimentAnalysisSummaryVariationStatus["goalMetrics"];
  guardrailMetrics?: ExperimentAnalysisSummaryVariationStatus["guardrailMetrics"];
  secondVariation?: ExperimentAnalysisSummaryVariationStatus;
}): ExperimentAnalysisSummaryResultsStatus {
  return {
    ...resultsStatus,
    variations: [
      {
        ...resultsStatus.variations[0],
        ...(goalMetrics ? { goalMetrics: goalMetrics } : {}),
        ...(guardrailMetrics ? { guardrailMetrics: guardrailMetrics } : {}),
      },
      ...(secondVariation ? [secondVariation] : []),
    ],
  };
}

describe("default decision tree is correct", () => {
  const resultsStatus: ExperimentAnalysisSummaryResultsStatus = {
    variations: [
      {
        variationId: "1",
        goalMetrics: {},
        guardrailMetrics: {},
      },
    ],
    settings: { sequentialTesting: false },
  };
  it("returns the correct underpowered decisions", () => {
    const daysNeeded = undefined;

    // winning stat sig not enough to trigger any rec
    const noDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "won", superStatSigStatus: "neutral" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(noDecision).toEqual(undefined);

    // losing stat sig not enough to trigger any rec
    const noNegDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "lost", superStatSigStatus: "neutral" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(noNegDecision).toEqual(undefined);

    // super stat sig triggers rec
    const shipDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "won", superStatSigStatus: "won" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(shipDecision?.status).toEqual("ship-now");

    // super stat sig triggers rec with guardrail failure
    const discussDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "won", superStatSigStatus: "won" } },
        guardrailMetrics: {
          "01": { status: "lost" },
        },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: ["01"],
      daysNeeded: undefined,
    });
    expect(discussDecision?.status).toEqual("rollback-now");

    // losing super stat sig triggers rec
    const negDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "lost", superStatSigStatus: "lost" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(negDecision?.status).toEqual("rollback-now");

    // losing super stat sig on one variation not enough
    const somewhatNegDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "lost", superStatSigStatus: "lost" } },
        secondVariation: {
          variationId: "2",
          goalMetrics: {
            "1": { status: "neutral", superStatSigStatus: "neutral" },
          },
          guardrailMetrics: {},
        },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(somewhatNegDecision).toEqual(undefined);
  });

  it("returns the correct powered decisions", () => {
    const daysNeeded = 0;

    // winning stat sig enough to trigger rec
    const decision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "won", superStatSigStatus: "neutral" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(decision?.status).toEqual("ship-now");

    // neutral triggers no decision
    const noDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: {
          "1": { status: "neutral", superStatSigStatus: "neutral" },
        },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(noDecision?.status).toEqual("ready-for-review");

    // Guardrail failure is now default to rollback
    const guardrailDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        guardrailMetrics: { "01": { status: "lost" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: ["01"],
      daysNeeded,
    });
    expect(guardrailDecision?.status).toEqual("rollback-now");

    // losing stat sig enough to trigger any rec
    const negDecision = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "lost", superStatSigStatus: "neutral" } },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(negDecision?.status).toEqual("rollback-now");

    // losing stat sig in two variations also triggers a rec
    const negDecisionTwoVar = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "lost", superStatSigStatus: "neutral" } },
        secondVariation: {
          variationId: "2",
          goalMetrics: {
            "1": { status: "lost", superStatSigStatus: "neutral" },
          },
          guardrailMetrics: {},
        },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(negDecisionTwoVar?.status).toEqual("rollback-now");

    // losing stat sig in only one variation not enough, leads to ready for review
    const ambiguousDecisionTwoVar = getDecisionFrameworkStatus({
      resultsStatus: setMetricsOnResultsStatus({
        resultsStatus,
        goalMetrics: { "1": { status: "lost", superStatSigStatus: "neutral" } },
        secondVariation: {
          variationId: "2",
          goalMetrics: {
            "1": { status: "neutral", superStatSigStatus: "neutral" },
          },
          guardrailMetrics: {},
        },
      }),
      decisionCriteria: DEFAULT_DECISION_CRITERIA,
      goalMetrics: ["1"],
      guardrailMetrics: [],
      daysNeeded,
    });
    expect(ambiguousDecisionTwoVar?.status).toEqual("ready-for-review");
  });
});
