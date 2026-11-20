import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { createApp } from "../src/app.ts";
import { createToken, hashPassword } from "../src/auth.ts";
import { loadFinSeed, syncFinSeed } from "../src/cli/seed.ts";
import { openDatabase, projectRoot } from "../src/db.ts";
import { finDealComputed } from "../src/domain-fin.ts";

const SEED = resolve(projectRoot, "data/seed-fin.json");

function setup() {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  const add = (email: string, role: string, spaces: string | null) =>
    Number(db.prepare("INSERT INTO users (email, name, password_hash, role, spaces) VALUES (?, ?, ?, ?, ?)").run(email, email, hashPassword("x".repeat(12)), role, spaces).lastInsertRowid);
  const admin = createToken(db, add("admin@x.ci", "admin", null), "t", "api", null).value;
  const iafOnly = createToken(db, add("iaf@x.ci", "member", "iaf"), "t", "api", null).value;
  const group = createToken(db, add("groupe@x.ci", "member", "iag,iaf,iap"), "t", "api", null).value;
  const call = (token: string, method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { db, call, admin, iafOnly, group };
}

const base = { stage: "F2", amount: 1_000_000_000, closing: 0.5, fee: 5_000_000, fee_received: null, commission_rate: 0.025, commission_received: null, due_date: null };

describe("finDealComputed (IAC / IAF)", () => {
  it("revenu = honoraire + commission de succès ; pondéré par le closing", () => {
    const d = finDealComputed(base);
    assert.equal(d.commission, 25_000_000);
    assert.equal(d.revenue, 30_000_000);
    assert.equal(d.weighted_revenue, 15_000_000);
    assert.equal(d.weighted_amount, 500_000_000);
  });

  it("à encaisser : honoraire dès qu'il est fixé, commission une fois le financement obtenu", () => {
    assert.deepEqual([finDealComputed(base).fee_outstanding, finDealComputed(base).commission_outstanding], [5_000_000, 0]);
    const won = finDealComputed({ ...base, stage: "F4", fee_received: 2_000_000, commission_received: 5_000_000 });
    assert.deepEqual([won.fee_outstanding, won.commission_outstanding, won.outstanding, won.received], [3_000_000, 20_000_000, 23_000_000, 7_000_000]);
    assert.equal(finDealComputed({ ...base, stage: "LOST" }).outstanding, 0);
  });

  it("sans taux ni honoraire : pas de revenu calculé", () => {
    const d = finDealComputed({ ...base, fee: null, commission_rate: null });
    assert.equal(d.commission, null);
    assert.equal(d.revenue, null);
  });
});

describe("API IAC / IAF / Groupe", () => {
  it("cloisonne IAC, IAF et le Groupe", async () => {
    const { call, admin, iafOnly } = setup();
    for (const path of ["/iac/deals", "/iaf/deals", "/groupe/partners", "/groupe/summary"]) assert.equal((await call(admin, "GET", path)).status, 200, path);
    assert.equal((await call(iafOnly, "GET", "/iaf/summary")).status, 200);
    assert.equal((await call(iafOnly, "GET", "/iac/deals")).status, 403);
    assert.equal((await call(iafOnly, "GET", "/groupe/partners")).status, 403);
    assert.equal((await call(iafOnly, "GET", "/deals")).status, 403);
  });

  it("les deux filiales ont des affaires séparées, journalisées dans leur espace", async () => {
    const { call, admin } = setup();
    const res = await call(admin, "POST", "/iaf/deals", { title: "HYBA", stage: "Financement obtenu, à recouvrer", amount: 700_000_000, fee: 4_000_000, commission_rate: 0.03 });
    assert.equal(res.status, 201);
    const deal = await res.json();
    assert.deepEqual([deal.number, deal.stage, deal.commission, deal.outstanding], [1, "F4", 21_000_000, 25_000_000]);
    assert.equal((await call(admin, "POST", "/iac/deals", { title: "KCCI" })).status, 201);
    assert.equal((await (await call(admin, "GET", "/iac/deals")).json()).total, 1);
    assert.equal((await (await call(admin, "GET", "/iaf/deals")).json()).results[0].title, "HYBA");
    assert.equal((await (await call(admin, "GET", "/activity?space=iaf")).json()).total, 1);
    assert.equal((await (await call(admin, "GET", "/activity?space=iac")).json()).total, 1);
    const action = await (await call(admin, "POST", "/iaf/actions", { title: "Recouvrer le solde", deal_id: deal.id })).json();
    assert.equal(action.deal_title, "HYBA");
    const recovery = await (await call(admin, "GET", "/iaf/recovery")).json();
    assert.equal(recovery.totals.outstanding, 25_000_000);
    assert.equal((await (await call(admin, "GET", "/iaf/deals?outstanding=true")).json()).total, 1);
    assert.equal((await call(admin, "POST", "/iaf/deals", { title: "X", stage: "P1" })).status, 400);
  });

  it("charge le classeur du Groupe avec les totaux du fichier", { skip: !existsSync(SEED) }, async () => {
    const { db, call, admin } = setup();
    loadFinSeed(db, JSON.parse(readFileSync(SEED, "utf8")));
    const iac = await (await call(admin, "GET", "/iac/summary")).json();
    assert.equal(iac.pipeline.deals_count, 10);
    assert.equal(iac.pipeline.total_amount, 72_517_171_736);
    assert.equal(iac.pipeline.commission, 275_000_000);
    const iaf = await (await call(admin, "GET", "/iaf/summary")).json();
    assert.equal(iaf.pipeline.deals_count, 15);
    assert.equal(iaf.pipeline.total_amount, 58_680_000_000);
    assert.equal(iaf.pipeline.fee, 84_000_000);
    // Le TOTAL du classeur (1 218 M) omet les quatre premières lignes : la somme réelle est 1 255,4 M.
    assert.equal(iaf.pipeline.commission, 1_255_400_000);
    const partners = await (await call(admin, "GET", "/groupe/partners?entity=IAP")).json();
    assert.equal(partners.total, 3);
  });

  it("vue Groupe limitée aux filiales accessibles", async () => {
    const { call, admin, group } = setup();
    await call(admin, "POST", "/iaf/deals", { title: "A", amount: 100, fee: 10, commission_rate: 0.1, closing: 1 });
    await call(admin, "POST", "/iac/deals", { title: "B", amount: 1_000 });
    await call(admin, "POST", "/groupe/partners", { name: "Odoo", entity: "IAT", potential: "Élevé", priority: "P1", due_date: "2020-01-01" });
    const all = await (await call(admin, "GET", "/groupe/summary")).json();
    assert.deepEqual(all.subsidiaries.map((s: { space: string }) => s.space), ["iat", "iap", "iac", "iaf"]);
    assert.equal(all.totals.open_amount, 1_100);
    assert.equal(all.partners.overdue_count, 1);
    const limited = await (await call(group, "GET", "/groupe/summary")).json();
    assert.deepEqual(limited.subsidiaries.map((s: { space: string }) => s.space), ["iap", "iaf"]);
    assert.equal(limited.totals.revenue, 20);
  });

  it("recharge un classeur plus récent une seule fois, sans toucher aux contacts", () => {
    const { db } = setup();
    const v1 = { version: 1, iaf: { deals: [{ number: 1, title: "Ancienne" }] }, partners: [{ number: 1, name: "P" }] };
    assert.equal(syncFinSeed(db, v1), "loaded");
    db.prepare("INSERT INTO iaf_contacts (name) VALUES ('M. Koné')").run();
    assert.equal(syncFinSeed(db, v1), "kept");
    const v2 = { version: 2, iaf: { deals: [{ number: 1, title: "Révisée" }], actions: [{ number: 1, title: "Relancer", deal: 1 }] }, partners: [] };
    assert.equal(syncFinSeed(db, v2), "replaced");
    assert.equal(db.prepare("SELECT title FROM iaf_deals").get()!.title, "Révisée");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM partners").get()!.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM iaf_contacts").get()!.n, 1);
    assert.equal(syncFinSeed(db, v2), "kept");
  });
});
