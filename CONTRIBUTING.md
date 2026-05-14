# Contributing

Thanks for considering a contribution. ISP Watchdog is open source so that
every customer can verify what it measures and what leaves their machine.

## Quick adds (no Rust required)

### Add an ISP

Edit [`src-tauri/src/contracts/mod.rs`](src-tauri/src/contracts/mod.rs) and
append a new `IspEntry { ... }` to `catalog()`. Include the support phone,
the public contact / complaint form URL, and the canonical residential
terms URL.

### Improve an email template

Edit the relevant `.hbs` file in [`templates/`](templates/). The
Handlebars context shape is documented in
[`src-tauri/src/mail/templates.rs`](src-tauri/src/mail/templates.rs).
Stay neutral and factual — the goal is for support agents to act, not get
defensive.

## Build setup

See the "Build from source" section in [README](README.md).

## Code style

- Rust: `cargo fmt` + `cargo clippy --all-targets`.
- TypeScript: keep it dependency-light; we avoid build-time CSS frameworks.

## Issues

For ISP underdelivery reports, please use the "ISP underdelivery report"
issue template. Run **Export evidence** from the app and attach the zip —
that gives maintainers (and other users sharing your ISP) reproducible
data to work with.
