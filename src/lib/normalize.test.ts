import { describe, expect, it } from "vitest";
import { makeNormalizer } from "./normalize";

const n = makeNormalizer();

describe("endpoint templates", () => {
  it("collapses whole segments, never a digit prefix", () => {
    // the bug this guards: a `/\d+` substring rule produced /notification/:idaa99f8ec84b8/deliver
    expect(n("/notification/68aa99f8ec84b8/deliver")).toBe("/notification/:hex/deliver");
    expect(n("/sim/1234560000078437613/packages")).toBe("/sim/:id/packages");
    expect(n("/v1.0/wallet/6b67991b-d268-4168-953a-ebd058425c74/0")).toBe("/v1.0/wallet/:uuid/:id");
    expect(n("/detail/507f1f77bcf86cd799439011")).toBe("/detail/:oid");
  });

  it("recognises uppercase codes and embedded timestamps", () => {
    expect(n("/packages/MSR1GB30DAYSONESIM/plan-details")).toBe("/packages/:code/plan-details");
    expect(n("/custom-pay/init/UNLIMITEDMKD3GB1DAYS")).toBe("/custom-pay/init/:code");
    expect(n("/localization/esimio/lc-1789401992-luk5vy7kgn.json.zh-tw")).toBe("/localization/esimio/:id");
  });

  it("leaves route names and version segments alone", () => {
    for (const keep of ["/health-check", "/country-list/footer", "/packages/MSR/new", "/sim-package/active-new", "/"]) {
      expect(n(keep)).toBe(keep);
    }
  });

  it("drops the query string", () => {
    expect(n("/web-homepage?x=1&y=2")).toBe("/web-homepage");
  });

  it("applies explicit rules before the automatic pass", () => {
    const custom = makeNormalizer([["/tenant/[a-z]{3}-[a-z]{3}", "/tenant/:slug"]]);
    expect(custom("/tenant/abc-def/orders/42")).toBe("/tenant/:slug/orders/:id");
  });
});
