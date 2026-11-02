// The submission check carries the capabilities a game asks for (the static
// check's `facts.uses`), so the reviewer's queue and get_review_status can say
// "asks the platform for: share" without a schema change.
import { describe, expect, it } from "vitest"

import { summarizeCheck } from "@/lib/review/check"

const row = (report: unknown) => ({ id: "b1", state: "passed", report, error: null, createdAt: new Date("2026-11-02T10:00:00Z"), finishedAt: null })

describe("summarizeCheck: uses", () => {
  it("reads the capability names from the report's facts", () => {
    const check = summarizeCheck(row({ ok: true, counts: { error: 0, warning: 0, info: 0 }, issues: [], facts: { uses: ["share", "player.profile"] } }))
    expect(check?.uses).toEqual(["share", "player.profile"])
  })
  it("is empty for a report without facts, and drops anything that is not a name", () => {
    expect(summarizeCheck(row({ ok: true, counts: { error: 0, warning: 0, info: 0 }, issues: [] }))?.uses).toEqual([])
    expect(summarizeCheck(row({ ok: true, counts: { error: 0, warning: 0, info: 0 }, issues: [], facts: { uses: ["share", 3, null] } }))?.uses).toEqual(["share"])
    expect(summarizeCheck(row(null))?.uses).toEqual([])
  })
})
