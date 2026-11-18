import { describe, expect, it } from "vitest";

import {
  MAIL_PROVIDER_PRESETS,
  getProviderPreset,
  guessProviderForAddress,
} from "@/lib/mail/providers";

describe("mail provider presets", () => {
  it("offers the documented provider set plus custom IMAP", () => {
    const ids = MAIL_PROVIDER_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(["gmail", "microsoft", "yahoo", "icloud", "fastmail", "zoho", "custom"]);
  });

  it("uses implicit TLS on every preset IMAP server", () => {
    for (const preset of MAIL_PROVIDER_PRESETS) {
      if (!preset.imap) continue;
      expect(preset.imap.port, preset.id).toBe(993);
      expect(preset.imap.secure, preset.id).toBe(true);
    }
  });

  it("preselects a provider from a consumer address", () => {
    expect(guessProviderForAddress("someone@gmail.com")?.id).toBe("gmail");
    expect(guessProviderForAddress("SOMEONE@GOOGLEMAIL.COM")?.id).toBe("gmail");
    expect(guessProviderForAddress("owner@outlook.com")?.id).toBe("microsoft");
    expect(guessProviderForAddress("owner@icloud.com")?.id).toBe("icloud");
    expect(guessProviderForAddress("owner@fastmail.com")?.id).toBe("fastmail");
  });

  it("returns no guess for unknown or malformed addresses", () => {
    expect(guessProviderForAddress("owner@example.com")).toBeUndefined();
    expect(guessProviderForAddress("not-an-address")).toBeUndefined();
    expect(guessProviderForAddress("")).toBeUndefined();
  });

  it("looks presets up by id", () => {
    expect(getProviderPreset("yahoo")?.auth).toBe("imap");
    expect(getProviderPreset("gmail")?.auth).toBe("oauth");
    expect(getProviderPreset("missing")).toBeUndefined();
  });
});
