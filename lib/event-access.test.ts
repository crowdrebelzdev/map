import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventAccess } from "@/lib/event-access";

const dbMock = {
  query: {
    event: { findFirst: vi.fn() },
    member: { findFirst: vi.fn() },
    eventMember: { findFirst: vi.fn() },
  },
};
vi.mock("@/db", () => ({ db: dbMock }));

const requireSessionMock = vi.fn();
vi.mock("@/lib/get-session", () => ({ requireSession: requireSessionMock }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const { getEventAccess, hasAnyEventAccess, hasEventPermission, requireEventPermission, requireAnyEventAccess } =
  await import("@/lib/event-access");

const EVENT_ID = "event-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEventAccess", () => {
  it("grants full access to a platform-wide super admin, without any db lookups", async () => {
    const access = await getEventAccess(EVENT_ID, { id: "u1", role: "admin" });
    expect(access).toEqual({ isAdmin: true, isMember: true, permissions: "all" });
    expect(dbMock.query.event.findFirst).not.toHaveBeenCalled();
  });

  it("grants full access to an org admin (owner) of the event's own organization", async () => {
    dbMock.query.event.findFirst.mockResolvedValue({ organizationId: "org-1" });
    dbMock.query.member.findFirst.mockResolvedValue({ role: "owner" });

    const access = await getEventAccess(EVENT_ID, { id: "u1", role: "user" });
    expect(access).toEqual({ isAdmin: true, isMember: true, permissions: "all" });
  });

  it("does not grant full access to a plain org member (non-owner)", async () => {
    dbMock.query.event.findFirst.mockResolvedValue({ organizationId: "org-1" });
    dbMock.query.member.findFirst.mockResolvedValue({ role: "member" });
    dbMock.query.eventMember.findFirst.mockResolvedValue({ permissions: ["manage_pois"] });

    const access = await getEventAccess(EVENT_ID, { id: "u1", role: "user" });
    expect(access).toEqual({ isAdmin: false, isMember: true, permissions: ["manage_pois"] });
  });

  it("does not grant access to an owner of a different organization than the event's", async () => {
    dbMock.query.event.findFirst.mockResolvedValue({ organizationId: "org-1" });
    dbMock.query.member.findFirst.mockResolvedValue(undefined); // no membership in org-1
    dbMock.query.eventMember.findFirst.mockResolvedValue(undefined);

    const access = await getEventAccess(EVENT_ID, { id: "u1", role: "user" });
    expect(access).toEqual({ isAdmin: false, isMember: false, permissions: [] });
  });

  it("falls back to eventMember row when the user has no org membership at all", async () => {
    dbMock.query.event.findFirst.mockResolvedValue(undefined);
    dbMock.query.eventMember.findFirst.mockResolvedValue({ permissions: [] });

    const access = await getEventAccess(EVENT_ID, { id: "u1", role: "user" });
    expect(access).toEqual({ isAdmin: false, isMember: true, permissions: [] });
  });
});

describe("hasAnyEventAccess / hasEventPermission", () => {
  it("admin access always passes", () => {
    const access: EventAccess = { isAdmin: true, isMember: true, permissions: "all" };
    expect(hasAnyEventAccess(access)).toBe(true);
    expect(hasEventPermission(access, "manage_pois")).toBe(true);
  });

  it("member access requires the specific permission", () => {
    const access: EventAccess = { isAdmin: false, isMember: true, permissions: ["edit_map"] };
    expect(hasAnyEventAccess(access)).toBe(true);
    expect(hasEventPermission(access, "edit_map")).toBe(true);
    expect(hasEventPermission(access, "manage_pois")).toBe(false);
  });

  it("a zero-permission member still has baseline access but no capabilities", () => {
    const access: EventAccess = { isAdmin: false, isMember: true, permissions: [] };
    expect(hasAnyEventAccess(access)).toBe(true);
    expect(hasEventPermission(access, "manage_pois")).toBe(false);
  });

  it("a non-member has neither", () => {
    const access: EventAccess = { isAdmin: false, isMember: false, permissions: [] };
    expect(hasAnyEventAccess(access)).toBe(false);
  });
});

describe("requireEventPermission / requireAnyEventAccess", () => {
  it("throws when the caller lacks the required permission", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbMock.query.event.findFirst.mockResolvedValue(undefined);
    dbMock.query.eventMember.findFirst.mockResolvedValue({ permissions: [] });

    await expect(requireEventPermission(EVENT_ID, "manage_pois")).rejects.toThrow("notAllowedForEvent");
  });

  it("resolves for a super admin", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    await expect(requireEventPermission(EVENT_ID, "manage_pois")).resolves.toBeDefined();
  });

  it("requireAnyEventAccess throws for a user with no relation to the event", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: "u1", role: "user" } });
    dbMock.query.event.findFirst.mockResolvedValue(undefined);
    dbMock.query.eventMember.findFirst.mockResolvedValue(undefined);

    await expect(requireAnyEventAccess(EVENT_ID)).rejects.toThrow("notAllowedForEvent");
  });
});
