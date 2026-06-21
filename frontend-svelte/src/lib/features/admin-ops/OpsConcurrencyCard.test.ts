import { describe, expect, it } from "vitest";
import cardSrc from "./OpsConcurrencyCard.svelte?raw";
import {
  buildAccountRows,
  buildGroupRows,
  buildPlatformRows,
  buildUserRows,
  clampPct,
  deriveDimension,
  formatRemaining,
  loadBarClass,
  safeNumber,
} from "./OpsConcurrencyCard.svelte";
import type {
  OpsAccountAvailabilityStatsResponse,
  OpsConcurrencyStatsResponse,
  OpsUserConcurrencyStatsResponse,
} from "$lib/api/admin/ops";

function fakeConcurrency(): OpsConcurrencyStatsResponse {
  return {
    enabled: true,
    platform: {
      openai: {
        platform: "openai",
        current_in_use: 8,
        max_capacity: 10,
        load_percentage: 80,
        waiting_in_queue: 2,
      },
      claude: {
        platform: "claude",
        current_in_use: 1,
        max_capacity: 10,
        load_percentage: 10,
        waiting_in_queue: 0,
      },
    },
    group: {
      "7": {
        group_id: 7,
        group_name: "Pro",
        platform: "openai",
        current_in_use: 5,
        max_capacity: 10,
        load_percentage: 50,
        waiting_in_queue: 0,
      },
      "9": {
        group_id: 9,
        group_name: "Free",
        platform: "claude",
        current_in_use: 1,
        max_capacity: 4,
        load_percentage: 25,
        waiting_in_queue: 0,
      },
    },
    account: {
      "101": {
        account_id: 101,
        account_name: "acc-a",
        platform: "openai",
        group_id: 7,
        group_name: "Pro",
        current_in_use: 3,
        max_capacity: 5,
        load_percentage: 60,
        waiting_in_queue: 1,
      },
      "102": {
        account_id: 102,
        account_name: "acc-b",
        platform: "openai",
        group_id: 7,
        group_name: "Pro",
        current_in_use: 1,
        max_capacity: 5,
        load_percentage: 20,
        waiting_in_queue: 0,
      },
    },
  };
}

function fakeAvailability(): OpsAccountAvailabilityStatsResponse {
  return {
    enabled: true,
    platform: {
      openai: {
        platform: "openai",
        total_accounts: 4,
        available_count: 3,
        rate_limit_count: 1,
        error_count: 0,
      },
      claude: {
        platform: "claude",
        total_accounts: 2,
        available_count: 2,
        rate_limit_count: 0,
        error_count: 0,
      },
    },
    group: {
      "7": {
        group_id: 7,
        group_name: "Pro",
        platform: "openai",
        total_accounts: 2,
        available_count: 1,
        rate_limit_count: 1,
        error_count: 0,
      },
    },
    account: {
      "101": {
        account_id: 101,
        account_name: "acc-a",
        platform: "openai",
        group_id: 7,
        group_name: "Pro",
        status: "available",
        is_available: true,
        is_rate_limited: false,
        is_overloaded: false,
        has_error: false,
      },
      "102": {
        account_id: 102,
        account_name: "acc-b",
        platform: "openai",
        group_id: 7,
        group_name: "Pro",
        status: "error",
        is_available: false,
        is_rate_limited: false,
        is_overloaded: false,
        has_error: true,
        error_message: "boom",
      },
    },
  };
}

describe("OpsConcurrencyCard logic", () => {
  it("safeNumber coerces only finite numbers", () => {
    expect(safeNumber(5)).toBe(5);
    expect(safeNumber(NaN)).toBe(0);
    expect(safeNumber("5")).toBe(0);
    expect(safeNumber(undefined)).toBe(0);
  });

  it("derives the display dimension from filters + user toggle", () => {
    expect(deriveDimension("", null, false)).toBe("platform");
    expect(deriveDimension("openai", null, false)).toBe("group");
    expect(deriveDimension("openai", 7, false)).toBe("account");
    expect(deriveDimension("openai", 7, true)).toBe("user");
    expect(deriveDimension("", 0, false)).toBe("platform"); // group_id 0 is not a real filter
  });

  it("builds platform rows merged from concurrency + availability, sorted by load", () => {
    const rows = buildPlatformRows(fakeConcurrency(), fakeAvailability());
    expect(rows.map((r) => r.key)).toEqual(["openai", "claude"]); // 80% before 10%
    const openai = rows[0];
    expect(openai.name).toBe("OPENAI");
    expect(openai.usedConcurrency).toBe(8);
    expect(openai.totalConcurrency).toBe(10);
    expect(openai.concurrencyPct).toBe(80);
    expect(openai.availableAccounts).toBe(3);
    expect(openai.totalAccounts).toBe(4);
    expect(openai.availabilityPct).toBe(75);
    expect(openai.rateLimitedAccounts).toBe(1);
    expect(openai.waitingInQueue).toBe(2);
  });

  it("filters group rows by platform", () => {
    const all = buildGroupRows(fakeConcurrency(), fakeAvailability(), "");
    expect(all).toHaveLength(2);
    const openaiOnly = buildGroupRows(
      fakeConcurrency(),
      fakeAvailability(),
      "openai",
    );
    expect(openaiOnly).toHaveLength(1);
    expect(openaiOnly[0].name).toBe("Pro");
    expect(openaiOnly[0].availabilityPct).toBe(50);
  });

  it("filters account rows by group and surfaces error accounts first", () => {
    const rows = buildAccountRows(fakeConcurrency(), fakeAvailability(), 7);
    expect(rows).toHaveLength(2);
    expect(rows[0].hasError).toBe(true); // error sorts before healthy
    expect(rows[0].errorMessage).toBe("boom");
    expect(rows[1].isAvailable).toBe(true);

    const noMatch = buildAccountRows(
      fakeConcurrency(),
      fakeAvailability(),
      999,
    );
    expect(noMatch).toHaveLength(0);
  });

  it("builds user rows sorted by current usage", () => {
    const resp: OpsUserConcurrencyStatsResponse = {
      enabled: true,
      user: {
        "1": {
          user_id: 1,
          user_email: "a@x.io",
          username: "a",
          current_in_use: 2,
          max_capacity: 5,
          load_percentage: 40,
          waiting_in_queue: 0,
        },
        "2": {
          user_id: 2,
          user_email: "b@x.io",
          username: "b",
          current_in_use: 4,
          max_capacity: 5,
          load_percentage: 80,
          waiting_in_queue: 1,
        },
      },
    };
    const rows = buildUserRows(resp);
    expect(rows.map((r) => r.userId)).toEqual([2, 1]);
    expect(buildUserRows(null)).toEqual([]);
  });

  it("uses Zinc-only load bar fills (no semantic status colors)", () => {
    expect(loadBarClass(95)).toContain("zinc");
    expect(loadBarClass(60)).toContain("zinc");
    expect(loadBarClass(10)).toContain("zinc");
    expect(loadBarClass(95)).not.toMatch(/emerald|amber|red-500/);
  });

  it("clamps load width and formats remaining seconds", () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(150)).toBe(100);
    expect(formatRemaining(0)).toBe("0s");
    expect(formatRemaining(45)).toBe("45s");
    expect(formatRemaining(120)).toBe("2m");
    expect(formatRemaining(7200)).toBe("2h");
  });

  it("never top-level imports chart.js (no chart in this card)", () => {
    expect(cardSrc).not.toContain("chart.js");
  });

  it("uses the shared ops api data fns", () => {
    expect(cardSrc).toContain("getOpsConcurrencyStats");
    expect(cardSrc).toContain("getOpsAccountAvailability");
    expect(cardSrc).toContain("getOpsUserConcurrencyStats");
  });
});
