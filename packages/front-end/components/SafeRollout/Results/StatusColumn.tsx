import clsx from "clsx";
import { SnapshotMetric } from "back-end/types/experiment-snapshot";
import { HiOutlineExclamationCircle } from "react-icons/hi";
import { DetailedHTMLProps, TdHTMLAttributes } from "react";
import { PValueCorrection } from "back-end/types/stats";
import { pValueFormatter, RowResults } from "@/services/experiments";
import NotEnoughData from "@/components/Experiment/NotEnoughData";
import { GBSuspicious } from "@/components/Icons";
import NoScaledImpact from "@/components/Experiment/NoScaledImpact";

interface Props
  extends DetailedHTMLProps<
    TdHTMLAttributes<HTMLTableCellElement>,
    HTMLTableCellElement
  > {
  stats: SnapshotMetric;
  baseline: SnapshotMetric;
  rowResults: RowResults;
  showRisk?: boolean;
  showSuspicious?: boolean;
  showPercentComplete?: boolean;
  showTimeRemaining?: boolean;
  showGuardrailWarning?: boolean;
  className?: string;
  hideScaledImpact?: boolean;
}

export default function StatusColumn({
  stats,
  baseline,
  rowResults,
  showRisk = true,
  showSuspicious = true,
  showPercentComplete = false,
  showTimeRemaining = true,
  showGuardrailWarning = false,
  className,
  hideScaledImpact = false,
  ...otherProps
}: Props) {
  const pValText =
    rowResults.resultsStatus === "lost" && rowResults.significant
      ? "Failing"
      : "Neutral";

  const shouldRenderRisk =
    showRisk &&
    rowResults.riskMeta.showRisk &&
    ["warning", "danger"].includes(rowResults.riskMeta.riskStatus) &&
    rowResults.resultsStatus !== "lost";

  return (
    <td
      className={clsx("variation chance align-middle", className)}
      {...otherProps}
    >
      {!baseline?.value || !stats?.value ? (
        <em className="text-gray font-weight-normal">no data</em>
      ) : hideScaledImpact ? (
        <NoScaledImpact />
      ) : !rowResults.enoughData ? (
        <NotEnoughData
          rowResults={rowResults}
          showTimeRemaining={showTimeRemaining}
          showPercentComplete={showPercentComplete}
        />
      ) : (
        <div className="d-flex align-items-center justify-content-end">
          <div className="result-number d-inline-block">{pValText}</div>
          {shouldRenderRisk ? (
            <span
              className={rowResults.riskMeta.riskStatus}
              style={{ marginLeft: 1 }}
            >
              <HiOutlineExclamationCircle />
            </span>
          ) : null}
          {showGuardrailWarning &&
          rowResults.guardrailWarning &&
          !shouldRenderRisk ? (
            <span className="warning" style={{ marginLeft: 1 }}>
              <HiOutlineExclamationCircle />
            </span>
          ) : null}
          {showSuspicious && rowResults.suspiciousChange ? (
            <span className="suspicious" style={{ marginLeft: 1 }}>
              <GBSuspicious />
            </span>
          ) : null}
        </div>
      )}
    </td>
  );
}
