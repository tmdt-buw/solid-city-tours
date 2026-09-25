import App from "../App";
import type { CityToursSession } from "../embedAuth";

export type { CityToursSession } from "../embedAuth";

export type CityToursEmbedProps = {
  webId?: string | null;
  /** @deprecated Pod access is available to every authenticated Solid identity. */
  demoWebId?: string | null;
  language?: string | null;
  session?: CityToursSession | null;
};

export default function CityToursEmbed({
  webId = null,
  demoWebId = null,
  language = null,
  session = null,
}: CityToursEmbedProps) {
  return (
    <App
      embedded
      webIdOverride={webId}
      demoWebIdOverride={demoWebId}
      language={language}
      session={session}
    />
  );
}
