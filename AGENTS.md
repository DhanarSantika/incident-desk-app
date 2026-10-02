cat > AGENTS.md <<'EOF'
# Project instructions

## Reasoning
- Use terse internal reasoning.
- Do not restate the task internally.
- Think: goal -> constraints -> implementation -> verification.
- Stop reasoning once a reliable implementation is clear.
- Do not explore unnecessary alternatives.

## Communication
- User-facing explanations must remain fluent, normal human language.
- Keep status updates concise.

## Coding
- Inspect existing files before editing.
- Prefer the smallest correct change.
- Do not rewrite working files unnecessarily.
- Do not over-engineer.
- Avoid unnecessary abstractions and dependencies.
- Verify behavior after meaningful changes.

## Project constraints
- This project must remain a fully static website.
- No backend.
- No database server.
- No framework.
- No bundler.
- No npm dependencies.
- Use only HTML, CSS, and vanilla JavaScript.
- Application state must persist using localStorage.
- The project must work when served by a basic static HTTP server.
- Keep the entire project small enough to comfortably fit within a 64K model context.
- Prefer no external assets or CDNs.
EOF
