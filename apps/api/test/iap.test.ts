import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { createToken, hashPassword } from "../src/auth.ts";
import { openDatabase, projectRoot } from "../src/db.ts";
import { commissionSplit } from "../src/domain-iap.ts";
import { loadIapSeed } from "../src/cli/seed.ts";

const base = {
  stage: "P1",
  amount: 100_000_000,
  closing: 0.5,
  commission_rate: 0.025,
  due_date: null,
  commission_received: null,
  apport_paid_at: null,
  closing_paid_at: null,
};

describe("commissionSplit (fiche de commissionnement IAP)", () => {
  it("apporteur et closeur différents : 5 % et 10 % de la commission", () => {
    const s = commissionSplit({ ...base, apporteur: "Sali Traoré", closeur: "Landry Digbeu" });
    assert.equal(s.base, 2_500_000);
    assert.equal(s.estimated, true);
    assert.deepEqual(s.shares.map((x) => [x.person, x.role, x.amount, x.status]), [
      ["Sali Traoré", "apport", 125_000, "expected"],
      ["Landry Digbeu", "closing", 250_000, "expected"],
    ]);
  });

  it("même personne (casse et accents ignorés) : part unique de 15 %", () => {
    const s = commissionSplit({ ...base, apporteur: "Sali Traoré", closeur: "sali traore" });
    assert.equal(s.shares.length, 1);
    assert.equal(s.shares[0].role, "apport_closing");
    assert.equal(s.shares[0].amount, 375_000);
  });

  it("base = commission perçue par IAP ; parts dues puis versées", () => {
    const due = commissionSplit({ ...base, apporteur: "A", closeur: "B", commission_received: 2_000_000 });
    assert.equal(due.base, 2_000_000);
    assert.equal(due.estimated, false);
    assert.deepEqual(due.shares.map((x) => [x.amount, x.status]), [[100_000, "due"], [200_000, "due"]]);
    const paid = commissionSplit({ ...base, apporteur: "A", closeur: "B", commission_received: 2_000_000, apport_paid_at: "2026-11-02" });
    assert.deepEqual(paid.shares.map((x) => x.status), ["paid", "due"]);
  });

  it("sans closeur : seule la part apport", () => {
    const s = commissionSplit({ ...base, apporteur: "A", closeur: null });
    assert.deepEqual(s.shares.map((x) => [x.role, x.amount]), [["apport", 125_000]]);
  });
});

function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  const add = (email: string, role: string, spaces: string | null) =>
    Number(db.prepare("INSERT INTO users (email, name, password_hash, role, spaces) VALUES (?, ?, ?, ?, ?)").run(email, email, hashPassword("x".repeat(12)), role, spaces).lastInsertRowid);
  const admin = createToken(db, add("admin@x.ci", "admin", null), "t", "api", null).value;
  const iatOnly = createToken(db, add("iat@x.ci", "member", null), "t", "api", null).value;
  const iapOnly = createToken(db, add("iap@x.ci", "member", "iap"), "t", "api", null).value;
  const call = (token: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { db, call, admin, iatOnly, iapOnly };
}

describe("API IAP", () => {
  it("cloisonne les espaces par utilisateur", async () => {
    const { call, admin, iatOnly, iapOnly } = setup();
    assert.equal((await call(admin, "GET", "/iap/deals")).status, 200);
    assert.equal((await call(iatOnly, "GET", "/iap/deals")).status, 403);
    assert.equal((await call(iatOnly, "GET", "/deals")).status, 200);
    assert.equal((await call(iapOnly, "GET", "/deals")).status, 403);
    assert.equal((await call(iapOnly, "GET", "/iap/summary")).status, 200);
    const me = await (await call(iapOnly, "GET", "/me")).json();
    assert.deepEqual(me.user.spaces, ["iap"]);
    assert.deepEqual((await (await call(admin, "GET", "/me")).json()).user.spaces, ["iat", "iap"]);
  });

  it("crée une affaire, calcule commission et parts, journalise dans l'espace IAP", async () => {
    const { call, admin, iatOnly } = setup();
    const res = await call(admin, "POST", "/iap/deals", {
      title: "Villa test",
      stage: "Mandat signé",
      amount: 200_000_000,
      commission_rate: 0.025,
      closing: 0.5,
      apporteur: "Koumba Assanvo",
      closeur: "Sali Traoré",
    });
    assert.equal(res.status, 201);
    const deal = await res.json();
    assert.equal(deal.number, 1);
    assert.equal(deal.stage, "P1");
    assert.equal(deal.commission, 5_000_000);
    assert.equal(deal.weighted_commission, 2_500_000);
    assert.deepEqual(deal.shares.map((s: { amount: number }) => s.amount), [250_000, 500_000]);
    const commissions = await (await call(admin, "GET", "/iap/commissions")).json();
    assert.equal(commissions.totals.expected, 750_000);
    const activity = await (await call(admin, "GET", "/activity?space=iap")).json();
    assert.equal(activity.total, 1);
    assert.equal((await call(iatOnly, "GET", "/activity?space=iap")).status, 403);
    assert.equal((await (await call(iatOnly, "GET", "/activity")).json()).total, 0);
  });

  it("charge le classeur IAP avec les totaux du fichier", { skip: !existsSync(resolve(projectRoot, "data/seed-iap.json")) }, async () => {
    const { db, call, admin } = setup();
    loadIapSeed(db, JSON.parse(readFileSync(resolve(projectRoot, "data/seed-iap.json"), "utf8")));
    const summary = await (await call(admin, "GET", "/iap/summary")).json();
    assert.equal(summary.pipeline.deals_count, 40);
    assert.equal(summary.pipeline.total_amount, 29_876_700_000);
    assert.equal(summary.pipeline.commission, 676_364_500);
    const actions = await (await call(admin, "GET", "/iap/actions?limit=5")).json();
    assert.ok(actions.results[0].deal_number);
  });
});
