import { z } from "zod";

/** Only browser-safe public configuration belongs in this module. */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL must be a valid URL").optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Client-safe parse; only `NEXT_PUBLIC_` values are copied in. */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: source.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error("Invalid public environment configuration");
  }

  if (
    source.NODE_ENV === "production" &&
    parsed.data.NEXT_PUBLIC_APP_URL &&
    new URL(parsed.data.NEXT_PUBLIC_APP_URL).protocol !== "https:"
  ) {
    throw new Error("NEXT_PUBLIC_APP_URL must use HTTPS in production");
  }

  return parsed.data;
}
