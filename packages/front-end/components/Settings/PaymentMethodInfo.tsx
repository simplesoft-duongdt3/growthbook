import { useState, useEffect } from "react";
import { Flex, Text } from "@radix-ui/themes";
import useStripeSubscription from "@/hooks/useStripeSubscription";
import { redirectWithTimeout, useAuth } from "@/services/auth";
import track from "@/services/track";
import { GBAddCircle } from "../Icons";
import Tooltip from "../Tooltip/Tooltip";
import Button from "../Button";
import LoadingOverlay from "../LoadingOverlay";
import Callout from "../Radix/Callout";
import MoreMenu from "../Dropdown/MoreMenu";
import DeleteButton from "../DeleteButton/DeleteButton";
import Badge from "../Radix/Badge";
import CreditCardModal from "./CreditCardModal";

interface Card {
  id: string;
  last4: number;
  brand: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export default function PaymentMethodInfo({
  paymentProviderId,
}: {
  paymentProviderId?: string;
}) {
  const {
    hasActiveSubscription,
    subscriptionType,
    subscriptionStatus,
  } = useStripeSubscription();
  const [cardModal, setCardModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cardData, setCardData] = useState<Card[] | null>(null); // Use Stripe types
  const { apiCall } = useAuth();

  async function detachCard(cardId: string) {
    console.log("cardId", cardId);
    try {
      // Now, we need to actually update the user's card
      const res = await fetch(
        `https://api.stripe.com/v1/payment_methods/${cardId}/detach`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_TEST_KEY}`,
          },
        }
      );
      console.log("res", res);
      if (!res.ok) {
        console.log("res isn't ok");
      }
      window.location.reload();
    } catch (e) {
      console.log("e", e);
    }
  }

  async function setCardAsDefault(cardId: string) {
    console.log("cardId", cardId);
    try {
      // Now, we need to actually update the user's card
      const res = await fetch(
        `https://api.stripe.com/v1/customers/${paymentProviderId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_TEST_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded", // Set the correct content type
          },
          body: new URLSearchParams({
            "invoice_settings[default_payment_method]": cardId, // Make sure paymentProviderId is a valid customer ID
          }),
        }
      );
      console.log("res", res);
      if (!res.ok) {
        console.log("res isn't ok");
      }
      const formattedRes = await res.json();
      console.log("formattedRes", formattedRes);
      window.location.reload();
    } catch (e) {
      console.log("e", e);
    }
  }

  useEffect(() => {
    const fetchCarDataFromStripe = async () => {
      console.log("fetching data!");
      setLoading(true);
      setError(undefined);
      try {
        // Fetch customer details to get the default_payment_method
        const customerResponse = await fetch(
          `https://api.stripe.com/v1/customers/${paymentProviderId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_TEST_KEY}`,
            },
          }
        );

        console.log("customerResponse", customerResponse);

        if (!customerResponse.ok) {
          throw new Error(
            `Failed to fetch customer: ${customerResponse.statusText}`
          );
        }

        const customer = await customerResponse.json();
        const defaultPaymentMethodId =
          customer.invoice_settings?.default_payment_method;

        console.log("defaultPaymentMethod", defaultPaymentMethodId);

        const paymentMethodsUrl = new URL(
          `https://api.stripe.com/v1/customers/${paymentProviderId}/payment_methods`
        );

        paymentMethodsUrl.searchParams.append("type", "card");

        // Fetch all payment methods
        const paymentMethodsResponse = await fetch(paymentMethodsUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_TEST_KEY}`,
          },
        });

        console.log("paymentMethodsResponse", paymentMethodsResponse);

        if (!paymentMethodsResponse.ok) {
          throw new Error(
            `Failed to fetch payment methods: ${paymentMethodsResponse.statusText}`
          );
        }

        const paymentMethods = await paymentMethodsResponse.json();

        console.log("paymentMethods", paymentMethods);

        if (!paymentMethods.data || !paymentMethods.data.length) {
          // log error
          return;
        }

        // Identify the default payment method
        const paymentMethodsWithDefaultFlag = paymentMethods.data.map(
          (method, i) => {
            const card = method.card;
            return {
              id: method.id,
              last4: card.last4,
              brand: card.display_brand,
              expMonth: card.exp_month,
              expYear: card.exp_year,
              // if no explicit defaultPaymentMethodId, Orb uses the first card
              isDefault: defaultPaymentMethodId
                ? method.id === defaultPaymentMethodId
                : !!(i === 0),
            };
          }
        );

        setCardData(paymentMethodsWithDefaultFlag);
      } catch (err) {
        setError(err.message);
      }
      setLoading(false);
    };

    if (subscriptionType === "orb" && paymentProviderId) {
      fetchCarDataFromStripe();
    }
  }, [paymentProviderId, subscriptionType]);

  if (loading) return <LoadingOverlay />;

  if (subscriptionType === "orb" && !paymentProviderId) {
    return (
      <Callout status="error">
        Your organization&apos;s subscription is not configured correctly.
        Missing <code>paymentProviderId</code>
      </Callout>
    );
  }

  console.log("cardData", cardData);

  return (
    <>
      {cardModal ? (
        <CreditCardModal
          onClose={() => setCardModal(false)}
          paymentProviderId={paymentProviderId}
        />
      ) : null}
      {subscriptionType === "stripe" ? (
        <div
          className="appbox d-flex flex-column align-items-center w-auto"
          style={{ padding: "70px 305px 60px 305px" }}
        >
          <h1 className="text-center">Your card is managed by Stripe</h1>
          <Button
            color="primary"
            onClick={async () => {
              const res = await apiCall<{ url: string }>(
                `/subscription/manage`,
                {
                  method: "POST",
                }
              );
              if (res && res.url) {
                await redirectWithTimeout(res.url);
              } else {
                throw new Error("Unknown response");
              }
            }}
          >
            {subscriptionStatus !== "canceled"
              ? "View Plan Details"
              : "View Previous Invoices"}
          </Button>
        </div>
      ) : (
        <>
          <Flex align="center" justify="between" className="mb-3">
            <Text as="p" className="mb-0">
              Payments for subscription and usage charges are made with the
              default card.
            </Text>
            <Tooltip
              shouldDisplay={!hasActiveSubscription}
              body="You must have an active subscription before you can add a credit card."
            >
              <button
                className="btn btn-primary float-right"
                disabled={!hasActiveSubscription}
                onClick={() => {
                  setCardModal(true);
                  track("Edit Card Modal", {
                    source: "payment-method-empty-state",
                  });
                }}
                type="button"
              >
                <span className="h4 pr-2 m-0 d-inline-block align-top">
                  <GBAddCircle />
                </span>
                Add Card
              </button>
            </Tooltip>
          </Flex>
          {cardData?.length ? (
            <table className="table mb-3 appbox gbtable">
              <thead>
                <tr>
                  <th className="col-8">Card Details</th>
                  <th className="col-4">Valid Until</th>
                  <th className="col-2"></th>
                </tr>
              </thead>
              <tbody>
                {cardData.map((card) => {
                  return (
                    <tr key={card.id}>
                      <td>
                        {card.brand}
                        <Text as="span" className="px-2">
                          ••••{card.last4}
                        </Text>
                        {card.isDefault ? <Badge label="Default Card" /> : null}
                      </td>
                      <td>
                        {card.expMonth}/{card.expYear}
                      </td>
                      <td>
                        <MoreMenu className="pl-2">
                          <button
                            className="dropdown-item"
                            disabled={card.isDefault}
                            onClick={async () =>
                              await setCardAsDefault(card.id)
                            }
                          >
                            Set as Default Card
                          </button>
                          <DeleteButton
                            onClick={async () => await detachCard(card.id)}
                            className="dropdown-item text-danger"
                            displayName="Remove Card"
                            text="Remove Card"
                            useIcon={false}
                          />
                        </MoreMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div
              className="appbox d-flex flex-column align-items-center" // Fix styling here - box isn't very wide
              style={{ padding: "70px 305px 60px 305px" }}
            >
              <h1>Add a Card</h1>
              <p style={{ fontSize: "17px" }}>
                Payments for plans, usage, and other add-ons are made using the
                default credit card.
              </p>
              <div className="row">
                <Tooltip
                  shouldDisplay={!hasActiveSubscription}
                  body="You must have an active subscription before you can add a credit card."
                >
                  <button
                    className="btn btn-primary float-right"
                    disabled={!hasActiveSubscription}
                    onClick={() => {
                      setCardModal(true);
                      track("Edit Card Modal", {
                        source: "payment-method-empty-state",
                      });
                    }}
                    type="button"
                  >
                    <span className="h4 pr-2 m-0 d-inline-block align-top">
                      <GBAddCircle />
                    </span>
                    Add Card
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
