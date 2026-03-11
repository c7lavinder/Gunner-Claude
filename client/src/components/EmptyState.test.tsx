import { render, screen } from "@testing-library/react";
import { Phone } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders with a title prop", () => {
    render(
      <EmptyState
        icon={Phone}
        title="No calls yet"
        description="Your calls will appear here."
      />
    );
    expect(screen.getByText("No calls yet")).toBeInTheDocument();
  });

  it("renders with a description prop", () => {
    render(
      <EmptyState
        icon={Phone}
        title="No calls yet"
        description="Your calls will appear here."
      />
    );
    expect(screen.getByText("Your calls will appear here.")).toBeInTheDocument();
  });
});
