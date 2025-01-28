import { FC, useEffect, useState } from "react";
import { LicenseInterface } from "enterprise";
import { Box } from "@radix-ui/themes";
import LoadingOverlay from "@/components/LoadingOverlay";
import UpgradeModal from "@/components/Settings/UpgradeModal";
import useStripeSubscription from "@/hooks/useStripeSubscription";
import { useUser } from "@/services/UserContext";
import { useAuth } from "@/services/auth";
import usePermissionsUtil from "@/hooks/usePermissionsUtils";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/Radix/Tabs";
import PaymentMethodInfo from "@/components/Settings/PaymentMethodInfo";
import StripeSubscriptionInfo from "@/components/Settings/StripeSubscriptionInfo";
import OrbSubscriptionInfo from "@/components/Settings/OrbSubscriptionInfo";

const BillingPage: FC = () => {
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [loadingOrbData, setLoadingOrbData] = useState(false);
  const [portalError, setPortalError] = useState<string | undefined>(undefined);
  const [portalUrl, setPortalUrl] = useState<string | undefined>(undefined);
  const [paymentProviderId, setPaymentProviderId] = useState<
    string | undefined
  >(undefined);

  const {
    canSubscribe,
    subscriptionStatus,
    loading,
    subscriptionType,
  } = useStripeSubscription();

  const permissionsUtil = usePermissionsUtil();

  const { accountPlan, refreshOrganization, organization } = useUser();

  const { apiCall } = useAuth();

  useEffect(() => {
    const refreshLicense = async () => {
      const res = await apiCall<{
        status: number;
        license: LicenseInterface;
      }>(`/license`, {
        method: "GET",
      });

      if (res.status !== 200) {
        throw new Error("There was an error fetching the license");
      }
      refreshOrganization();
    };

    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      // TODO: Get rid of the "org" route, once all license data has been moved off the orgs
      if (urlParams.get("refreshLicense") || urlParams.get("org")) {
        refreshLicense();
      }
    }
  }, [apiCall, refreshOrganization]);

  useEffect(() => {
    const fetchOrbCustomerData = async () => {
      setLoadingOrbData(true);
      setPortalError(undefined);
      try {
        const res = await fetch(
          `https://api.withorb.com/v1/customers/external_customer_id/${organization.id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_ORB_API_KEY}`,
            },
          }
        );
        const data = await res.json();
        console.log("data", data);
        if (data.portal_url) {
          setPortalUrl(data.portal_url);
        }

        if (data.payment_provider_id) {
          setPaymentProviderId(data.payment_provider_id);
        }

        if (data.status) {
          setPortalError(
            "Unable to load billing data at this time. Please contact support."
          );
          console.error(
            `Unable to fetch Orb customer portal for organization: ${
              organization.id
            }. ${data.detail ? `Reason: ${data.detail}` : ""}`
          );
        }
      } catch (err) {
        setPortalError(err.message);
        console.error(err);
      }
      setLoadingOrbData(false);
    };

    if (subscriptionType === "orb") fetchOrbCustomerData();
  }, [organization.id, subscriptionType]);

  if (accountPlan === "enterprise") {
    return (
      <div className="container pagecontents">
        <div className="alert alert-info">
          This page is not available for enterprise customers. Please contact
          your account rep for any billing questions or changes.
        </div>
      </div>
    );
  }

  if (loading || loadingOrbData) {
    return <LoadingOverlay />;
  }

  if (!permissionsUtil.canManageBilling()) {
    return (
      <div className="container pagecontents">
        <div className="alert alert-danger">
          You do not have access to view this page.
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid pagecontents">
      <Tabs defaultValue="plan-info">
        <Box mb="5">
          <TabsList>
            <TabsTrigger value="plan-info">Plan Info</TabsTrigger>
            <TabsTrigger value="payment-methods">Payment Method</TabsTrigger>
          </TabsList>
        </Box>
        <TabsContent value="plan-info">
          <>
            {upgradeModal && (
              <UpgradeModal
                close={() => setUpgradeModal(false)}
                reason=""
                source="billing-free"
              />
            )}
            <div className=" bg-white p-3 border">
              {subscriptionStatus ? (
                <>
                  {subscriptionType === "orb" ? (
                    <OrbSubscriptionInfo
                      portalUrl={portalUrl}
                      portalError={portalError}
                    />
                  ) : (
                    <StripeSubscriptionInfo />
                  )}
                </>
              ) : canSubscribe ? (
                <div className="alert alert-warning mb-0">
                  <div className="d-flex align-items-center">
                    <div>
                      You are currently on the <strong>Free Plan</strong>.
                    </div>
                    <button
                      className="btn btn-primary ml-auto"
                      onClick={(e) => {
                        e.preventDefault();
                        setUpgradeModal(true);
                      }}
                    >
                      Upgrade Now
                    </button>
                  </div>
                </div>
              ) : (
                <p>
                  Contact{" "}
                  <a href="mailto:sales@growthbook.io">sales@growthbook.io</a>{" "}
                  to make changes to your subscription plan.
                </p>
              )}
            </div>
          </>
        </TabsContent>
        <TabsContent value="payment-methods">
          {!subscriptionStatus ? (
            <div className=" bg-white p-3 border">
              <div className="alert alert-warning mb-0">
                <div className="d-flex align-items-center">
                  <div>
                    You are currently on the <strong>Free Plan</strong>.
                  </div>
                  <button
                    className="btn btn-primary ml-auto"
                    onClick={(e) => {
                      e.preventDefault();
                      setUpgradeModal(true);
                    }}
                  >
                    Upgrade Now
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <PaymentMethodInfo paymentProviderId={paymentProviderId} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
export default BillingPage;
