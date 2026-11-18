import type { Meta, StoryObj } from "@storybook/react-vite";

/**
 * Foundations are rendered from the real custom properties, not from a copy of
 * the palette. A token rename breaks the story rather than letting the
 * workbench drift away from the app.
 */
const meta = {
  title: "Foundations/Colour",
  parameters: { a11y: { disable: true } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SEMANTIC = [
  ["Background", "--background"],
  ["Surface", "--surface"],
  ["Surface 2", "--surface-2"],
  ["Surface 3", "--surface-3"],
  ["Foreground", "--foreground"],
  ["Muted foreground", "--muted-foreground"],
  ["Border", "--border"],
  ["Border strong", "--border-strong"],
  ["Accent", "--accent"],
  ["Accent soft", "--accent-soft"],
  ["Success", "--success"],
  ["Success soft", "--success-soft"],
  ["Warning", "--warning"],
  ["Warning soft", "--warning-soft"],
  ["Danger", "--danger"],
  ["Danger soft", "--danger-soft"],
] as const;

export const Palette: Story = {
  render: () => (
    <div className="story-stack">
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))" }}
      >
        {SEMANTIC.map(([label, token]) => (
          <div key={token}>
            <div
              style={{
                background: `var(${token})`,
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                height: "4.5rem",
              }}
            />
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.8125rem", fontWeight: 600 }}>{label}</p>
            <code style={{ fontSize: "0.6875rem", color: "var(--muted-foreground)" }}>{token}</code>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const AccentRamps: Story = {
  render: () => (
    <div className="story-stack">
      {["indigo", "blue", "emerald", "rose", "amber", "violet", "slate"].map((accent) => (
        <div key={accent} className="story-row">
          <span className="story-label" style={{ margin: 0, width: "6rem" }}>
            {accent}
          </span>
          <span
            style={{
              background: `var(--accent-${accent})`,
              height: "2.5rem",
              width: "6rem",
              borderRadius: "var(--r-md)",
            }}
          />
          <span
            style={{
              background: `var(--accent-${accent}-hover)`,
              height: "2.5rem",
              width: "6rem",
              borderRadius: "var(--r-md)",
            }}
          />
          <span
            style={{
              background: `color-mix(in oklab, var(--accent-${accent}) 22%, var(--surface))`,
              height: "2.5rem",
              width: "6rem",
              borderRadius: "var(--r-md)",
            }}
          />
        </div>
      ))}
    </div>
  ),
};
