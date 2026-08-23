import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";

// Radix's Slider measures its thumb with ResizeObserver, which jsdom does not
// implement. The stub only has to exist -- nothing here asserts on geometry.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

describe("Field label association", () => {
  it("names a Slider through the Field's Label (no labelable element to point htmlFor at)", () => {
    render(
      <Field labelable={false}>
        <Label>Stake Term</Label>
        <Slider min={1} max={7777} value={[365]} onValueChange={() => {}} />
      </Field>
    );

    // getByRole with a name only resolves if the thumb carries an accessible
    // name -- this is the exact assertion that failed before slider.tsx read
    // the Field context.
    const thumb = screen.getByRole("slider", { name: "Stake Term" });
    expect(thumb).toHaveAttribute("aria-valuenow", "365");
  });

  it("lets an explicit aria-label win over the Field's Label", () => {
    render(
      <Field labelable={false}>
        <Label>Ignored</Label>
        <Slider aria-label="Explicit" value={[1]} min={0} max={2} />
      </Field>
    );

    expect(screen.getByRole("slider", { name: "Explicit" })).toBeTruthy();
  });

  it("still wires Label -> Input via htmlFor for labelable controls", () => {
    render(
      <Field>
        <Label>FENIX Amount</Label>
        <Input defaultValue="1" />
      </Field>
    );

    expect(screen.getByLabelText("FENIX Amount")).toHaveValue("1");
  });
});
