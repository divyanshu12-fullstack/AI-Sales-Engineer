import { z } from 'zod';

export const browserSessionRequestSchema = z.strictObject({ consent: z.literal(true) });
// These are ephemeral call credentials, never account/API credentials. Strip unknown provider fields.
export const browserSessionSchema = z.object({
  run_id: z.uuid(),
  agent_id: z.uuid(),
  sip_username: z.string().min(1).max(1000),
  sip_password: z.string().min(1).max(2000),
  sip_domain: z.string().min(1).max(1000),
  wss_url: z.url().refine((url) => url.startsWith('wss://')),
  sip_register: z.boolean(),
  expires_in: z.number().int().positive().max(300),
  ice_servers: z
    .array(
      z.object({
        urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        username: z.string().optional(),
        credential: z.string().optional(),
      }),
    )
    .max(20),
});
export type BrowserSession = z.infer<typeof browserSessionSchema>;
