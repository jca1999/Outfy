---
name: OpenAPI email validation
description: The workspace's generated Zod contract currently cannot consume Orval's top-level email validator.
---

Avoid relying on OpenAPI `format: email` for generated request validators in this workspace; validate email strings explicitly at the server boundary instead.

**Why:** The installed Zod version is incompatible with the top-level `zod.email()` expression emitted by the current Orval configuration, so codegen can succeed while the chained library typecheck fails.

**How to apply:** Keep email fields as strings in the OpenAPI contract when using this generator, and enforce the email shape in the owning API route or a shared boundary validator.