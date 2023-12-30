import { UseFormReturn } from "react-hook-form";
import {
  ExperimentInterfaceStringDates,
  ExperimentPhaseStringDates,
  ExperimentTargetingData,
} from "back-end/types/experiment";
import React, { useEffect, useMemo, useState } from "react";
import {
  FaCheck,
  FaExclamationCircle,
  FaExternalLinkAlt,
} from "react-icons/fa";
import clsx from "clsx";
import { MdInfoOutline } from "react-icons/md";
import { ImBlocked } from "react-icons/im";
import { BiHide, BiShow } from "react-icons/bi";
import useOrgSettings from "@/hooks/useOrgSettings";
import PremiumTooltip from "@/components/Marketing/PremiumTooltip";
import usePermissions from "@/hooks/usePermissions";
import {
  ChangeType,
  ReleasePlan,
} from "@/components/Experiment/EditTargetingModal";
import TargetingInfo from "@/components/Experiment/TabbedPage/TargetingInfo";
import SelectField from "../Forms/SelectField";
import Tooltip from "../Tooltip/Tooltip";

interface RecommendedRolloutData {
  recommendedReleasePlan: ReleasePlan | undefined;
  actualReleasePlan: ReleasePlan | undefined;
  riskLevel: "safe" | "warning" | "danger";
  disableSamePhase: boolean;
  reasons: {
    moreRestrictiveTargeting?: boolean;
    otherTargetingChanges?: boolean;
    decreaseCoverage?: boolean;
    addToNamespace?: boolean;
    decreaseNamespaceRange?: boolean;
    otherNamespaceChanges?: boolean;
    changeVariationWeights?: boolean;
    disableVariation?: boolean;
  };
}
function getRecommendedRolloutData({
  experiment,
  data,
  stickyBucketing,
}: {
  experiment: ExperimentInterfaceStringDates;
  data: ExperimentTargetingData;
  stickyBucketing: boolean;
}) {
  const lastPhase: ExperimentPhaseStringDates | undefined =
    experiment.phases[experiment.phases.length - 1];

  let recommendedReleasePlan: ReleasePlan | undefined = undefined;
  let actualReleasePlan: ReleasePlan | undefined = undefined;
  let riskLevel: "safe" | "warning" | "danger" = "safe";
  let disableSamePhase = false;

  // Returned meta:
  let reasons: RecommendedRolloutData["reasons"] = {};

  // Decision variables (1-8):
  let moreRestrictiveTargeting = false;
  let otherTargetingChanges = false;
  let decreaseCoverage = false;
  let addToNamespace = false;
  let decreaseNamespaceRange = false;
  const otherNamespaceChanges = false;
  let changeVariationWeights = false;
  const disableVariation = false;

  // Assign decision variables (1-8)
  // ===============================

  // 1. More restrictive targeting (conditions)?
  // Remove outer curly braces from condition so we can use it to look for substrings
  // e.g. If they have 3 conditions ANDed together and delete one, that is a safe change
  // But if they add new conditions or modify an existing one, that is not
  // There are some edge cases with '$or' that are not handled correctly, but those are super rare
  const strippedCondition = data.condition.slice(1).slice(0, -1);
  if (!(lastPhase.condition || "").includes(strippedCondition)) {
    moreRestrictiveTargeting = true;
  }
  // todo: find a cleaner way of comparing saved groups
  const savedGroupJson = JSON.stringify(data.savedGroups || []);
  const lastPhaseSavedGroupJson = JSON.stringify(lastPhase.savedGroups || []);
  // 1. More restrictive targeting (saved groups)?
  if (savedGroupJson.length > lastPhaseSavedGroupJson.length) {
    moreRestrictiveTargeting = true;
  }
  // 2. Other targeting changes (saved groups)?
  if (savedGroupJson.length < lastPhaseSavedGroupJson.length) {
    otherTargetingChanges = true;
  }

  // 3. Decrease coverage?
  if (data.coverage < (lastPhase.coverage ?? 1)) {
    decreaseCoverage = true;
  }

  // 4. Add to namespace?
  if (
    data.namespace.enabled &&
    (!lastPhase.namespace.enabled ||
      data.namespace.name !== lastPhase.namespace?.name)
  ) {
    addToNamespace = true;
  }

  // 5. Decrease namespace range?
  if (
    data.namespace.enabled &&
    lastPhase.namespace.enabled &&
    data.namespace.name === lastPhase.namespace.name
  ) {
    const namespaceRange = data.namespace.range ?? [0, 1];
    const lastNamespaceRange = lastPhase.namespace.range ?? [0, 1];
    if (
      namespaceRange[0] > lastNamespaceRange[0] ||
      namespaceRange[1] < lastNamespaceRange[1]
    ) {
      decreaseNamespaceRange = true;
    }
  }

  // 6. Other namespace changes?
  // nothing here yet

  // 7.
  // Changing variation weights will almost certainly cause an SRM error
  if (
    JSON.stringify(data.variationWeights) !==
    JSON.stringify(lastPhase.variationWeights)
  ) {
    changeVariationWeights = true;
  }

  // // 8. Disable variation?
  // todo: blocked variations not implemented yet

  // Make recommendations, control available options
  // --> based on decision variables (1-8) and sticky bucketing support
  // ===============================

  // A. Nothing risky has changed
  if (
    !moreRestrictiveTargeting &&
    !otherTargetingChanges &&
    !decreaseCoverage &&
    !addToNamespace &&
    !decreaseNamespaceRange &&
    !otherNamespaceChanges &&
    !changeVariationWeights &&
    !disableVariation
  ) {
    // recommend no release changes
    recommendedReleasePlan = "same-phase-sticky";
    actualReleasePlan = stickyBucketing
      ? recommendedReleasePlan
      : "same-phase-everyone";
  } else {
    // B. Calculate recommendations as if sticky bucketing is enabled
    // (We will override these later if it is not. Calculating this allows us to
    // show the user the benefits of enabling sticky bucketing)
    if (moreRestrictiveTargeting || decreaseCoverage || disableVariation) {
      // safe
      recommendedReleasePlan = "same-phase-sticky";
      actualReleasePlan = recommendedReleasePlan;
      riskLevel = "safe";
    }
    if (otherTargetingChanges) {
      // warning
      recommendedReleasePlan = "new-phase";
      actualReleasePlan = recommendedReleasePlan;
      riskLevel = "warning";
      reasons = { ...reasons, otherTargetingChanges };
    }
    if (
      addToNamespace ||
      decreaseNamespaceRange ||
      otherNamespaceChanges ||
      changeVariationWeights
    ) {
      // danger
      recommendedReleasePlan = "new-phase";
      actualReleasePlan = recommendedReleasePlan;
      disableSamePhase = true;
      riskLevel = "danger";
      reasons = {
        ...reasons,
        addToNamespace,
        decreaseNamespaceRange,
        otherNamespaceChanges,
        changeVariationWeights,
      };
    }

    // C. Calculate recommendations when sticky bucketing is disabled
    if (!stickyBucketing) {
      // reset
      actualReleasePlan = "same-phase-everyone";
      riskLevel = "safe";
      disableSamePhase = false;
      reasons = {};

      if (
        moreRestrictiveTargeting ||
        decreaseCoverage ||
        addToNamespace ||
        decreaseNamespaceRange
      ) {
        // warning
        actualReleasePlan = "new-phase";
        riskLevel = "warning";
        reasons = {
          ...reasons,
          moreRestrictiveTargeting,
          decreaseCoverage,
          addToNamespace,
          decreaseNamespaceRange,
        };
      }
      if (
        otherTargetingChanges ||
        otherNamespaceChanges ||
        changeVariationWeights ||
        disableVariation
      ) {
        // danger
        actualReleasePlan = "new-phase";
        disableSamePhase = true;
        riskLevel = "danger";
        reasons = {
          ...reasons,
          otherTargetingChanges,
          otherNamespaceChanges,
          changeVariationWeights,
          disableVariation,
        };
      }
    }
  }

  return {
    recommendedReleasePlan,
    actualReleasePlan,
    riskLevel,
    disableSamePhase,
    reasons,
  };
}

export interface Props {
  experiment: ExperimentInterfaceStringDates;
  form: UseFormReturn<ExperimentTargetingData>;
  changeType?: ChangeType;
  releasePlan?: ReleasePlan;
  setReleasePlan: (releasePlan: ReleasePlan) => void;
}

export default function ReleaseChangesForm({
  experiment,
  form,
  changeType,
  releasePlan,
  setReleasePlan,
}: Props) {
  const permissions = usePermissions();
  const settings = useOrgSettings();
  const orgStickyBucketing = !!settings.useStickyBucketing;
  const usingStickyBucketing =
    orgStickyBucketing && !experiment.disableStickyBucketing;

  const [showFullTargetingInfo, setShowFullTargetingInfo] = useState(false);

  const lastPhase: ExperimentPhaseStringDates | undefined =
    experiment.phases[experiment.phases.length - 1];

  const formValues = form.getValues();

  const recommendedRolloutData = useMemo(
    () =>
      getRecommendedRolloutData({
        experiment,
        data: formValues,
        stickyBucketing: usingStickyBucketing,
      }),
    [experiment, formValues, usingStickyBucketing]
  );

  // set the release plan selector to the recommended value
  useEffect(() => {
    if (releasePlan) return; // only set if use hasn't interacted
    if (changeType === "phase") return;
    if (recommendedRolloutData.actualReleasePlan) {
      setReleasePlan(recommendedRolloutData.actualReleasePlan);
    }
  }, [
    recommendedRolloutData.actualReleasePlan,
    releasePlan,
    setReleasePlan,
    changeType,
  ]);

  // set the default values for each of the user prompt options
  useEffect(() => {
    if (releasePlan === "same-phase-sticky") {
      form.setValue("newPhase", false);
      form.setValue("reseed", false);
      form.setValue("bucketVersion", experiment.bucketVersion);
      form.setValue("minBucketVersion", experiment.minBucketVersion);
    } else if (releasePlan === "same-phase-everyone") {
      form.setValue("newPhase", false);
      form.setValue("reseed", false);
      form.setValue("bucketVersion", (experiment.bucketVersion ?? 0) + 1);
      form.setValue("minBucketVersion", (experiment.bucketVersion ?? 0) + 1);
    } else if (releasePlan === "new-phase") {
      form.setValue("newPhase", true);
      form.setValue("reseed", true);
      form.setValue("bucketVersion", (experiment.bucketVersion ?? 0) + 1);
      form.setValue("minBucketVersion", experiment.minBucketVersion ?? 0);
    }
    if (!usingStickyBucketing) {
      form.setValue("bucketVersion", experiment.bucketVersion);
      form.setValue("minBucketVersion", experiment.minBucketVersion);
    }
  }, [
    releasePlan,
    usingStickyBucketing,
    form,
    experiment.bucketVersion,
    experiment.minBucketVersion,
  ]);

  if (!lastPhase) return null;

  return (
    <div className="mt-4 mb-2">
      <SelectField
        label="Release plan"
        value={releasePlan || ""}
        options={[
          { label: "New Phase, re-randomize traffic", value: "new-phase" },
          ...(changeType !== "phase" && !recommendedRolloutData.disableSamePhase
            ? [
                {
                  label: "Same Phase, apply changes to new traffic only",
                  value: "same-phase-sticky",
                },
                {
                  label: "Same Phase, apply changes to everyone",
                  value: "same-phase-everyone",
                },
              ]
            : []),
        ]}
        onChange={(v) => {
          const requiresStickyBucketing =
            v === "same-phase-sticky" || v === "same-phase-everyone";
          const disabled = requiresStickyBucketing && !usingStickyBucketing;
          if (disabled) return;
          setReleasePlan(v as ReleasePlan);
        }}
        sort={false}
        isSearchable={false}
        formatOptionLabel={({ value, label }) => {
          const requiresStickyBucketing =
            value === "same-phase-sticky" || value === "same-phase-everyone";
          const recommended =
            value === recommendedRolloutData.recommendedReleasePlan;
          const disabled = requiresStickyBucketing && !usingStickyBucketing;
          return (
            <div
              className={clsx({
                "cursor-disabled": disabled,
              })}
            >
              <span style={{ opacity: disabled ? 0.5 : 1 }}>{label} </span>
              {requiresStickyBucketing && (
                <Tooltip
                  body={`${
                    usingStickyBucketing ? "Uses" : "Requires"
                  } Sticky Bucketing`}
                  className="mr-2"
                >
                  <span
                    className="badge badge-muted-info badge-pill ml-2 position-relative"
                    style={{ zIndex: 1, fontSize: "10px" }}
                  >
                    SB
                  </span>
                </Tooltip>
              )}
              {recommended && (
                <span className="badge badge-purple badge-pill ml-2">
                  recommended
                </span>
              )}
            </div>
          );
        }}
      />
      {recommendedRolloutData && changeType !== "phase" && (
        <TargetingChangeTooltips
          recommendedRolloutData={recommendedRolloutData}
          releasePlan={releasePlan}
          usingStickyBucketingOption={[
            "same-phase-sticky",
            "same-phase-everyone",
          ].includes(releasePlan ?? "")}
          hasStickyBucketing={usingStickyBucketing}
        />
      )}

      <div className="mt-4">
        <label>Release plan details</label>
        <div className="d-flex appbox bg-light px-2 py-2">
          <div className="col-6">
            <div className="row">
              <div className="col">
                <label className="mb-1">New phase?</label>
                <div className="mt-1 font-weight-bold">
                  {!form.watch("newPhase")
                    ? "No"
                    : form.watch("reseed")
                    ? "Yes, new random seed"
                    : "Yes, same random seed"}
                </div>
              </div>
            </div>
          </div>
          <div className="col-6">
            <div className="d-flex align-items-end mb-2">
              <label className="mb-0 mr-3">
                <PremiumTooltip
                  commercialFeature="sticky-bucketing"
                  popperStyle={{ maxWidth: 530 }}
                  body={
                    <>
                      <div className="mb-3">
                        <div className="mb-1">
                          Sticky Bucketing is{" "}
                          <strong>
                            {orgStickyBucketing ? "enabled" : "disabled"}
                          </strong>{" "}
                          for your organization.
                        </div>
                        {experiment.disableStickyBucketing && (
                          <div>
                            Sticky Bucketing is <strong>disabled</strong> in
                            this experiment.
                          </div>
                        )}
                      </div>
                      <div className="mb-2">
                        Sticky Bucketing allows you to persist a user&apos;s
                        assigned variation if any of the following change:
                        <ol className="mt-1 mb-2" type="a">
                          <li>the user logs in or logs out</li>
                          <li>experiment targeting conditions change</li>
                          <li>experiment traffic rules change</li>
                        </ol>
                      </div>
                      <div className="mb-4">
                        Enabling Sticky Bucketing also allows you to set fine
                        controls over bucketing behavior, such as:
                        <ul className="mt-1 mb-2">
                          <li>
                            assigning variations based on both a{" "}
                            <code>user_id</code> and <code>anonymous_id</code>
                          </li>
                          <li>invalidating existing buckets</li>
                        </ul>
                      </div>
                      <div className="mb-2">
                        Sticky Bucketing is only supported in the following SDKs
                        and versions:
                        <ul className="mb-1">
                          <li>Javascript &gt;= 0.32.0</li>
                          <li>React &gt;= 0.22.0</li>
                        </ul>
                        Unsupported SDKs will fall back to standard hash-based
                        bucketing.
                      </div>
                      <div className="text-warning-orange">
                        <FaExclamationCircle /> You must enable this feature in
                        your SDK integration code for it to take effect.
                      </div>
                    </>
                  }
                >
                  Sticky bucketing <MdInfoOutline className="text-info" />
                </PremiumTooltip>
              </label>
              <div className="flex-1" />
              <div className="small position-relative" style={{ top: -3 }}>
                {usingStickyBucketing ? (
                  <span className="text-success">
                    <FaCheck className="mr-1" />
                    enabled
                  </span>
                ) : (
                  <span className="text-danger">
                    <ImBlocked className="mr-1" />
                    {!orgStickyBucketing ? (
                      <>
                        disabled by org
                        {permissions.organizationSettings && (
                          <Tooltip
                            className="ml-2"
                            body="Enable for your organization"
                          >
                            <a
                              className="pl-1"
                              href="/settings"
                              target="_blank"
                            >
                              <FaExternalLinkAlt />
                            </a>
                          </Tooltip>
                        )}
                      </>
                    ) : (
                      <>disabled by experiment</>
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="row">
              <div className="col">
                {!usingStickyBucketing ? (
                  <></>
                ) : (
                  <div>
                    <label className="mb-0 mr-2">Bucketed users will:</label>
                    <span className="font-weight-bold">
                      {(form.watch("bucketVersion") ?? 0) <=
                      (experiment.bucketVersion ?? 0)
                        ? "Keep their assigned bucket"
                        : (form.watch("minBucketVersion") ?? 0) <=
                          (experiment.minBucketVersion ?? 0)
                        ? "Be reassigned"
                        : "Be excluded from the experiment"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {changeType !== "phase" && (
        <div className="mt-4 mb-1">
          <div className="d-flex">
            <label>Targeting changes</label>
            <div className="flex-1" />
            <div className="position-relative small" style={{ bottom: -6 }}>
              <a
                role="button"
                className="a ml-3"
                onClick={() => setShowFullTargetingInfo(!showFullTargetingInfo)}
              >
                {showFullTargetingInfo ? (
                  <>
                    <BiHide /> Show changes only
                  </>
                ) : (
                  <>
                    <BiShow /> Show full targeting
                  </>
                )}
              </a>
            </div>
          </div>
          <div className="appbox bg-light px-3 pt-3 pb-0 mb-0">
            <TargetingInfo
              experiment={experiment}
              noHeader={true}
              targetingFieldsOnly={true}
              separateTrafficSplitDisplay={true}
              showDecimals={true}
              showNamespaceRanges={true}
              showChanges={true}
              showFullTargetingInfo={showFullTargetingInfo}
              changes={form.getValues()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TargetingChangeTooltips({
  recommendedRolloutData,
  releasePlan = "",
  usingStickyBucketingOption = false,
  hasStickyBucketing = false,
}: {
  recommendedRolloutData: RecommendedRolloutData;
  releasePlan?: ReleasePlan;
  usingStickyBucketingOption?: boolean;
  hasStickyBucketing: boolean;
}) {
  const switchToSB = !usingStickyBucketingOption && hasStickyBucketing;
  let riskLevel = recommendedRolloutData.riskLevel;
  if (releasePlan === recommendedRolloutData.actualReleasePlan) {
    riskLevel = "safe";
  }
  return (
    <div
      className={clsx("alert", {
        "alert-success": riskLevel === "safe",
        "alert-warning": ["warning", "danger"].includes(riskLevel),
      })}
    >
      {riskLevel === "safe" && (
        <>
          <FaCheck className="mr-1" /> The changes you have made do not impact
          existing bucketed users.
        </>
      )}
      {riskLevel === "warning" && (
        <>
          <FaExclamationCircle className="mr-1" /> The changes you have made may
          impact existing bucketed users.
        </>
      )}
      {riskLevel === "danger" && (
        <>
          <FaExclamationCircle className="mr-1" /> The changes you have made
          have a high risk of impacting existing bucketed users.
        </>
      )}
      {riskLevel !== "safe" && (
        <ul className="mt-1 mb-0 pl-4">
          {recommendedRolloutData.reasons.moreRestrictiveTargeting && (
            <li>
              <strong>More restrictive targeting conditions</strong> may lead to
              carryover bias. Re-randomize traffic
              {switchToSB ? " or use Sticky Bucketing" : ""} to help mitigate.
            </li>
          )}
          {recommendedRolloutData.reasons.otherTargetingChanges && (
            <li>
              <strong>Ambiguous changes to targeting conditions</strong> may
              lead to carryover bias. Re-randomize traffic
              {switchToSB ? " or use Sticky Bucketing" : ""} to help mitigate.
            </li>
          )}
          {recommendedRolloutData.reasons.decreaseCoverage && (
            <li>
              <strong>Decreased traffic coverage</strong> may lead to carryover
              bias. Re-randomize traffic
              {switchToSB ? " or use Sticky Bucketing" : ""} to help mitigate.
            </li>
          )}
          {recommendedRolloutData.reasons.changeVariationWeights && (
            <li>
              <strong>Changing variation weights</strong> could lead to
              statistical bias and/or multiple exposures. Re-randomize traffic
              to help mitigate.
            </li>
          )}
          {recommendedRolloutData.reasons.disableVariation && (
            <li>
              <strong>Disabling or re-enableing a variation</strong> could lead
              to statistical bias and/or multiple exposures. Re-randomize
              traffic to help mitigate.
            </li>
          )}
          {(recommendedRolloutData.reasons.addToNamespace ||
            recommendedRolloutData.reasons.decreaseNamespaceRange ||
            recommendedRolloutData.reasons.otherNamespaceChanges) && (
            <li>
              <strong>More restrictive namespace targeting</strong> may lead to
              carryover bias. Re-randomize traffic
              {switchToSB ? " or enable Sticky Bucketing" : ""} to help
              mitigate.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
