import { z } from "zod";

/**
 * Zod schema pre webhook lead input.
 *
 * Source-agnostic — Facebook Lead Ads, web form, Google Lead Form,
 * všetky posielajú túto štruktúru (s vlastnými polami v `data`).
 */
export const LeadWebhookInputSchema = z
  .object({
    name: z
      .string()
      .min(2, "Meno musí mať aspoň 2 znaky")
      .max(120, "Meno je príliš dlhé"),
    phone: z
      .string()
      .min(7, "Telefón je príliš krátky")
      .max(30, "Telefón je príliš dlhý")
      .optional()
      .or(z.literal("")),
    email: z
      .string()
      .email("Nevalidný email")
      .max(200)
      .optional()
      .or(z.literal("")),
    source_campaign: z.string().max(120).optional(),
    // data je voľný JSON pre source-specific polia (plocha, lokalita, atď.).
    // 8 KB cap zabráni JSON bombingu (útočník nainflatne row do MB cez webhook).
    data: z
      .record(z.unknown())
      .optional()
      .refine((d) => !d || JSON.stringify(d).length < 8000, {
        message: "data JSON je príliš veľký (max 8 KB)",
      }),
    priority: z.enum(["low", "medium", "high"]).optional(),
    value_estimate: z.number().nonnegative().max(1_000_000).optional(),
  })
  .refine((d) => Boolean(d.phone) || Boolean(d.email), {
    message: "Aspoň jeden z phone alebo email musí byť vyplnený",
  });

export type LeadWebhookInput = z.infer<typeof LeadWebhookInputSchema>;
