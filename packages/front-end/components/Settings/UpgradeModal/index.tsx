import { useEffect, useState } from "react";
import clsx from "clsx";
import { daysLeft } from "shared/dates";
import Link from "next/link";
import { Flex } from "@radix-ui/themes";
import { FaCheckCircle, FaExternalLinkAlt } from "react-icons/fa";
import { PiCaretRight } from "react-icons/pi";
import { growthbook } from "@/services/utils";
import { useUser } from "@/services/UserContext";
import { getGrowthBookBuild, isCloud } from "@/services/env";
import track from "@/services/track";
import { redirectWithTimeout, useAuth } from "@/services/auth";
import Modal from "@/components/Modal";
import usePermissionsUtil from "@/hooks/usePermissionsUtils";
import Tooltip from "@/components/Tooltip/Tooltip";
import RadioCards from "@/components/Radix/RadioCards";
import styles from "./index.module.scss";
import CloudTrialConfirmationModal from "./CloudTrialConfirmationModal";
import LicenseSuccessModal from "./LicenseSuccessModal";
import PleaseVerifyEmailModal from "./PleaseVerifyEmailModal";
import SelfHostedTrialConfirmationModal from "./SelfHostedTrialConfirmationModal";

export interface Props {
  close: () => void;
  source: string;
  reason: string;
}

export default function UpgradeModal({ close, source }: Props) {
  const [error, setError] = useState("");
  const { apiCall } = useAuth();

  const [loading, setLoading] = useState(false);
  const [
    trialAndUpgradePreference,
    setTrialAndUpgradePreference,
  ] = useState<string>("trial");
  const [showSHProTrial, setShowSHProTrial] = useState(false);
  const [showSHProTrialSuccess, setShowSHProTrialSuccess] = useState(false);
  const [showSHEnterpriseTrial, setShowSHEnterpriseTrial] = useState(false);
  const [
    showSHEnterpriseTrialSuccess,
    setShowSHEnterpriseTrialSuccess,
  ] = useState(false);

  const [showCloudEnterpriseTrial, setShowCloudEnterpriseTrial] = useState(
    false
  );
  const [
    showCloudEnterpriseTrialSuccess,
    setShowCloudEnterpriseTrialSuccess,
  ] = useState(false);
  const [showCloudProTrial, setShowCloudProTrial] = useState(false);
  const [showCloudProTrialSuccess, setShowCloudProTrialSuccess] = useState(
    false
  );

  const {
    name,
    email,
    accountPlan,
    license,
    effectiveAccountPlan,
    commercialFeatureLowestPlan,
    seatsInUse,
  } = useUser();
  const lowestPlanLevel = commercialFeatureLowestPlan?.[source] || undefined;
  let featureFlagValue = "OFF";
  // These are some Upgrade CTAs throughout the app related to enterprise-only features
  // we don't want to show a user the test treatments if that's the case
  // since this test doesn't highlight enterprise features at all.
  if (lowestPlanLevel !== "enterprise") {
    featureFlagValue = growthbook.getFeatureValue("pro-upgrade-modal", "OFF");
  }

  const permissionsUtil = usePermissionsUtil();

  const { organization, refreshOrganization } = useUser();

  const currentUsers =
    (organization.members?.length || 0) + (organization.invites?.length || 0);

  const licensePlanText =
    (accountPlan === "enterprise"
      ? "Enterprise"
      : accountPlan === "pro"
      ? "Pro"
      : accountPlan === "pro_sso"
      ? "Pro + SSO"
      : "Starter") + (license && license.isTrial ? " trial" : "");

  // When signing up to pro, but not finishing the checkout process a license gets generated and saved but has no plan.
  const freeTrialAvailable =
    !license || !license.plan || !license.emailVerified;

  const daysToGo = license ? daysLeft(license.dateExpires) : 0;

  const hasCanceledSubscription =
    ["pro", "pro_sso"].includes(license?.plan || "") &&
    license?.stripeSubscription?.status === "canceled";

  const trackContext = {
    accountPlan,
    source,
    currentUsers,
    freeTrialAvailable,
  };

  useEffect(() => {
    track("View Upgrade Modal", trackContext);
    // Even if accountPlan gets update during this upgrade process, we don't want to call this track call multiple times
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      ["enterprise"].includes(effectiveAccountPlan || "") &&
      !license?.isTrial
    ) {
      close();
    }
  }, [effectiveAccountPlan, license, close]);

  const isAtLeastPro = ["pro", "pro_sso", "enterprise"].includes(
    effectiveAccountPlan || ""
  );
  const proTrialCopy = "free 14-day Pro trial";

  const startPro = async () => {
    setError("");
    setLoading(true);
    try {
      if (
        license?.stripeSubscription &&
        license?.stripeSubscription.status != "canceled"
      ) {
        const res = await apiCall<{ url: string }>(`/subscription/manage`, {
          method: "POST",
        });
        if (res && res.url) {
          track(
            "Start Stripe Checkout For Pro With Existing Subscription",
            trackContext
          );
          await redirectWithTimeout(res.url);
        } else {
          setError("Unknown response");
        }
      } else {
        const resp = await apiCall<{
          status: number;
          session?: { url?: string };
        }>(`/subscription/new`, {
          method: "POST",
          body: JSON.stringify({
            returnUrl: window.location.pathname,
          }),
        });

        setLoading(false);
        if (resp.session?.url) {
          track(
            "Start Stripe Checkout For Pro Without Existing Subscription",
            trackContext
          );
          await redirectWithTimeout(resp.session.url);
        } else {
          setError("Failed to start checkout");
        }
      }
    } catch (e) {
      setLoading(false);
      setError(e.message);
    }
  };

  function startEnterprise() {
    track("Start Enterprise Checkout", trackContext);
    const subject = organization.name
      ? "Inquiry about Enterprise Plan for " + organization.name
      : "Inquiry about Enterprise Plan";
    const mailtoLink = `mailto:sales@growthbook.io?subject=${encodeURIComponent(
      subject
    )}`;
    const newWindow = window.open(mailtoLink, "_blank", "noreferrer");
    if (newWindow) newWindow.opener = null;
  }

  const startProTrial = async function (name?: string, email?: string) {
    setError("");
    try {
      await apiCall<{
        status: number;
        session?: { url?: string };
      }>(`/subscription/new-pro-trial`, {
        method: "POST",
        body: JSON.stringify({
          name: name,
          email: email,
        }),
      });
      track("Generate pro trial license", trackContext);

      if (isCloud()) {
        setShowCloudProTrialSuccess(true);
        setShowCloudProTrial(false);
      } else {
        setShowSHProTrialSuccess(true);
        setShowSHProTrial(false);
      }

      refreshOrganization();
    } catch (e) {
      const txt = e.message;
      track("Generate enterprise pro license error", {
        error: txt,
        ...trackContext,
      });
      setError(
        `There was a server error: ${txt}. Please try again later, or contact us at sales@growthbook.io`
      );
    }
  };

  const startEnterpriseTrial = async function (name?: string, email?: string) {
    setError("");
    try {
      await apiCall<{
        status: number;
        message?: string;
      }>(`/license/enterprise-trial`, {
        method: "POST",
        body: JSON.stringify({
          email: email,
          name: name,
          organizationId: organization.id,
          companyName: organization.name,
          context: {
            organizationCreated: organization.dateCreated,
            currentSeats: currentUsers,
            currentPlan: accountPlan,
            currentBuild: getGrowthBookBuild(),
            ctaSource: source,
          },
        }),
      });
      track("Generate enterprise trial license", trackContext);

      await refreshOrganization();
      if (isCloud()) {
        setShowCloudEnterpriseTrialSuccess(true);
        setShowCloudEnterpriseTrial(false);
      } else {
        setShowSHEnterpriseTrialSuccess(true);
        setShowSHEnterpriseTrial(false);
      }
    } catch (e) {
      const txt = e.message;
      track("Generate enterprise trial license error", {
        error: txt,
        ...trackContext,
      });
      switch (txt) {
        case "active license exists":
          setError(
            "You already have an active license key. Contact us at sales@growthbook.io for more information."
          );
          break;
        case "expired license exists":
          setError(
            "Your license key has already expired. Please contact us at sales@growthbook.io for more information."
          );
          break;
        default:
          setError(
            `There was a server error: ${txt}. Please try again later, or contact us at sales@growthbook.io`
          );
      }
    }
  };

  const upgradeBanner = (
    <>
      <h3 className="mb-0">Upgrade to Pro</h3>
      <p className="text-secondary mb-0">
        Get instance access to advanced experimentation, permissioning and
        security features.
      </p>
    </>
  );

  function trialAndUpgradeTreatment() {
    return (
      <div>
        {upgradeBanner}
        <div className="py-4">
          <RadioCards
            columns="2"
            value={trialAndUpgradePreference}
            setValue={(v) => setTrialAndUpgradePreference(v)}
            options={[
              {
                value: "trial",
                label: "Pro Trial",
                description: "Free for 14 days",
              },
              {
                value: "upgrade",
                label: "Pro",
                description: "Upgrade now. No credit card required.",
              },
            ]}
          />
        </div>
        <p className="text-secondary">
          Continuing will{" "}
          {trialAndUpgradePreference === "trial"
            ? "start a 14-day Pro plan trial for your organization."
            : "require a credit card to purchase a Pro plan for your organization."}
          <a
            href="https://www.growthbook.io/pricing"
            className="text-decoration-none pl-1"
            target="_blank"
            rel="noopener noreferrer"
          >
            <strong className="a link-purple text-decoration-none">
              Learn more <FaExternalLinkAlt className="pl-1" />
            </strong>
          </a>
        </p>
      </div>
    );
  }

  function upgradeOnlyTreatment() {
    return (
      <div>
        {upgradeBanner}
        <div className="py-4">
          <p>
            <Flex align="center">
              <FaCheckCircle className="mr-2" color="blue" />
              <strong>Up to 100 team members</strong>
            </Flex>
          </p>
          <p>
            <Flex align="center">
              <FaCheckCircle className="mr-2" color="blue" />
              <strong>Encrypted SDK endpoint response</strong>
            </Flex>
          </p>
          <p>
            <Flex align="center">
              <FaCheckCircle className="mr-2" color="blue" />
              <strong>
                Advanced experimentation: CUPED, Sequential testing, Bandits and
                more
              </strong>
            </Flex>
          </p>
        </div>
        <div className="p-3" style={{ backgroundColor: "var(--violet-2)" }}>
          <Flex align="center" justify="between">
            <span>
              <label>Cost Estimate</label>
              <Tooltip
                color="purple"
                body="Estimate based on your organization’s activity over the last 30 days. Actual cost may vary depending on future usage patterns."
                className="pl-1"
              />
            </span>
            <label>~${seatsInUse * 20} / month</label>
          </Flex>
          <p className="mb-0 text-secondary">
            $20 per user per month, {seatsInUse} current user
            {seatsInUse > 1 ? "s" : ""}
          </p>
        </div>
      </div>
    );
  }

  function onSubmit() {
    if (
      featureFlagValue === "UPGRADE-ONLY" ||
      trialAndUpgradePreference === "upgrade"
    ) {
      startPro();
    } else {
      startProTrial(name, email);
    }
  }

  return (
    <div>
      {showSHProTrial ? (
        <SelfHostedTrialConfirmationModal
          close={close}
          plan="Pro"
          error={error}
          submit={startProTrial}
        />
      ) : showSHProTrialSuccess ? (
        <PleaseVerifyEmailModal
          close={close}
          plan="Pro"
          isTrial={true}
          reenterEmail={() => {
            setShowSHProTrial(true);
            setShowSHProTrialSuccess(false);
          }}
        />
      ) : showSHEnterpriseTrial ? (
        <SelfHostedTrialConfirmationModal
          close={close}
          plan="Enterprise"
          error={error}
          submit={startEnterpriseTrial}
        />
      ) : showSHEnterpriseTrialSuccess ? (
        <PleaseVerifyEmailModal
          close={close}
          plan="Enterprise"
          isTrial={true}
          reenterEmail={() => {
            setShowSHEnterpriseTrial(true);
            setShowSHEnterpriseTrialSuccess(false);
          }}
        />
      ) : showCloudProTrial ? (
        <CloudTrialConfirmationModal
          plan="Pro"
          close={close}
          error={error}
          submit={() => startProTrial(name, email)}
        />
      ) : showCloudProTrialSuccess ? (
        <LicenseSuccessModal
          plan="Pro"
          close={close}
          header={`🎉 Your 14-day Pro Trial starts now!`}
          isTrial={true}
        />
      ) : showCloudEnterpriseTrial ? (
        <CloudTrialConfirmationModal
          plan="Enterprise"
          close={close}
          error={error}
          submit={() => startEnterpriseTrial(name, email)}
        />
      ) : showCloudEnterpriseTrialSuccess ? (
        <LicenseSuccessModal
          plan="Enterprise"
          close={close}
          header={`🎉 Your 14-day Enterprise Trial starts now!`}
          isTrial={true}
        />
      ) : (
        <Modal
          trackingEventModalType=""
          open={true}
          autoCloseOnSubmit={false}
          includeCloseCta={featureFlagValue !== "OFF" ? true : false}
          close={close}
          size="lg"
          header={<>Get more out of GrowthBook</>}
          loading={loading}
          cta={
            <>
              Continue <PiCaretRight />
            </>
          }
          submit={featureFlagValue !== "OFF" ? () => onSubmit() : undefined}
          ctaEnabled={true}
        >
          {!permissionsUtil.canManageBilling() ? (
            <div className="text-center mt-4 mb-5">
              To upgrade, please contact your system administrator.
            </div>
          ) : (
            <div
              className={clsx(
                "container-fluid dashboard p-3 ",
                styles.upgradeModal
              )}
            >
              {featureFlagValue === "OFF" ? (
                <>
                  {!license?.isTrial &&
                    (daysToGo >= 0 && !hasCanceledSubscription ? (
                      <div className="row bg-main-color p-3 mb-3 rounded">
                        <span>You are currently using the </span>
                        <b className="mx-1"> {licensePlanText} </b> version of
                        Growthbook with{" "}
                        <Link
                          href="/settings/team"
                          className="mx-1 font-weight-bold"
                        >
                          {currentUsers} team members
                        </Link>
                        ↗
                      </div>
                    ) : daysToGo < 0 ? (
                      <div className="row p-3 mb-3 rounded alert-danger">
                        {" "}
                        <span>
                          Your old <b className="mx-1">{licensePlanText}</b>{" "}
                          version of Growthbook with{" "}
                          <Link
                            href="/settings/team"
                            className="mx-1 font-weight-bold"
                          >
                            {currentUsers} team members
                          </Link>
                          ↗ expired. Renew below.
                        </span>
                      </div>
                    ) : (
                      <div className="row p-3 mb-3 rounded alert-danger">
                        {" "}
                        <span>
                          Your old <b className="mx-1">{licensePlanText}</b>{" "}
                          version of Growthbook with{" "}
                          <Link
                            href="/settings/team"
                            className="mx-1 font-weight-bold"
                          >
                            {currentUsers} team members
                          </Link>
                          ↗ was cancelled. Renew below.
                        </span>
                      </div>
                    ))}
                  {license?.isTrial && (
                    <div
                      className={`row p-3 mb-3 rounded ${
                        daysToGo <= 3
                          ? "alert-danger"
                          : daysToGo <= 7
                          ? "bg-muted-yellow"
                          : "bg-main-color"
                      }`}
                    >
                      {(daysToGo >= 0 && (
                        <div>
                          <span>
                            You have <b>{daysLeft(license.dateExpires)} days</b>{" "}
                            left in your {licensePlanText} of Growthbook with{" "}
                          </span>
                          <Link
                            href="/settings/team"
                            className="mx-1 font-weight-bold"
                          >
                            {currentUsers} team members
                          </Link>
                          ↗
                        </div>
                      )) || (
                        <div>
                          <span>
                            Your {licensePlanText} of Growthbook with{" "}
                          </span>
                          <Link
                            href="/settings/team"
                            className="mx-1 font-weight-bold"
                          >
                            {currentUsers} team members
                          </Link>
                          ↗<span> has expired</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
              {featureFlagValue === "OFF" ? (
                <div className="row">
                  <div
                    className={clsx(
                      "col-lg-6 mb-4",
                      isAtLeastPro ? "disabled-opacity" : ""
                    )}
                  >
                    <div className="pr-lg-2 border rounded p-0 d-flex flex-column">
                      <div className="d-flex justify-content-between align-items-center p-2 px-3">
                        <h4 className="mb-0">Pro</h4>
                        <div className="text-right text-muted">
                          $20/user/month
                        </div>
                      </div>
                      <div className="border-top p-0 flex-grow-1">
                        <ul className="pt-4">
                          <li>
                            <b>Up to 100 team members</b>
                          </li>
                          <li>
                            <b>Advanced permissioning</b>
                          </li>
                          <li>
                            <b>Visual A/B test editor</b>
                          </li>
                          <li>Custom fields</li>
                          <li>Premium support</li>
                          <li>Encrypt SDK endpoint response</li>
                          <li>
                            Advanced experimentation features (CUPED, Sequential
                            testing, etc.)
                          </li>
                          <li>Early access to new features</li>
                        </ul>
                        <div
                          className={
                            "d-flex justify-content-between " +
                            (freeTrialAvailable ? "" : "mb-2")
                          }
                        >
                          <button
                            className="btn btn-primary m-3 w-100"
                            onClick={startPro}
                            disabled={isAtLeastPro}
                          >
                            Upgrade Now
                          </button>
                        </div>
                        {freeTrialAvailable && (
                          <div className="mb-4 text-center">
                            or, start a{" "}
                            {isAtLeastPro ? (
                              <span>{proTrialCopy}</span>
                            ) : (
                              <a
                                role="button"
                                className={clsx(
                                  isAtLeastPro ? "cursor-default" : ""
                                )}
                                onClick={() =>
                                  isCloud()
                                    ? setShowCloudProTrial(true)
                                    : setShowSHProTrial(true)
                                }
                              >
                                {proTrialCopy}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-6 mb-4">
                    <div className="pl-lg-2 border rounded p-0 d-flex flex-column">
                      <div className="d-flex justify-content-between align-items-center p-2 px-3">
                        <h4 className="mb-0">Enterprise</h4>
                        <div className="text-right text-muted">Contact Us</div>
                      </div>
                      <div className="border-top p-0 flex-grow-1">
                        <div className="mt-4 ml-3 font-italic">
                          Includes all Pro features, plus...
                        </div>
                        {/*The minHeight is a hack to get the two buttons aligned vertically */}
                        <ul className=" pr-2" style={{ minHeight: "168px" }}>
                          <li>
                            <b>Unlimited users</b>
                          </li>
                          <li>
                            <b>SSO / SAML integration</b>
                          </li>
                          <li>
                            <b>Roadmap acceleration</b>
                          </li>
                          <li>Service-level agreements</li>
                          <li>Exportable audit logs</li>
                          <li>Enterprise support and training</li>
                          <li>Advanced organization and performance</li>
                        </ul>
                        <div
                          className={
                            "d-flex justify-content-between " +
                            (freeTrialAvailable ? "" : "mb-2")
                          }
                        >
                          <button
                            className="btn btn-primary m-3 w-100"
                            onClick={startEnterprise}
                          >
                            Contact Us
                          </button>
                        </div>
                        {freeTrialAvailable && (
                          <div className="mb-4 text-center">
                            or,
                            <a
                              href="#"
                              className="ml-1"
                              onClick={() =>
                                isCloud()
                                  ? setShowCloudEnterpriseTrial(true)
                                  : setShowSHEnterpriseTrial(true)
                              }
                            >
                              request an Enterprise trial
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : featureFlagValue === "TRIAL-AND-UPGRADE" ? (
                trialAndUpgradeTreatment()
              ) : (
                upgradeOnlyTreatment()
              )}
            </div>
          )}
          {error && <div className="alert alert-danger">{error}</div>}
        </Modal>
      )}
    </div>
  );
}
