import type { TrackingCallback } from "../types/growthbook";
import type { GrowthBook } from "../GrowthBook";
import type {
  GrowthBookClient,
  UserScopedGrowthBook,
} from "../GrowthBookClient";

export type Trackers = "gtag" | "gtm" | "segment" | "snowplow";

export function thirdPartyTrackingPlugin({
  additionalCallback,
  trackers = ["gtag", "gtm", "segment"],
}: {
  additionalCallback?: TrackingCallback;
  trackers?: Trackers[];
} = {}) {
  // Browser only
  if (typeof window === "undefined") {
    throw new Error("thirdPartyTrackingPlugin only works in the browser");
  }

  return (gb: GrowthBook | UserScopedGrowthBook | GrowthBookClient) => {
    gb.setTrackingCallback(async (e, r) => {
      const promises: Promise<unknown>[] = [];
      const eventParams = { experiment_id: e.key, variation_id: r.key };

      if (additionalCallback) {
        promises.push(Promise.resolve(additionalCallback(e, r)));
      }

      // GA4 - gtag
      if (trackers.includes("gtag") && window.gtag) {
        let gtagResolve;
        const gtagPromise = new Promise((resolve) => {
          gtagResolve = resolve;
        });
        promises.push(gtagPromise);
        window.gtag("event", "experiment_viewed", {
          ...eventParams,
          event_callback: gtagResolve,
        });
      }

      // GTM - dataLayer
      if (trackers.includes("gtm") && window.dataLayer) {
        let datalayerResolve;
        const datalayerPromise = new Promise((resolve) => {
          datalayerResolve = resolve;
        });
        promises.push(datalayerPromise);
        window.dataLayer.push({
          event: "experiment_viewed",
          ...eventParams,
          eventCallback: datalayerResolve,
        });
      }

      // Segment - analytics.js
      if (
        trackers.includes("segment") &&
        window.analytics &&
        window.analytics.track
      ) {
        window.analytics.track("Experiment Viewed", eventParams);
        const segmentPromise = new Promise((resolve) =>
          window.setTimeout(resolve, 300)
        );
        promises.push(segmentPromise);
      }

      if (trackers.includes("snowplow") && window.snowplow) {
        window.snowplow("trackSelfDescribingEvent", {
          event: {
            schema: "iglu:com.growthbook/experiment_viewed/jsonschema/1-0-0",
            data: {
              experimentId: e.key,
              variationId: r.key,
              hashAttribute: r.hashAttribute,
              hashValue: r.hashValue,
            },
          },
        });
        // snowplow uses local storage so we don't need to wait long
        const snowplowPromise = new Promise((resolve) =>
          window.setTimeout(resolve, 80)
        );
        promises.push(snowplowPromise);
      }

      await Promise.all(promises);
    });
  };
}
