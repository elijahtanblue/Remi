# Remi Website

This folder contains the standalone marketing website and does not participate in the main monorepo build graph.

## Local commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

## Notes

- Runs independently from the product apps in `apps/`
- Keeps its own dependencies and lockfile in `website/`
- Uses the Remi brand assets copied into `website/public/brand`
