import {
  ExperimentAnalysisSummaryResultsStatus,
  ExperimentAnalysisSummaryVariationStatus,
  DecisionCriteriaRule,
} from "back-end/types/experiment";
import {
  getDecisionFrameworkStatus,
  evaluateDecisionRuleOnVariation,
  getVariationDecisions,
} from "../src/enterprise/decision-criteria/decisionCriteria";
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
    expect(shipDecision).toEqual({
      status: "ship-now",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: false,
    });

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
    expect(discussDecision).toEqual({
      status: "rollback-now",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: false,
    });

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
    expect(negDecision).toEqual({
      status: "rollback-now",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: false,
    });

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
    expect(decision).toEqual({
      status: "ship-now",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: true,
    });

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
    expect(noDecision).toEqual({
      status: "ready-for-review",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: true,
    });

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
    expect(guardrailDecision).toEqual({
      status: "rollback-now",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: true,
    });

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
    expect(negDecision).toEqual({
      status: "rollback-now",
      variationIds: ["1"],
      sequentialUsed: false,
      powerReached: true,
    });

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
    expect(negDecisionTwoVar).toEqual({
      status: "rollback-now",
      variationIds: ["1", "2"],
      sequentialUsed: false,
      powerReached: true,
    });

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
    expect(ambiguousDecisionTwoVar).toEqual({
      status: "ready-for-review",
      variationIds: ["2"],
      sequentialUsed: false,
      powerReached: true,
    });
  });
});

describe("evaluateDecisionRuleOnVariation", () => {
  const baseVariationStatus: ExperimentAnalysisSummaryVariationStatus = {
    variationId: "1",
    goalMetrics: {},
    guardrailMetrics: {},
  };

  it("evaluates goal metrics with 'all' match condition", () => {
    const rule: DecisionCriteriaRule = {
      conditions: [
        {
          metrics: "goals" as const,
          match: "all" as const,
          direction: "statsigWinner" as const,
        },
      ],
      action: "ship" as const,
    };

    // All metrics winning - should match
    const allWinning = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
          metric2: { status: "won", superStatSigStatus: "won" },
        },
      },
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(allWinning).toEqual("ship");

    // One metric losing - should not match
    const oneLosing = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
          metric2: { status: "lost", superStatSigStatus: "lost" },
        },
      },
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(oneLosing).toBeUndefined();
  });

  it("evaluates goal metrics with 'any' match condition", () => {
    const rule: DecisionCriteriaRule = {
      conditions: [
        {
          metrics: "goals" as const,
          match: "any" as const,
          direction: "statsigWinner" as const,
        },
      ],
      action: "ship" as const,
    };

    // One metric winning - should match
    const oneWinning = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
          metric2: { status: "lost", superStatSigStatus: "lost" },
        },
      },
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(oneWinning).toEqual("ship");

    // No metrics winning - should not match
    const noneWinning = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "lost", superStatSigStatus: "lost" },
          metric2: { status: "lost", superStatSigStatus: "lost" },
        },
      },
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(noneWinning).toBeUndefined();
  });

  it("evaluates goal metrics with 'none' match condition", () => {
    const rule: DecisionCriteriaRule = {
      conditions: [
        {
          metrics: "goals" as const,
          match: "none" as const,
          direction: "statsigLoser" as const,
        },
      ],
      action: "ship" as const,
    };

    // No metrics losing - should match
    const noneLosing = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
          metric2: { status: "won", superStatSigStatus: "won" },
        },
      },
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(noneLosing).toEqual("ship");

    // One metric losing - should not match
    const oneLosing = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
          metric2: { status: "lost", superStatSigStatus: "lost" },
        },
      },
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(oneLosing).toBeUndefined();
  });

  it("evaluates guardrail metrics correctly", () => {
    const rule: DecisionCriteriaRule = {
      conditions: [
        {
          metrics: "guardrails" as const,
          match: "all" as const,
          direction: "statsigLoser" as const,
        },
      ],
      action: "rollback" as const,
    };

    // All guardrails losing - should match
    const allWinning = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        guardrailMetrics: {
          guardrail1: { status: "lost" },
          guardrail2: { status: "lost" },
        },
      },
      goalMetrics: [],
      guardrailMetrics: ["guardrail1", "guardrail2"],
      requireSuperStatSig: false,
    });
    expect(allWinning).toEqual("rollback");

    // One guardrail losing - should not match
    const oneLosing = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        guardrailMetrics: {
          guardrail1: { status: "neutral" },
          guardrail2: { status: "lost" },
        },
      },
      goalMetrics: [],
      guardrailMetrics: ["guardrail1", "guardrail2"],
      requireSuperStatSig: false,
    });
    expect(oneLosing).toBeUndefined();
  });

  it("respects requireSuperStatSig flag", () => {
    const rule: DecisionCriteriaRule = {
      conditions: [
        {
          metrics: "goals" as const,
          match: "all" as const,
          direction: "statsigWinner" as const,
        },
      ],
      action: "ship" as const,
    };

    // With requireSuperStatSig=true, should check superStatSigStatus
    const superStatSigRequired = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "neutral" },
        },
      },
      goalMetrics: ["metric1"],
      guardrailMetrics: [],
      requireSuperStatSig: true,
    });
    expect(superStatSigRequired).toBeUndefined();

    // With requireSuperStatSig=false, should check regular status
    const superStatSigNotRequired = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "neutral" },
        },
      },
      goalMetrics: ["metric1"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });
    expect(superStatSigNotRequired).toEqual("ship");
  });

  it("handles multiple conditions", () => {
    const rule: DecisionCriteriaRule = {
      conditions: [
        {
          metrics: "goals" as const,
          match: "all" as const,
          direction: "statsigWinner" as const,
        },
        {
          metrics: "guardrails" as const,
          match: "none" as const,
          direction: "statsigLoser" as const,
        },
      ],
      action: "ship" as const,
    };

    // All conditions met - should match
    const allConditionsMet = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
        },
        guardrailMetrics: {
          guardrail1: { status: "neutral" },
        },
      },
      goalMetrics: ["metric1"],
      guardrailMetrics: ["guardrail1"],
      requireSuperStatSig: false,
    });
    expect(allConditionsMet).toEqual("ship");

    // One condition not met - should not match
    const oneConditionNotMet = evaluateDecisionRuleOnVariation({
      rule,
      variationStatus: {
        ...baseVariationStatus,
        goalMetrics: {
          metric1: { status: "won", superStatSigStatus: "won" },
        },
        guardrailMetrics: {
          guardrail1: { status: "lost" },
        },
      },
      goalMetrics: ["metric1"],
      guardrailMetrics: ["guardrail1"],
      requireSuperStatSig: false,
    });
    expect(oneConditionNotMet).toBeUndefined();
  });

  // TODO trending loser
});

describe("getVariationDecisions", () => {
  const baseResultsStatus: ExperimentAnalysisSummaryResultsStatus = {
    variations: [
      {
        variationId: "1",
        goalMetrics: {},
        guardrailMetrics: {},
      },
      {
        variationId: "2",
        goalMetrics: {},
        guardrailMetrics: {},
      },
    ],
    settings: { sequentialTesting: false },
  };

  it("applies rules to each variation and returns default action if no rules match", () => {
    const decisionCriteria = {
      id: "test-criteria-1",
      name: "Test Criteria 1",
      rules: [
        {
          conditions: [
            {
              metrics: "goals" as const,
              match: "all" as const,
              direction: "statsigWinner" as const,
            },
          ],
          action: "ship" as const,
        },
      ],
      defaultAction: "review" as const,
    };

    const results = getVariationDecisions({
      resultsStatus: baseResultsStatus,
      decisionCriteria,
      goalMetrics: ["metric1"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });

    expect(results).toEqual([
      { variationId: "1", decisionCriteriaAction: "review" },
      { variationId: "2", decisionCriteriaAction: "review" },
    ]);
  });

  it("applies matching rules to variations", () => {
    const decisionCriteria = {
      id: "test-criteria-2",
      name: "Test Criteria 2",
      rules: [
        {
          conditions: [
            {
              metrics: "goals" as const,
              match: "all" as const,
              direction: "statsigWinner" as const,
            },
          ],
          action: "ship" as const,
        },
        {
          conditions: [
            {
              metrics: "goals" as const,
              match: "all" as const,
              direction: "statsigLoser" as const,
            },
          ],
          action: "rollback" as const,
        },
      ],
      defaultAction: "review" as const,
    };

    const results = getVariationDecisions({
      resultsStatus: {
        ...baseResultsStatus,
        variations: [
          {
            variationId: "1",
            goalMetrics: {
              metric1: { status: "won", superStatSigStatus: "won" },
            },
            guardrailMetrics: {},
          },
          {
            variationId: "2",
            goalMetrics: {
              metric1: { status: "lost", superStatSigStatus: "lost" },
            },
            guardrailMetrics: {},
          },
        ],
        settings: { sequentialTesting: false },
      },
      decisionCriteria,
      goalMetrics: ["metric1"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });

    expect(results).toEqual([
      { variationId: "1", decisionCriteriaAction: "ship" },
      { variationId: "2", decisionCriteriaAction: "rollback" },
    ]);
  });

  it("applies first matching rule to each variation", () => {
    const decisionCriteria = {
      id: "test-criteria-3",
      name: "Test Criteria 3",
      rules: [
        {
          conditions: [
            {
              metrics: "goals" as const,
              match: "any" as const,
              direction: "statsigWinner" as const,
            },
          ],
          action: "ship" as const,
        },
        {
          conditions: [
            {
              metrics: "goals" as const,
              match: "all" as const,
              direction: "statsigWinner" as const,
            },
          ],
          action: "review" as const,
        },
      ],
      defaultAction: "rollback" as const,
    };

    const results = getVariationDecisions({
      resultsStatus: {
        ...baseResultsStatus,
        variations: [
          {
            variationId: "1",
            goalMetrics: {
              metric1: { status: "won", superStatSigStatus: "won" },
              metric2: { status: "lost", superStatSigStatus: "lost" },
            },
            guardrailMetrics: {},
          },
          {
            variationId: "2",
            goalMetrics: {
              metric1: { status: "won", superStatSigStatus: "won" },
              metric2: { status: "won", superStatSigStatus: "won" },
            },
            guardrailMetrics: {},
          },
        ],
        settings: { sequentialTesting: false },
      },
      decisionCriteria,
      goalMetrics: ["metric1", "metric2"],
      guardrailMetrics: [],
      requireSuperStatSig: false,
    });

    // Both variations match the first rule (any metric winning)
    expect(results).toEqual([
      { variationId: "1", decisionCriteriaAction: "ship" },
      { variationId: "2", decisionCriteriaAction: "ship" },
    ]);
  });

  it("handles guardrail metrics correctly", () => {
    const decisionCriteria = {
      id: "test-criteria-4",
      name: "Test Criteria 4",
      rules: [
        {
          conditions: [
            {
              metrics: "guardrails" as const,
              match: "all" as const,
              direction: "statsigLoser" as const,
            },
          ],
          action: "rollback" as const,
        },
      ],
      defaultAction: "review" as const,
    };

    const results = getVariationDecisions({
      resultsStatus: {
        ...baseResultsStatus,
        variations: [
          {
            variationId: "1",
            goalMetrics: {},
            guardrailMetrics: {
              guardrail1: { status: "lost" },
              guardrail2: { status: "lost" },
            },
          },
          {
            variationId: "2",
            goalMetrics: {},
            guardrailMetrics: {
              guardrail1: { status: "neutral" },
              guardrail2: { status: "lost" },
            },
          },
        ],
        settings: { sequentialTesting: false },
      },
      decisionCriteria,
      goalMetrics: [],
      guardrailMetrics: ["guardrail1", "guardrail2"],
      requireSuperStatSig: false,
    });

    expect(results).toEqual([
      { variationId: "1", decisionCriteriaAction: "rollback" },
      { variationId: "2", decisionCriteriaAction: "review" },
    ]);
  });

  it("respects requireSuperStatSig flag", () => {
    const decisionCriteria = {
      id: "test-criteria-5",
      name: "Test Criteria 5",
      rules: [
        {
          conditions: [
            {
              metrics: "goals" as const,
              match: "all" as const,
              direction: "statsigWinner" as const,
            },
          ],
          action: "ship" as const,
        },
      ],
      defaultAction: "review" as const,
    };

    const results = getVariationDecisions({
      resultsStatus: {
        ...baseResultsStatus,
        variations: [
          {
            variationId: "1",
            goalMetrics: {
              metric1: { status: "won", superStatSigStatus: "neutral" },
            },
            guardrailMetrics: {},
          },
          {
            variationId: "2",
            goalMetrics: {
              metric1: { status: "won", superStatSigStatus: "won" },
            },
            guardrailMetrics: {},
          },
        ],
        settings: { sequentialTesting: false },
      },
      decisionCriteria,
      goalMetrics: ["metric1"],
      guardrailMetrics: [],
      requireSuperStatSig: true,
    });

    expect(results).toEqual([
      { variationId: "1", decisionCriteriaAction: "review" },
      { variationId: "2", decisionCriteriaAction: "ship" },
    ]);
  });
});
