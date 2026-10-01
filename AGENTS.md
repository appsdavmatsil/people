<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Local Development

Assigned development port: 3010
Local URL: [http://people.localhost](http://people.localhost)

Rules:

- Always run this project on port 3010.
- Never change the development port.
- Never kill Node processes globally.
- Never use `killall node`, `pkill node`, or equivalent global commands.
- Never terminate development servers belonging to other repositories.
- If port 3010 is occupied, identify the process using that specific port before taking action.
- Other development projects may be running simultaneously on this machine.
