# Contributing

Issues and pull requests are welcome, in English or Italian.

## Setup

```bash
npm install
npm test
npm run typecheck
npm run build
```

Before opening a pull request, run all three and `npm run format`.

## Guidelines

- **Packlink responses vary.** Field names change between endpoints and API
  revisions; read them defensively in `src/normalize.ts` and add a test with the
  shape you saw. Please strip personal data and keys from payloads you paste.
- **Units are part of the API.** Grams, millimetres and integer cents in every
  public field, with the unit in the name.
- **Writes must fail loudly.** Anything that creates or cancels a shipment
  throws; never turn a failed write into an empty result.
- **No runtime dependencies** in the core and `next` entry points.
- Tests use a mocked `fetch` (`test/helpers.ts`): no test may call the real
  Packlink API.

## Releasing

Releases are published to npm by `.github/workflows/release.yml` through
trusted publishing, so no npm token is stored in the repository.

1. Add the new version to `CHANGELOG.md` and commit it.
2. Run `npm version patch` (or `minor`): it bumps `package.json` and creates
   the `vX.Y.Z` tag.
3. Run `git push --follow-tags`. The workflow checks that the tag matches
   `package.json`, runs the checks and publishes with provenance.

## Reporting a security issue

Please do not open a public issue: use GitHub's private vulnerability
reporting on the repository (**Security → Report a vulnerability**).
