# City Tours

City Tours is the Komoot-like application for the Solid Dataspace stack. It lets Solid users draw
activity-neutral tours, import GPX/GeoJSON, record completed activities without GPS tracking, and
explicitly publish one restricted GeoJSON scenario bundle per Pod at a time.

## City Tours rename

The application, embed package (`@hoelk-f/city-tours`), Docker image
(`son1i/city-tours`) and public routes (`/city-tours/`, `/web/city-tours`)
use the City Tours name. Existing application links redirect to the new routes.
The GitHub repository is [solid-city-tours](https://github.com/hoelk-f/solid-city-tours).
The local checkout directory and GitLab repository remain `solid-tours`; local
Compose mounts and release scripts still point to that checkout. GitHub updates
use its `origin` remote at `https://github.com/hoelk-f/solid-city-tours.git`.

Persisted Pod paths, browser/session keys, onboarding records, catalog identifiers,
RDF vocabulary IRIs and GeoJSON source/derivation identifiers intentionally retain
their existing `solid-tours` values. This is a branding/package migration, not a
data migration: existing tours, publications, consent records and access rules
remain usable by City Tours and the environmental worker.

Publish the City Tours package and Docker image before deploying the updated
Manager and stack. The City Tours CI publishes them under their new names and
dispatches `city-tours-released`; Manager CI waits for the exact package version.
For local development, use the Compose local-package mode to build and link the
renamed embed package directly from the existing checkout.

## Development

```sh
npm install
npm test
npm run build
npm start
```

## Tour workspace and consent

The workspace separates **My tours**, **Discover**, **Activities** and **Sharing**.
Narrow embeds provide a list/map switch; the map keeps its full available width.
Routes can be searched and sorted, and catalog discovery supports name/publisher
and distance filters. A catalog preview stays open until explicitly closed.
Adoption creates a private, editable copy of the name and geometry with its source
reference. It does not subscribe to source updates or import GPX timing.

The untouched initial draft allows import and catalog adoption immediately.
Replacing a changed draft asks whether to save, discard or cancel. Browser reloads
and link navigation warn while an editor is dirty. Only explicit saving can update
an already public route. Map drawing keeps the viewport stable, marks endpoints
and supports undo after clearing. With the map focused, arrow keys pan and Enter
adds a point at its center; **Show route** explicitly fits the view.

Initial setup creates only the private app space. New private-only acknowledgements
use onboarding schema **3**, without public publishing or registry fields. Existing
schema-2 records remain valid. Public sharing has a separate confirmation and
revalidates profile, registry and inbox readiness; the existing public consent
record remains schema 2 for compatibility. Private consent never enables publishing.
The current Catalog SDK also needs a configured public registry for discovery;
the Discover panel explains this if setup is missing.

Recording an activity asks for its date and walking/cycling type in one modal.
Duration from GPX is distinguished from estimates; the derivation assumptions are
shown before saving. Donation preparation previews the fixed set of completed
activities and explains public metadata and the separate access request. The
Sharing panel reports only local publication state and how many newer activities
are excluded. It links to the Manager at `/notifications`; it does not infer
worker access or successful processing. Revocation cannot recall downloaded copies.

The shared modal uses native `showModal()` for a document-wide inert background,
focus containment, Escape and focus restoration, including in the Manager embed.
References: [HTML dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal),
[WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
[React effect cleanup](https://react.dev/reference/react/useEffect),
[Leaflet view methods](https://leafletjs.com/reference.html#map-fitbounds).

The standalone application is served below `/city-tours/` and starts with its own Solid provider
login. After authentication it renders a map-first workspace with a City Tours header and footer.
The package also exports
`@hoelk-f/city-tours/embed` and `@hoelk-f/city-tours/embed.css` for integration in the Dataspace
Manager. The embed reuses the host's authenticated Solid session and intentionally omits its own
login, header and footer so the Manager remains responsible for the surrounding application chrome.

Every authenticated Solid account uses its resolved Pod for private drafts, completed activities,
interests, restricted publication and scenario reset. Mistaken completed entries can be deleted;
an entry included in the active health-data donation remains protected until that scenario is
reset. An unauthenticated embed can still use browser-local storage. The former `demoWebId` embed
prop and runtime setting remain accepted for host compatibility, but no longer restrict Pod access.
If an authenticated Pod cannot be resolved or initialized, the application fails closed and does
not silently store that user's data in the browser.

## Demo contract

- Authenticated users store drafts and completed activities as private resources below
  `solid-tours/` in their resolved Pod; existing Pod state is loaded unchanged. The standalone
  application requires login; an embedding host may still render a guest-local mode when it does
  not provide an identity.
- `Als absolviert eintragen` requires an explicit walking or cycling choice, previews the locally calculated
  values for that choice and then stores an activity in the active local or Solid-Pod storage
  mode. No GPS or Health App resource is read or written.
- The five generic interests are created once per authenticated user in the owner-only
  `solid-tours/interests.ttl`.
- Explicit publication creates one private `runs/{scenarioRunId}/activity.geojson`, a private
  `manifest.ttl`, one restricted Catalog dataset and the public `public/current-run.json` marker.
- Publication requires a public Dataspace registry configured in the user's Solid profile. The
  Catalog API registers the WebID there before reporting success, so the multi-user worker can
  discover the marker. Private-registry-only accounts fail closed for this public aggregate flow.
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

Routes are created by drawing freely or importing GPX/GeoJSON. City Tours does not contact a
routing service. Once a route is marked as completed, its duration is derived using the demo speed
of 4.5 km/h for walking or 15 km/h for cycling. A suitable elapsed time from a GPX track is retained.
Historical completed activities retain their original `osrm` duration provenance without enabling
or invoking a routing service for new routes.

Three real Wuppertal GeoJSON tracks for testing the importer are available in
`public/example-routes/`. In a running standalone stack they can be downloaded below
`/city-tours/example-routes/`. They are derived from versioned OpenStreetMap route relations;
their source, `© OpenStreetMap contributors` attribution and ODbL 1.0 license are documented in
that directory and embedded in every file.

The Catalog SDK dependency is pinned to `0.8.77` for fail-closed restricted publication and
public route-template discovery.
Local stack development can link the sibling Catalog `dist` package directly without changing the
registry-based lockfile.

The CI workflow verifies tests and builds for pushes and pull requests. A push to `main` additionally
publishes the generated `dist` package to GitHub Packages, pushes the versioned and `latest` Docker
images, and dispatches a Dataspace Manager rebuild. Publishing `dist` is intentional: its generated
manifest keeps React and ReactDOM as peer dependencies so an embedded City Tours instance reuses
the Manager's single React runtime.

## Municipal cycling suggestions

Discover includes a compact **All tours / Cycling routes** filter. The Wuppertal
cycling adapter reads the existing public catalog entry
`gesundestal/catalog/ds/e6fe12d6-4690-4986-812b-02155a8f03fc.ttl#it` and follows its
current GeoJSON distribution using anonymous, bounded requests. It does not publish
new route templates or alter the Pod catalog.

The initial allowlist contains named municipal routes. Only an unambiguous continuous
line or a chain of exactly connected segments is offered; no gaps are interpolated.
Network collections, regional extracts, connectors, diversions and proposed variants
are excluded. Some named routes (including the current Nordbahntrasse geometry) contain
separate sections and therefore do not qualify. This checks geometry continuity, not
current on-street accessibility or closures.

Each source feature has a stable identity distinct from its shared dataset URL.
Adoption preserves the source reference through private saving and reload, prevents
duplicate suggestions and re-publication as an original tour, and creates no activity.
Completion and explicit donation use the existing unchanged approval/worker flow.
No municipal template is sent directly to Environmental Monitoring.

Source: [Radrouten Wuppertal, Stadt Wuppertal](https://www.offenedaten-wuppertal.de/dataset/radrouten-wuppertal),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Coordinates are retained;
connected source segments may be reordered/reversed and joined at exact endpoints.
Attribution is displayed in discovery and on the map for previews/private copies.

The donated-tour layer in Environmental Monitoring also credits the municipal route
templates; its shared aggregate does not disclose individual source/owner metadata.

The City Tours map uses `src/wuppertalDistricts.json`, a bundled copy of Environmental Monitoring's `public/wuppertal_bezirke.geojson` (all ten district polygons, unchanged coordinates and properties). Districts render as non-interactive gray areas with solid white borders beneath the routes. To refresh the geometry, replace the JSON with that source dataset.


### Continuous activity donations

New donations carry `donationMode: "continuous"` in private state, the public marker,
and the restricted GeoJSON collection. Future completed activities update the same
resource with `If-Match`, preserving its ACL and access request. Private completion
succeeds independently of donation sync; pending sync is retried while open, on
reconnect and on reopening. Revocation never gets undone by a sync operation.
The existing limits (100 activities, 20,000 points, 2 MiB) remain enforced.

Older snapshots stay unchanged by default. Explicit prototype migration is scoped to
`window.__APP_CONFIG__.cityToursLegacyContinuousWebIds` (exact WebIDs), which the host
manager sets through `APP_CITY_TOURS_LEGACY_CONTINUOUS_WEBIDS_JSON`. The worker must
use the matching `ENVIRONMENTAL_SCENARIO_LEGACY_CONTINUOUS_WEBIDS_JSON` allowlist.
Open City Tours in each authorized account to migrate; no private data is fetched with
service credentials, and existing read permissions and publication audience are retained.
