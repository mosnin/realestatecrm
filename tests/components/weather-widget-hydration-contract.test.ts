import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "components/tool-ui/weather-widget/weather-widget-container.tsx",
  "utf8",
);

describe("weather widget hydration contract", () => {
  it("restores reduced-motion preference after a deterministic first render", () => {
    expect(source).toContain(
      "const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)",
    );
    expect(source).toContain("setPrefersReducedMotion(mediaQueryList.matches)");
    expect(source).not.toMatch(
      /useState\(\(\) =>[\s\S]{0,300}prefers-reduced-motion/,
    );
  });
});
