import { describe, it, expect } from "vitest";
import { orderEntries } from "./order";
import { createRule, type FileEntry } from "./types";
describe("stable sequencing", () => {
  it("uses natural ordering without mutating imported files", () => {
    const entries = ["image10.png", "image2.png", "image1.png"].map(
      (name) =>
        ({
          id: name,
          name,
          path: `/test/${name}`,
          kind: "file",
          error: null,
          fingerprint: null,
        }) satisfies FileEntry,
    );
    expect(
      orderEntries(entries, [{ id: "originalName", desc: false }]).map(
        (e) => e.name,
      ),
    ).toEqual(["image1.png", "image2.png", "image10.png"]);
    expect(entries[0].name).toBe("image10.png");
  });
  it("creates independent nested rule configurations", () => {
    const a = createRule("add");
    const b = createRule("add");
    if (a.config.type === "add" && b.config.type === "add") {
      a.config.position.marker = "changed";
      expect(b.config.position.marker).toBe("");
    }
    expect(a.id).not.toBe(b.id);
  });
});
