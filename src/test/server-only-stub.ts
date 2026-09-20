// Vitest stub for the `server-only` package. The real module throws when
// imported outside the React server runtime; the server modules under test
// import it as an import-safety marker, so tests alias it to this no-op.
const serverOnlyStub = {};

export default serverOnlyStub;
