import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signInMock = vi.fn();
const toastMock = vi.fn();

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en" }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    role: null,
    rolesLoading: false,
    signIn: signInMock,
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/components/layout", () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import Auth from "@/pages/Auth";

function renderLogin() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

describe("login form credential safeguards", () => {
  beforeEach(() => {
    signInMock.mockReset();
    toastMock.mockReset();
  });

  it("uses password-manager-safe autocomplete hints and allows password inspection", () => {
    renderLogin();

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");

    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("shows the real invalid-credentials message and clears the rejected password", async () => {
    signInMock.mockResolvedValue({
      error: { code: "invalid_credentials", message: "A deliberately nonstandard message" },
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ahmedkzaman@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-saved-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(signInMock).toHaveBeenCalledOnce());
    expect(signInMock).toHaveBeenCalledWith(
      "ahmedkzaman@gmail.com",
      "wrong-saved-password",
    );
    await waitFor(() => expect(screen.getByLabelText("Password")).toHaveValue(""));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Invalid email or password. Please type the password again.",
        variant: "destructive",
      }),
    );
  });

  it("clears and re-hides a revealed password when leaving the login form", () => {
    renderLogin();

    const password = screen.getByLabelText("Password");
    fireEvent.change(password, { target: { value: "do-not-retain-me" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to login" }));

    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("recovers from a thrown browser error without erasing a retryable password", async () => {
    signInMock.mockRejectedValue(new Error("simulated browser failure"));
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ahmedkzaman@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "retain-for-retry" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Password")).toHaveValue("retain-for-retry");
    expect(screen.getByRole("button", { name: "Login" })).toBeEnabled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Login failed. Please check your connection and try again.",
        variant: "destructive",
      }),
    );
  });
});
