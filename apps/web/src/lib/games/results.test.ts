import { describe, expect, it } from "vitest";
import { emptyProgress } from "./progress";
import { outcomeOf, recordItem } from "./results";

const T0 = Date.UTC(2026, 9, 19, 20);

describe("recordItem", () => {
  it("feeds the shared memory of the item and says what changed", () => {
    const { progress, result } = recordItem(emptyProgress(), "con", "Cas", "hard", T0);
    expect(progress.items["con:Cas"]?.correct).toBe(1);
    expect(result).toEqual({ item: "Cas", correct: true, before: "new", after: "known" });
    expect(outcomeOf(result)).toBe("learnt");
    const again = recordItem(progress, "con", "Cas", "again", T0 + 1000).result;
    expect(again).toMatchObject({ correct: false, before: "known", after: "learning" });
    expect(outcomeOf(again)).toBe("review");
  });
});
