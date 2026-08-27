# Solid Tours

Solid Tours is the Komoot-like demo application for the Solid Dataspace stack. It lets Hannah
Müller draw activity-neutral tours, import GPX/GeoJSON, record completed activities without
GPS tracking, and explicitly publish one restricted GeoJSON scenario bundle at a time.

## Development

```sh
npm install
npm test
npm run build
npm start
```

The standalone application is served below `/solid-tours/` and starts with its own Solid provider
login. After authentication it renders a map-first workspace with a Solid Tours header and footer.
The package also exports
`@hoelk-f/solid-tours/embed` and `@hoelk-f/solid-tours/embed.css` for integration in the Dataspace
Manager. The embed reuses the host's authenticated Solid session and intentionally omits its own
login, header and footer so the Manager remains responsible for the surrounding application chrome.

Every authenticated Solid account can use tour planning, imports, completed activities and a
browser-local history. Mistaken completed entries can be deleted; an entry included in the active
health-data donation remains protected until that scenario is reset. Local state is separated by WebID so accounts sharing a browser cannot see
each other's tours. Existing data from the former unscoped browser key is moved once to the first
account that logs in, after which the shared key is removed. Only the exact configured demo WebID may use Pod-backed storage, interests,
restricted publication and scenario reset. The default is
`https://solid-community-server.tmdt.info/sscon/profile/card#me`. Hosts can override it with
the `demoWebId` embed prop or, before the standalone bundle loads, with
`window.__SOLID_TOURS_CONFIG__ = { demoWebId: "https://...#me" }`. Invalid configuration fails
closed: the local application remains usable while all Pod and scenario features stay hidden.

## Demo contract

- Authenticated non-demo users store drafts and completed activities only in WebID-namespaced
  browser `localStorage`. This local state cannot contain an active scenario run. The standalone
  application requires login; an embedding host may still render a guest-local mode when it does
  not provide an identity.
- For the configured Hannah demo identity, drafts remain private GeoJSON files below
  `solid-tours/drafts/`; existing Pod state is loaded unchanged.
- `Tour gemacht` requires an explicit walking or cycling choice, previews the locally calculated
  values for that choice and then stores an activity in the active local or Hannah-Pod storage
  mode. No GPS or Health App resource is read or written.
- The five generic interests are created only for Hannah, once in the owner-only
  `solid-tours/interests.ttl`.
- Explicit publication creates one private `runs/{scenarioRunId}/activity.geojson`, a private
  `manifest.ttl`, one restricted Catalog dataset and the public `public/current-run.json` marker.
- Reset revokes matching Access Request permissions, archives the request, removes the marker,
  Catalog entry and run resources, while retaining drafts, activities and interests.

All private containers receive a fresh owner-only resource ACL plus an owner-only default ACL.
Existing `state.json`, `interests.ttl`, draft and activity resources are also rewritten to a fresh
owner-only resource ACL before use; inherited or stale Agent, Group and Public grants are not copied.
The run snapshot and manifest use the same policy until an explicit Access Request grants access to
that snapshot. Only `public/current-run.json` is intentionally public-readable; its fresh resource
ACL contains owner-full plus public-read and no other Agent, Group, Origin or Default rules.

Publication rollback removes the marker and Catalog reference before deleting private run files.
If either discovery cleanup fails, the private snapshot and an `activeRun` recovery record are kept
so the idempotent Reset action can retry instead of leaving an untracked Catalog orphan.

Routes are created by drawing freely or importing GPX/GeoJSON. Solid Tours does not contact a
routing service. Once a route is marked as completed, its duration is derived using the demo speed
of 4.5 km/h for walking or 15 km/h for cycling. A suitable elapsed time from a GPX track is retained.
Historical completed activities retain their original `osrm` duration provenance without enabling
or invoking a routing service for new routes.

Three real Wuppertal GeoJSON tracks for testing the importer are available in
`public/example-routes/`. In a running standalone stack they can be downloaded below
`/solid-tours/example-routes/`. They are derived from versioned OpenStreetMap route relations;
their source, `© OpenStreetMap contributors` attribution and ODbL 1.0 license are documented in
that directory and embedded in every file.

The Catalog SDK dependency is pinned to `0.8.63` for privacy-safe restricted Catalog publication.
Local stack development can link the sibling Catalog `dist` package directly without changing the
registry-based lockfile.

The CI workflow verifies tests and builds for pushes and pull requests. A push to `main` additionally
publishes the generated `dist` package to GitHub Packages, pushes the versioned and `latest` Docker
images, and dispatches a Dataspace Manager rebuild. Publishing `dist` is intentional: its generated
manifest keeps React and ReactDOM as peer dependencies so an embedded Solid Tours instance reuses
the Manager's single React runtime.
