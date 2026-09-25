# City Tours example routes

These three GeoJSON files contain real walking and cycling routes in and around Wuppertal.
They were generated on 2026-08-20 from the listed OpenStreetMap route relations. Waymarked
Trails assembled the ordered relation members; the coordinates were converted from EPSG:3857
to WGS84 and duplicate way-boundary points were removed without changing the route.

| File | Tour | Activity | Geometry | OpenStreetMap source |
| --- | --- | --- | --- | --- |
| `nordbahntrasse.geojson` | Radschnellweg Nordbahntrasse, 23.250 km | Cycling | 745 points, continuous | [relation 2969577, version 77](https://www.openstreetmap.org/relation/2969577) |
| `beyenburger-stausee-a2.geojson` | Beyenburger Stausee Rundweg A2, 4.956 km | Walking | 323 points, continuous | [relation 303340, version 38](https://www.openstreetmap.org/relation/303340) |
| `ronsdorfer-talsperre-a2.geojson` | Rundweg A2 Ronsdorfer Talsperre, 6.885 km | Walking | 343 points, continuous and closed | [relation 551355, version 37](https://www.openstreetmap.org/relation/551355) |

The Beyenburger relation has no internal geometry gap, but its two endpoints are about 254 m
apart even though OpenStreetMap currently tags it as `roundtrip=yes`. The export deliberately
does not invent a connector.

The data is licensed under the
[Open Data Commons Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1.0/).
When the routes are used or redistributed, retain the source and license metadata and show
`© OpenStreetMap contributors` with a link to the
[OpenStreetMap copyright page](https://www.openstreetmap.org/copyright). Each GeoJSON feature
also contains the exact relation version, timestamp, source URL, attribution and license URL.

The tracks are test data, not a guarantee that a route is currently open, safe or unchanged.
